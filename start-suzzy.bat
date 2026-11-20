@echo off
REM One-click launcher for Suzzy AI (backend + frontend)
cd /d "%~dp0"

echo Starting Suzzy backend on http://127.0.0.1:8000 ...
start "Suzzy Backend" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Suzzy frontend on http://localhost:3000 ...
start "Suzzy Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

echo Waiting for servers to initialize...
ping -n 6 127.0.0.1 >nul
start "" http://localhost:3000
