@echo off
cd /d "%~dp0"
start "GRapes API" /b npm.cmd run server
start "" /b npm.cmd run dev -- --host 127.0.0.1
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"
pause
