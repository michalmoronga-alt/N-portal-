// N-portal – hudobný pracovník (C#). Beží trvalo pod službou (Node).
// Číta Windows Media Session (GlobalSystemMediaTransportControlsSessionManager) a na stdout píše JSON riadky:
//   {"type":"ready"}
//   {"type":"media","available":true,"app":"Chrome","status":"Playing","title":"…","artist":"…","album":"…","thumb":"data:image/png;base64,…"}
//   {"type":"media","available":false}
//   {"type":"ack","action":"toggle","ok":true}
// Povely číta zo stdin po riadkoch: play | pause | toggle | next | prev
// Kompilácia: helper/build.ps1 (csc + Windows *.winmd zo System32\WinMetadata, bez Windows SDK).
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

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

        while (true)
        {
            try
            {
                // --- povely ---
                string cmd = null;
                lock (gate) if (commands.Count > 0) cmd = commands.Dequeue();
                if (cmd != null)
                {
                    var cs = mgr.GetCurrentSession();
                    bool ok = false;
                    string err = null;
                    if (cs == null) err = "ziadny prehravac";
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
                    Thread.Sleep(120);
                }

                // --- stav prehrávania ---
                var s = mgr.GetCurrentSession();
                if (s == null)
                {
                    if (lastKey != "none") { lastKey = "none"; Emit("{\"type\":\"media\",\"available\":false}"); }
                }
                else
                {
                    string status = s.GetPlaybackInfo().PlaybackStatus.ToString();
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
                    }
                }
            }
            catch (Exception ex)
            {
                Emit("{\"type\":\"error\",\"message\":" + J(ex.GetType().Name + ": " + ex.Message) + "}");
                lastKey = "";
                Thread.Sleep(1000);
            }
            Thread.Sleep(POLL_MS);
        }
    }
}
