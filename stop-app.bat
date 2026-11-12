@echo off
title Tat GreenTrip Dev Servers
echo ========================================================
echo   Dang tat server Backend (8000) va Frontend (5173)...
echo ========================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(8000, 5173); foreach ($p in $ports) { $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; if ($conn) { $pids = $conn.OwningProcess | Select-Object -Unique; foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }; Get-Process -Name node, uvicorn -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*repo*' -or $_.CommandLine -like '*5173*' -or $_.CommandLine -like '*8000*' } | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Host 'Da giai phong Port 8000 va 5173, tat sach se tat ca tien trinh!' -ForegroundColor Green;"

echo.
echo Da tat hoan tat!
timeout /t 2 /nobreak >nul
