' N-portal – spustí službu bez okna (Plánovač úloh ju volá cez wscript.exe).
' Výstup ide do %USERPROFILE%\.n-portal\service.log
Option Explicit
Dim sh, fso, root, svc, logDir, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
svc = root & "\service"
logDir = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.n-portal"
If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir
cmd = "cmd.exe /c cd /d """ & svc & """ && node dist\index.js >> """ & logDir & "\service.log"" 2>&1"
' Čakať, kým služba beží: Plánovač tak vidí úlohu ako bežiacu a pri páde (nenulový kód) ju reštartuje.
Dim code
code = sh.Run(cmd, 0, True)
WScript.Quit code
