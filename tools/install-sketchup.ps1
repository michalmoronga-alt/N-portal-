# N-portal – nainštaluje (skopíruje) Ruby prijímač do SketchUpu 2026. Existujúce pluginy ani Engine nemení.
# Odinštalovanie: zmazať nportal_e0.rb a priečinok nportal_e0 z Plugins, prípadne C:\Users\<meno>\.n-portal
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'sketchup'
$dst = Join-Path $env:APPDATA 'SketchUp\SketchUp 2026\SketchUp\Plugins'
if (-not (Test-Path $dst)) { throw "SketchUp 2026 Plugins priečinok neexistuje: $dst" }
Copy-Item (Join-Path $src 'nportal_e0.rb') $dst -Force
New-Item -ItemType Directory -Force (Join-Path $dst 'nportal_e0') | Out-Null
Copy-Item (Join-Path $src 'nportal_e0\main.rb') (Join-Path $dst 'nportal_e0') -Force
Write-Host "Prijímač nainštalovaný do: $dst"
Write-Host 'Načíta sa pri štarte SketchUpu (Extensions > N-portal E0). V bežiacom SketchUpe: Ruby konzola →'
Write-Host "  load '$(($dst -replace '\\','/'))/nportal_e0/main.rb'"
