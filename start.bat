@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  CheckCTS - Khoi dong web + agent doc token
echo ============================================================

echo [1/3] Khoi dong CheckCTS Agent (cong 8765)...
if exist "%~dp0dist\CheckCTS-Agent.exe" (
    start "CheckCTS-Agent" "%~dp0dist\CheckCTS-Agent.exe"
) else (
    start "CheckCTS-Agent" cmd /k "python "%~dp0agent.py""
)

echo [2/3] Khoi dong CheckCTS Web (cong 3000)...
start "CheckCTS-Web" cmd /k "cd /d "%~dp0web" && node server.js"

echo [3/3] Mo trinh duyet...
timeout /t 3 >nul
start "" http://localhost:3000

echo.
echo Da khoi dong xong:
echo   - Web:   http://localhost:3000
echo   - Agent: http://127.0.0.1:8765
echo Giu cac cua so vua mo. Chay stop.bat de tat.
echo.
pause
