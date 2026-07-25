@echo off
setlocal

rem Always run from this script's own folder, so it works from a desktop shortcut too.
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies, this only happens once...
    call npm install
    if errorlevel 1 goto :error
)

if not exist dist (
    echo Building the app...
    call npm run build
    if errorlevel 1 goto :error
)

echo Starting BreakerTrack server...
start "BreakerTrack Server" cmd /k npm start

rem Give the server a moment to come up, then open it in the browser.
timeout /t 2 /nobreak >nul
start "" http://localhost:3001

exit /b 0

:error
echo.
echo Something went wrong - see the messages above.
pause
exit /b 1
