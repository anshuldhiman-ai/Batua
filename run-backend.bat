@echo off
REM Start the Batua backend on http://localhost:8001
cd /d "%~dp0backend"

REM If something is already listening on 8001, a second uvicorn can't bind the
REM port and would crash instantly (WinError 10048). Detect that and explain,
REM instead of flashing an error and closing the window.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo.
    echo   Backend is ALREADY running on http://localhost:8001
    echo   Nothing to do - just open http://localhost:3000 in your browser.
    echo.
    echo   To restart it cleanly, run stop-all.bat first, then this again.
    echo.
    pause
    exit /b 0
)

python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload

REM Keep the window open if uvicorn exits/errors so the message is readable.
echo.
echo Backend stopped (exit code %errorlevel%).
pause
