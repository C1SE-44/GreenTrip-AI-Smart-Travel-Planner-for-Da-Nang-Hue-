$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root) { $root = $PSScriptRoot }
if (-not $root) { $root = Get-Location }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  GreenTrip AI - Khoi dong Backend & Frontend (Sieu nhe)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Khoi dong Backend FastAPI
Write-Host "[1/2] Dang khoi dong Backend FastAPI (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; Write-Host '=== GreenTrip Backend FastAPI (:8000) ===' -ForegroundColor Green; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

Start-Sleep -Seconds 1

# 2. Khoi dong Frontend Vite
Write-Host "[2/2] Dang khoi dong Frontend Vite (Port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; Write-Host '=== GreenTrip Frontend Vite (:5173) ===' -ForegroundColor Cyan; npm run dev"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  DA KHOI CHAY XONG! Vui long mo:" -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:5173/planner" -ForegroundColor White
Write-Host "  - Backend:  http://localhost:8000/docs" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
Start-Sleep -Seconds 3
