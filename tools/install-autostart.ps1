# N-portal – automatický štart služby po prihlásení do Windows (Plánovač úloh, bez okna).
# Spustiť raz: powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1
# Odstránenie: tools\uninstall-autostart.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$vbs = Join-Path $PSScriptRoot 'service-hidden.vbs'
$taskName = 'N-portal service'   # bez diakritiky: PowerShell 5.1 číta .ps1 bez BOM v ANSI kódovaní

if (-not (Test-Path (Join-Path $root 'service\dist\index.js'))) {
  throw 'Služba nie je zostavená – najprv spusti tools\start-service.ps1 (alebo npm run build v service/).'
}

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory (Join-Path $root 'service')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = 'PT15S'   # počkať, kým nabehne sieť a Rainmeter
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Úloha '$taskName' zaregistrovaná: spustí sa 15 s po prihlásení používateľa $env:USERNAME."
Write-Host 'Spustiť hneď:   Start-ScheduledTask -TaskName "N-portal service"'
Write-Host 'Stav:           Get-ScheduledTask -TaskName "N-portal service" | Get-ScheduledTaskInfo'
