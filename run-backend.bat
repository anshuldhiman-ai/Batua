@echo off
REM Start the Batua backend on http://localhost:8001
cd /d "%~dp0backend"
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
