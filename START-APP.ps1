# Boutyflameet Startup Script for PowerShell
Write-Host ""
Write-Host "  ========================================" -ForegroundColor Red
Write-Host "   BOUTYFLAMEET - Starting App..." -ForegroundColor Yellow
Write-Host "  ========================================" -ForegroundColor Red
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Install backend deps
$backendModules = Join-Path $scriptDir "backend\node_modules"
if (-not (Test-Path $backendModules)) {
    Write-Host "  Installing backend packages..." -ForegroundColor Cyan
    Set-Location (Join-Path $scriptDir "backend")
    npm install
}

# Install frontend deps
$frontendModules = Join-Path $scriptDir "frontend\node_modules"
if (-not (Test-Path $frontendModules)) {
    Write-Host "  Installing frontend packages..." -ForegroundColor Cyan
    Set-Location (Join-Path $scriptDir "frontend")
    npm install
}

Write-Host "  Starting backend server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptDir\backend'; node server.js" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "  Starting frontend (browser will open automatically)..." -ForegroundColor Green
Set-Location (Join-Path $scriptDir "frontend")
npm run dev
