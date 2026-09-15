# N-portal – spustenie lokálnej služby (PC). Zostaví PWA a službu, ak treba, a spustí ju.
# Použitie: powershell -ExecutionPolicy Bypass -File tools\start-service.ps1 [-NoBuild]
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$app = Join-Path $root 'app'
$svc = Join-Path $root 'service'

if (-not $NoBuild) {
  if (-not (Test-Path (Join-Path $app 'node_modules'))) { Push-Location $app; npm install; Pop-Location }
  if (-not (Test-Path (Join-Path $svc 'node_modules'))) { Push-Location $svc; npm install; Pop-Location }
  Push-Location $app; npm run build; Pop-Location
  Push-Location $svc; npm run build; Pop-Location
}

# ak už služba beží na porte 8790, ukončiť ju (jedna inštancia)
$cfgFile = Join-Path $env:USERPROFILE '.n-portal\service\config.json'
$port = 8790
if (Test-Path $cfgFile) { try { $port = (Get-Content $cfgFile -Raw | ConvertFrom-Json).port } catch {} }
netstat -ano | Select-String ":$port\s" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique | ForEach-Object {
  if ($_ -match '^\d+$' -and [int]$_ -gt 0) { Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue }
}

Push-Location $svc
node dist/index.js
Pop-Location
