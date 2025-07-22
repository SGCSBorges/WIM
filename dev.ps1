param(
  [switch]$WithStripeListener = $false,
  [string]$ApiPort = "3000",
  [string]$WebPort = "5173",
  [string]$StripeForwardTo = "http://localhost:3000/api/billing/webhook"
)

$ErrorActionPreference = "Stop"

function Start-NewWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  Write-Host "Starting: $Title" -ForegroundColor Cyan

  # Uses Windows PowerShell to open a new window and run the command.
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd \"$WorkingDirectory\"; $Command"
  ) -WindowStyle Normal
}

Write-Host "WIM dev launcher" -ForegroundColor Green
Write-Host "- API: http://localhost:$ApiPort" 
Write-Host "- WEB: http://localhost:$WebPort" 

# Quick validation
if (-not (Test-Path (Join-Path $PSScriptRoot "apps\api\package.json"))) {
  throw "Could not find apps/api/package.json. Run from the repo root (or keep dev.ps1 in repo root)."
}
if (-not (Test-Path (Join-Path $PSScriptRoot "apps\web\package.json"))) {
  throw "Could not find apps/web/package.json. Run from the repo root (or keep dev.ps1 in repo root)."
}

# API
Start-NewWindow -Title "WIM API" -WorkingDirectory (Join-Path $PSScriptRoot "apps\api") -Command "`$env:PORT='$ApiPort'; npm run dev"

# WEB
Start-NewWindow -Title "WIM WEB" -WorkingDirectory (Join-Path $PSScriptRoot "apps\web") -Command "npm run dev -- --port $WebPort"

if ($WithStripeListener) {
  Write-Host "Starting Stripe listener (requires Stripe CLI installed + logged in)" -ForegroundColor Yellow
  Start-NewWindow -Title "Stripe listen" -WorkingDirectory $PSScriptRoot -Command "stripe listen --forward-to $StripeForwardTo"
}

Write-Host "Done. Check the opened terminal windows." -ForegroundColor Green
