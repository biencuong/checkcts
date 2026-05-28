@echo off
chcp 65001 >nul
echo ============================================================
echo  CheckCTS - Tat web + agent
echo ============================================================

echo Tat CheckCTS Agent (.exe)...
taskkill /F /IM CheckCTS-Agent.exe >nul 2>&1

echo Tat tien trinh dang nghe cong 8765 (agent python neu co)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8765" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

echo Tat web server (cong 3900)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3900" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

echo.
echo Da tat xong CheckCTS (web + agent).
echo.
pause
