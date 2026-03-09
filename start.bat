@echo off
cd /d "%~dp0"
node_modules\.bin\electron .
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: electron exited with code %ERRORLEVEL%
  pause
)
