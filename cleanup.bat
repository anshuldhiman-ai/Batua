@echo off
REM Batua Project Cleanup Script (Windows)
REM Run this to clean up removable files and fix dependency issues

echo 🧹 Batua Project Cleanup
echo ========================
echo.

REM Clean Python cache files
echo 1. Cleaning Python cache files...
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d" 2>nul
del /s /q *.pyc 2>nul
echo    ✓ Cleaned __pycache__ directories and .pyc files
echo.

REM Clean empty scratch directory
if exist "scratch" (
    echo 2. Removing empty scratch directory...
    rd /s /q "scratch" 2>nul
    echo    ✓ Removed scratch/
) else (
    echo 2. Scratch directory not found (already clean)
)
echo.

REM Optional: Clean frontend build artifacts
echo 3. Frontend build artifacts (SKIPPED - run manually if needed):
echo    cd frontend ^&^& rmdir /s /q dist node_modules
echo    cd frontend ^&^& yarn install
echo.

REM Show dependency issues
echo 📦 Dependency Issues to Fix:
echo =============================
echo.
echo Run these commands to fix Python dependency issues:
echo.
echo   # Fix corrupted pydantic-core
echo   pip uninstall pydantic-core -y ^&^& pip install pydantic-core
echo.
echo   # Fix protobuf version conflict
echo   pip install "protobuf^<5,^>=4.25.3"
echo.
echo   # Optional: Remove unused TensorFlow dependencies
echo   pip uninstall deepface retina-face tf-keras -y
echo.

REM Summary
echo ✨ Cleanup Complete!
echo ===================
echo.
echo Next steps:
echo   1. Run dependency fixes above
echo   2. Run 'ruff check .' to verify code quality
echo   3. Run 'pytest tests/ -v' to verify tests still pass
echo   4. See REMOVABLE_FILES.md for more cleanup options
echo.
pause
