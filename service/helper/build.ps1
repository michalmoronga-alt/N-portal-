# Skompiluje media-worker.exe z media-worker.cs pomocou csc z .NET Framework 4.x (je v každom Windows).
# Windows Runtime typy berie zo systémových metadát C:\Windows\System32\WinMetadata – bez Windows SDK.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$out = Join-Path (Split-Path $here -Parent) 'bin'
New-Item -ItemType Directory -Force $out | Out-Null
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$wm = Join-Path $env:WINDIR 'System32\WinMetadata'
$sr = Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Runtime\v4.0_4.0.0.0__b03f5f7f11d50a3a\System.Runtime.dll'
if (-not (Test-Path $csc)) { throw "csc.exe sa nenašiel: $csc" }
& $csc /nologo /target:exe /platform:anycpu /optimize+ /out:"$out\media-worker.exe" `
  "/r:$wm\Windows.Media.winmd" "/r:$wm\Windows.Storage.winmd" "/r:$wm\Windows.Foundation.winmd" "/r:$sr" `
  (Join-Path $here 'media-worker.cs')
if ($LASTEXITCODE -ne 0) { throw 'Kompilácia media-worker.exe zlyhala.' }
Write-Host "OK: $out\media-worker.exe"

# sonda aktívneho okna (len Win32, bez WinRT)
& $csc /nologo /target:exe /platform:anycpu /optimize+ /out:"$out\fg-worker.exe" (Join-Path $here 'fg-worker.cs')
if ($LASTEXITCODE -ne 0) { throw 'Kompilácia fg-worker.exe zlyhala.' }
Write-Host "OK: $out\fg-worker.exe"
