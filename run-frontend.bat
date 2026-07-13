@echo off
REM Start the Batua frontend dev server on http://localhost:3000
cd /d "%~dp0frontend"

REM If port 3000 is taken, Vite would just pick another port (or fail) - warn
REM clearly instead so it's obvious the frontend is already up.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo.
    echo   Frontend is ALREADY running on http://localhost:3000
    echo   Just open that address in your browser.
    echo.
    echo   To restart it cleanly, run stop-all.bat first, then this again.
    echo.
    pause
    exit /b 0
)

call yarn dev

REM Keep the window open if the dev server exits/errors.
echo.
echo Frontend stopped (exit code %errorlevel%).
pause
