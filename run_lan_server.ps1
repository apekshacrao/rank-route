$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$pythonExe = "C:/Users/Apeksha/AppData/Local/Python/pythoncore-3.14-64/python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "Python executable not found at $pythonExe" -ForegroundColor Red
    Write-Host "Update run_lan_server.ps1 with your Python path." -ForegroundColor Yellow
    exit 1
}

$hostIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $hostIp) {
    $hostIp = "<LAN_IP_NOT_FOUND>"
}

$localUrl = "http://127.0.0.1:5000"
$lanUrl = "http://$hostIp:5000"
$backendDir = Join-Path $projectRoot "backend"

Write-Host "Starting RankRoute server for LAN access..." -ForegroundColor Cyan
Write-Host "Local URL: $localUrl" -ForegroundColor Green
Write-Host "LAN URL:   $lanUrl" -ForegroundColor Green

Start-Process -FilePath $pythonExe `
    -ArgumentList @("-m", "waitress", "--host=0.0.0.0", "--port=5000", "app:app") `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden

Start-Process $localUrl
