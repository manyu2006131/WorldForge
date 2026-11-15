@echo off
cd /d "%~dp0"
set ELECTRON_CACHE=%CD%\.cache\electron
set ELECTRON_BUILDER_CACHE=%CD%\.cache\electron-builder
call npm install
if errorlevel 1 (
  pause
  exit /b 1
)
call npm run dist:win
pause
