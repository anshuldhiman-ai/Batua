@echo off
REM ---------------------------------------------------------------------------
REM Batua - stop BOTH the backend (port 8001) and the frontend (port 3000).
REM Kills whatever process is listening on each port, then closes the
REM launcher windows opened by run-all.bat.
REM ---------------------------------------------------------------------------
echo Stopping Batua backend (8001) and frontend (3000)...

powershell -NoProfile -Command "foreach ($port in 8001,3000) { $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($c) { $c.OwningProcess | Sort-Object -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop; Write-Host ('  stopped PID {0} (port {1})' -f $_, $port) } catch {} } } else { Write-Host ('  nothing listening on port {0}' -f $port) } }"

REM Close the launcher windows if they are still open.
taskkill /FI "WINDOWTITLE eq Batua Backend*"  /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Batua Frontend*" /T /F >nul 2>&1

echo Done.
