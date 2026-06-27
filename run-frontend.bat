@echo off
REM Start the Batua frontend dev server on http://localhost:3000
cd /d "%~dp0frontend"
call yarn start
