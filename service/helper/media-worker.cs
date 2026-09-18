// N-portal – hudobný pracovník (C#). Beží trvalo pod službou (Node).
// Číta Windows Media Session (GlobalSystemMediaTransportControlsSessionManager) a na stdout píše JSON riadky:
//   {"type":"ready"}
//   {"type":"media","available":true,"app":"Chrome","status":"Playing","title":"…","artist":"…","album":"…","thumb":"data:image/png;base64,…"}
//   {"type":"media","available":false}
//   {"type":"timeline","position":12345,"duration":234567,"rate":1,"canSeek":true}   (null = prehrávač nehlási)
//   {"type":"ack","action":"toggle","ok":true}
// Povely číta zo stdin po riadkoch: play | pause | toggle | next | prev | vol <0-100> | mute | unmute | seek <ms>
// Kompilácia: helper/build.ps1 (csc + Windows *.winmd zo System32\WinMetadata, bez Windows SDK).
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

// ---- Core Audio (hlasitosť PC) – minimálne COM rozhrania ----
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume
{
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float db, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float db);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float db);
    int GetChannelVolumeLevelScalar(uint ch, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

static class PcVolume
{
    static IAudioEndpointVolume vol;
    static IAudioEndpointVolume Get()
    {
        if (vol != null) return vol;
        var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
        IMMDevice dev;
        en.GetDefaultAudioEndpoint(0 /*eRender*/, 1 /*eMultimedia*/, out dev);
        var iid = typeof(IAudioEndpointVolume).GUID;
        object o;
        dev.Activate(ref iid, 23 /*CLSCTX_ALL*/, IntPtr.Zero, out o);
        vol = (IAudioEndpointVolume)o;
        return vol;
    }
    public static void Reset() { vol = null; }
    public static int Level() { float f; Get().GetMasterVolumeLevelScalar(out f); return (int)Math.Round(f * 100); }
    public static bool Muted() { bool m; Get().GetMute(out m); return m; }
    public static void Set(int pct)
    {
        var g = Guid.Empty;
        float f = Math.Max(0, Math.Min(100, pct)) / 100f;
        Get().SetMasterVolumeLevelScalar(f, ref g);
        if (pct > 0 && Muted()) Get().SetMute(false, ref g);
    }
    public static void Mute(bool m) { var g = Guid.Empty; Get().SetMute(m, ref g); }
}

static class MediaWorker
{
    const int POLL_MS = 250;
    static readonly Queue<string> commands = new Queue<string>();
    static readonly object gate = new object();

    static TR Wait<TR>(IAsyncOperation<TR> op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(5);
        if (op.Status == AsyncStatus.Error) throw op.ErrorCode;
        return op.GetResults();
    }

    static string J(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
                    break;
            }
        }
        return sb.Append('"').ToString();
    }

    static void Emit(string json)
    {
        Console.Out.WriteLine(json);
        Console.Out.Flush();
    }

    static void StdinLoop()
    {
        string line;
        try
        {
            while ((line = Console.In.ReadLine()) != null)
            {
                line = line.Trim().ToLowerInvariant();
                if (line.Length == 0) continue;
                lock (gate) commands.Enqueue(line);
            }
        }
        catch { }
        Environment.Exit(0); // služba zavrela stdin → skončiť
    }

    static string ReadThumb(GlobalSystemMediaTransportControlsSessionMediaProperties p)
    {
        try
        {
            if (p.Thumbnail == null) return null;
            var ras = Wait(p.Thumbnail.OpenReadAsync());
            if (ras.Size == 0 || ras.Size > 4 * 1024 * 1024) return null;
            var reader = new DataReader(ras.GetInputStreamAt(0));
            uint n = Wait(reader.LoadAsync((uint)ras.Size));
            var bytes = new byte[n];
            reader.ReadBytes(bytes);
            string ct = string.IsNullOrEmpty(ras.ContentType) ? "image/jpeg" : ras.ContentType;
            return "data:" + ct + ";base64," + Convert.ToBase64String(bytes);
        }
        catch { return null; }
    }

    /// <summary>
    /// Pozícia/dĺžka skladby z GetTimelineProperties(). `pos`/`dur` sú v ms, -1 = prehrávač nehlási.
    /// Pozícia platí k okamihu volania: ak relácia hrá, dopočíta sa čas od `LastUpdatedTime`
    /// (Windows hodnotu sám neposúva; ak ju prehrávač obnovuje často, dopočet je zanedbateľný).
    /// </summary>
    static void ReadTimeline(GlobalSystemMediaTransportControlsSession s, bool playing, out long pos, out long dur, out double rate, out bool canSeek)
    {
        pos = -1; dur = -1; rate = 1; canSeek = false;
        try
        {
            var info = s.GetPlaybackInfo();
            if (info == null) return;
            var ctl = info.Controls;
            canSeek = ctl.IsPlaybackPositionEnabled;
            var r = info.PlaybackRate;
            if (r.HasValue && r.Value > 0) rate = r.Value;

            var t = s.GetTimelineProperties();
            if (t == null) return;
            if (t.LastUpdatedTime.Ticks <= 0) return; // prehrávač pozíciu vôbec nehlási

            if (t.EndTime > t.StartTime) dur = (long)(t.EndTime - t.StartTime).TotalMilliseconds;
            long p = (long)(t.Position - t.StartTime).TotalMilliseconds;
            if (playing)
            {
                double age = (DateTimeOffset.UtcNow - t.LastUpdatedTime).TotalMilliseconds;
                // niektoré prehrávače (napr. Chrome na pozadí) hlásenie neobnovujú aj desiatky sekúnd;
                // strop 60 s bráni nezmyselnému dopočtu pri pokazenom čase hlásenia
                if (age > 0 && age < 60000) p += (long)(age * rate);
            }
            if (p < 0) p = 0;
            if (dur >= 0 && p > dur) p = dur;
            pos = p;
        }
        catch { }
    }

    static long NowMs() { return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond; }

    static int Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.InputEncoding = new UTF8Encoding(false);
        var mgr = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
        Emit("{\"type\":\"ready\"}");

        var stdin = new Thread(StdinLoop) { IsBackground = true };
        stdin.Start();

        string lastKey = "";
        string lastThumbKey = "";
        string lastThumb = null;
        int lastVol = -1;
        bool lastMute = false;
        // priebeh skladby
        long tlPos = -1, tlDur = -1;
        double tlRate = 1;
        bool tlSeek = false;
        long tlAt = 0;          // kedy sme naposledy hlásili pozíciu (ms)
        bool tlForce = true;    // vynútiť hlásenie (nová skladba, povel, štart)
        bool tlPlaying = false; // hrá sa (kvôli zarovnaniu hlásení na 1 s)

        while (true)
        {
            try
            {
                // --- hlasitosť PC: hlásiť pri zmene (aj keď ju zmení používateľ na PC) ---
                try
                {
                    int lv = PcVolume.Level(); bool lm = PcVolume.Muted();
                    if (lv != lastVol || lm != lastMute)
                    {
                        lastVol = lv; lastMute = lm;
                        Emit("{\"type\":\"volume\",\"level\":" + lv + ",\"muted\":" + (lm ? "true" : "false") + "}");
                    }
                }
                catch { PcVolume.Reset(); }

                // --- povely: vybrať celý rad; z povelov hlasitosti platí len posledný (žiadne dobiehanie) ---
                string cmd = null;
                lock (gate)
                {
                    string lastVolCmd = null;
                    var others = new Queue<string>();
                    while (commands.Count > 0)
                    {
                        var c = commands.Dequeue();
                        if (c.StartsWith("vol ")) lastVolCmd = c; else others.Enqueue(c);
                    }
                    if (lastVolCmd != null) others.Enqueue(lastVolCmd);
                    if (others.Count > 0) { cmd = others.Dequeue(); while (others.Count > 0) commands.Enqueue(others.Dequeue()); }
                }
                if (cmd != null && (cmd.StartsWith("vol ") || cmd == "mute" || cmd == "unmute"))
                {
                    // hlasitosť PC (nezávislá od prehrávača)
                    try
                    {
                        if (cmd == "mute") PcVolume.Mute(true);
                        else if (cmd == "unmute") PcVolume.Mute(false);
                        else { int pct; if (int.TryParse(cmd.Substring(4).Trim(), out pct)) PcVolume.Set(pct); }
                        Emit("{\"type\":\"ack\",\"action\":" + J(cmd) + ",\"ok\":true}");
                    }
                    catch (Exception ex) { PcVolume.Reset(); Emit("{\"type\":\"ack\",\"action\":" + J(cmd) + ",\"ok\":false,\"error\":" + J(ex.Message) + "}"); }
                    lastVol = -1; // vynútiť hlásenie
                }
                else if (cmd != null)
                {
                    var cs = mgr.GetCurrentSession();
                    bool ok = false;
                    string err = null;
                    if (cs == null) err = "ziadny prehravac";
                    else if (cmd.StartsWith("seek "))
                    {
                        long ms;
                        if (long.TryParse(cmd.Substring(5).Trim(), out ms) && ms >= 0)
                            ok = Wait(cs.TryChangePlaybackPositionAsync(ms * TimeSpan.TicksPerMillisecond));
                        else err = "zly cas";
                    }
                    else
                    {
                        switch (cmd)
                        {
                            case "play": ok = Wait(cs.TryPlayAsync()); break;
                            case "pause": ok = Wait(cs.TryPauseAsync()); break;
                            case "toggle": ok = Wait(cs.TryTogglePlayPauseAsync()); break;
                            case "next": ok = Wait(cs.TrySkipNextAsync()); break;
                            case "prev": ok = Wait(cs.TrySkipPreviousAsync()); break;
                            default: err = "neznamy povel"; break;
                        }
                    }
                    Emit("{\"type\":\"ack\",\"action\":" + J(cmd) + ",\"ok\":" + (ok ? "true" : "false") + (err != null ? ",\"error\":" + J(err) : "") + "}");
                    lastKey = ""; // vynútiť nové načítanie stavu
                    tlForce = true;
                    Thread.Sleep(120);
                }

                // --- stav prehrávania ---
                var s = mgr.GetCurrentSession();
                if (s == null)
                {
                    tlPlaying = false;
                    if (lastKey != "none")
                    {
                        lastKey = "none";
                        Emit("{\"type\":\"media\",\"available\":false}");
                        tlPos = -1; tlDur = -1; tlRate = 1; tlSeek = false; tlAt = 0; tlForce = true;
                    }
                }
                else
                {
                    string status = s.GetPlaybackInfo().PlaybackStatus.ToString();
                    bool playing = status == "Playing";
                    tlPlaying = playing;
                    var p = Wait(s.TryGetMediaPropertiesAsync());
                    string app = s.SourceAppUserModelId ?? "";
                    string key = app + "|" + status + "|" + p.Title + "|" + p.Artist;
                    if (key != lastKey)
                    {
                        lastKey = key;
                        string thumbKey = app + "|" + p.Title + "|" + p.Artist + "|" + p.AlbumTitle;
                        if (thumbKey != lastThumbKey)
                        {
                            lastThumbKey = thumbKey;
                            lastThumb = ReadThumb(p);
                        }
                        Emit("{\"type\":\"media\",\"available\":true,\"app\":" + J(app) + ",\"status\":" + J(status) +
                             ",\"title\":" + J(p.Title) + ",\"artist\":" + J(p.Artist) + ",\"album\":" + J(p.AlbumTitle) +
                             ",\"thumb\":" + J(lastThumb) + "}");
                        tlForce = true; // pozíciu poslať hneď za novým stavom
                    }

                    // --- priebeh skladby: pri prehrávaní 1× za sekundu, inak len pri zmene/skoku ---
                    long pos, dur; double rate; bool canSeek;
                    ReadTimeline(s, playing, out pos, out dur, out rate, out canSeek);
                    long now = NowMs();
                    bool known = pos >= 0;
                    bool changed = dur != tlDur || canSeek != tlSeek || Math.Abs(rate - tlRate) > 0.01 || known != (tlPos >= 0);
                    bool jumped = false;
                    if (!changed && known && tlAt > 0)
                    {
                        long expected = tlPos + (playing ? (long)((now - tlAt) * tlRate) : 0);
                        jumped = Math.Abs(pos - expected) > 1500;
                    }
                    bool periodic = playing && known && tlAt > 0 && now - tlAt >= 1000;
                    if (tlForce || changed || jumped || periodic || tlAt == 0)
                    {
                        tlPos = pos; tlDur = dur; tlRate = rate; tlSeek = canSeek; tlAt = now; tlForce = false;
                        Emit("{\"type\":\"timeline\",\"position\":" + (pos >= 0 ? pos.ToString() : "null") +
                             ",\"duration\":" + (dur >= 0 ? dur.ToString() : "null") +
                             ",\"rate\":" + rate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) +
                             ",\"canSeek\":" + (canSeek ? "true" : "false") + "}");
                    }
                }
            }
            catch (Exception ex)
            {
                Emit("{\"type\":\"error\",\"message\":" + J(ex.GetType().Name + ": " + ex.Message) + "}");
                lastKey = "";
                Thread.Sleep(1000);
            }
            int pending; lock (gate) pending = commands.Count;
            int nap = pending > 0 ? 10 : POLL_MS;
            if (pending == 0 && tlPlaying && tlAt > 0)
            {
                // počas prehrávania sa zobuď práve na ďalšie hlásenie pozície (inak by vychádzalo ~1,2 s)
                long due = tlAt + 1000 - NowMs();
                if (due > 10 && due < nap) nap = (int)due;
            }
            Thread.Sleep(nap);
        }
    }
}
