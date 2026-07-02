@echo off
REM ---------------------------------------------------------------------------
REM Batua - start BOTH the backend and the frontend together.
REM Opens two labeled windows:
REM   "Batua Backend"  -> uvicorn  on http://localhost:8001
REM   "Batua Frontend" -> yarn dev on http://localhost:3000
REM Stop both at once with stop-all.bat
REM ---------------------------------------------------------------------------
cd /d "%~dp0"

start "Batua Backend"  cmd /k "%~dp0run-backend.bat"
start "Batua Frontend" cmd /k "%~dp0run-frontend.bat"

echo.
echo Launched Batua:
echo   Backend  -^> http://localhost:8001
echo   Frontend -^> http://localhost:3000
echo.
echo Two new windows opened. Run stop-all.bat (or close the windows) to stop.
