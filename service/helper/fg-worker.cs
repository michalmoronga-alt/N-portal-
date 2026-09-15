// N-portal – sonda aktívneho okna. Beží trvalo pod službou (Node).
// Každých 200 ms zistí okno v popredí; pri zmene vypíše JSON riadok:
//   {"type":"fg","app":"SketchUp","pid":115688,"title":"medzihradský 5* - SketchUp 2026","cls":"Qt691QWindowIcon"}
// Nečíta obsah okien ani históriu, len proces a titulok. Skončí, keď služba zavrie stdout.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class FgWorker
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);

    static string J(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"') sb.Append("\\\"");
            else if (c == '\\') sb.Append("\\\\");
            else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    static int Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.Out.WriteLine("{\"type\":\"ready\"}");
        Console.Out.Flush();
        string lastKey = null;
        while (true)
        {
            try
            {
                IntPtr h = GetForegroundWindow();
                uint pid;
                GetWindowThreadProcessId(h, out pid);
                var tb = new StringBuilder(512); GetWindowText(h, tb, 512);
                var cb = new StringBuilder(256); GetClassName(h, cb, 256);
                string title = tb.ToString(), cls = cb.ToString();
                string key = pid + "|" + title;
                if (key != lastKey)
                {
                    lastKey = key;
                    string app = "";
                    try { app = Process.GetProcessById((int)pid).ProcessName; } catch { }
                    Console.Out.WriteLine("{\"type\":\"fg\",\"app\":" + J(app) + ",\"pid\":" + pid + ",\"title\":" + J(title) + ",\"cls\":" + J(cls) + "}");
                    Console.Out.Flush();
                }
            }
            catch (System.IO.IOException) { return 0; }
            catch (Exception ex)
            {
                Console.Out.WriteLine("{\"type\":\"error\",\"message\":" + J(ex.Message) + "}");
                Console.Out.Flush();
                Thread.Sleep(1000);
            }
            Thread.Sleep(200);
        }
    }
}
