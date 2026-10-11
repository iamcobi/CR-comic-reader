@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Pip needs Node.js 22.13 or newer.
  echo Install the LTS version from https://nodejs.org/ then click this file again.
  pause
  exit /b 1
)
node scripts\launch-local.mjs
if errorlevel 1 (
  echo.
  echo Pip could not start. Read the error above and check README.md.
  pause
  exit /b 1
)
endlocal
