@echo off
cd /d "%~dp0android"
start "Piration server" cmd /c "node scripts\serve-www.mjs 5173"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173"
echo.
echo Piration is running at http://127.0.0.1:5173
echo Keep this window open while you play.
