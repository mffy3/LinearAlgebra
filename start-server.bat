@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found.
  echo   Install Node.js 22 or newer from https://nodejs.org/ and run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting local server for Linear Algebra...
echo   The browser will open http://127.0.0.1:4173/ automatically.
echo   Press Ctrl+C in this window to stop it.
echo.

node server\app.js --open
pause
