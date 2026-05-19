$ErrorActionPreference = "Stop"

$ruleName = "RankRoute Flask LAN 5000"

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Write-Host "Firewall rule already exists: $ruleName" -ForegroundColor Yellow
} else {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort 5000 `
        -Profile Private | Out-Null
    Write-Host "Firewall rule created: $ruleName" -ForegroundColor Green
}

Write-Host "LAN devices can now reach this PC on port 5000 (Private network)." -ForegroundColor Cyan
