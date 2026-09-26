<#
  mouselog.ps1 — the creator's real mouse, written down, for TESTING ONLY.

  The product never sees this. It exists so that a test recording comes with
  the truth about it: every press, where and when, and the path the pointer
  actually took. score.mjs lines this log up with the recording and says what
  the pipeline got right and wrong, without anybody labelling frames by hand.

  Mouse only: moves (at most ~120 a second), button presses and releases, and
  the wheel. No keys, nothing else. Written to a local file and nowhere else.

  Usage (a PowerShell window, before starting the recording):
      powershell -ExecutionPolicy Bypass -File mouselog.ps1
      powershell -ExecutionPolicy Bypass -File mouselog.ps1 -Out C:\logs\run1.jsonl
  Record the demo in Clipo as usual, then come back and press Ctrl+C.
#>
param(
  [string]$Out = (Join-Path (Get-Location) ("mouselog-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".jsonl"))
)

Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class ClipoMouseLog {
  delegate IntPtr Proc(int nCode, IntPtr wParam, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)] struct PT { public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] struct Info { public PT pt; public uint data; public uint flags; public uint time; public IntPtr extra; }

  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  static Proc keep = Hook;
  static IntPtr hook = IntPtr.Zero;
  static StreamWriter w;
  static Stopwatch clock;
  static double lastMove = -1;

  public static void Run(string path) {
    // Physical pixels, whatever the display scaling: score.mjs fits the scale
    // between these and the recording, so all it needs is that they are steady.
    SetProcessDPIAware();
    w = new StreamWriter(path, false);
    w.AutoFlush = true;
    clock = Stopwatch.StartNew();
    Screen s = Screen.PrimaryScreen;
    w.WriteLine("{\"start_utc\":\"" + DateTime.UtcNow.ToString("o") + "\",\"screen\":[" + s.Bounds.Width + "," + s.Bounds.Height + "],\"virtual\":[" +
      SystemInformation.VirtualScreen.X + "," + SystemInformation.VirtualScreen.Y + "," + SystemInformation.VirtualScreen.Width + "," + SystemInformation.VirtualScreen.Height + "]}");
    hook = SetWindowsHookEx(14, keep, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) throw new Exception("could not install the mouse hook (" + Marshal.GetLastWin32Error() + ")");
    Application.Run();
  }

  static IntPtr Hook(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      Info i = (Info)Marshal.PtrToStructure(lParam, typeof(Info));
      double t = clock.Elapsed.TotalMilliseconds;
      string e = null;
      string b = "";
      switch ((int)wParam) {
        case 0x200: e = "move"; break;
        case 0x201: e = "down"; b = "left"; break;
        case 0x202: e = "up"; b = "left"; break;
        case 0x204: e = "down"; b = "right"; break;
        case 0x205: e = "up"; b = "right"; break;
        case 0x207: e = "down"; b = "middle"; break;
        case 0x208: e = "up"; b = "middle"; break;
        case 0x20A: e = "wheel"; b = ((short)(i.data >> 16)).ToString(); break;
      }
      if (e == "move") {
        if (lastMove >= 0 && t - lastMove < 8) e = null;
        else lastMove = t;
      }
      if (e != null) {
        w.WriteLine("{\"t\":" + t.ToString("F1", System.Globalization.CultureInfo.InvariantCulture) + ",\"e\":\"" + e + "\",\"x\":" + i.pt.x + ",\"y\":" + i.pt.y +
          (b.Length > 0 ? ",\"b\":\"" + b + "\"" : "") + "}");
      }
    }
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }
}
"@

Write-Host ""
Write-Host "  Logging the mouse to $Out"
Write-Host "  Record your demo now. Press Ctrl+C here when you have stopped recording."
Write-Host ""
[ClipoMouseLog]::Run($Out)
