@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: -------------------------------------------------------------------
:: Lan dau goi: khoi dong lai chinh no voi cua so THU NHO roi thoat.
:: Lan hai goi (co tham so "min"): thuc hien cong viec that su.
:: -------------------------------------------------------------------
if not "%~1"=="min" (
    start /min "CheckCTS" cmd /c ""%~f0" min"
    exit /b
)

:: === TU DAY CHAY TRONG CUA SO THU NHO (minimized) ===
title CheckCTS - Dang khoi dong...
echo ============================================================
echo  CheckCTS - Khoi dong he thong
echo ============================================================
echo.

:: Tat tien trinh cu neu con chay
echo [*] Dung cac dich vu cu neu dang chay...
taskkill /F /IM CheckCTS-Agent.exe >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":3900 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":8765 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
ping -n 2 127.0.0.1 >nul

:: Khoi dong CheckCTS Agent (an cua so)
echo [1/2] Khoi dong CheckCTS Agent (cong 8765)...
if exist "%~dp0dist\CheckCTS-Agent.exe" (
    powershell -Command "Start-Process -FilePath '%~dp0dist\CheckCTS-Agent.exe' -WindowStyle Hidden -WorkingDirectory '%~dp0dist'"
    goto :agent_done
)
:: Tim Python that (tranh stub python.exe 0 byte cua Microsoft Store trong WindowsApps)
call :find_python
if not defined PYEXE (
    echo [LOI] Khong tim thay Python 3 de chay agent ^(doc token CKS^).
    echo       Cai Python 3 roi mo LAI cua so, hoac build CheckCTS-Agent.exe.
) else (
    powershell -Command "Start-Process -FilePath '%PYEXE%' -ArgumentList '\"%~dp0agent.py\"' -WindowStyle Hidden -WorkingDirectory '%~dp0'"
)
:agent_done

:: Khoi dong CheckCTS Web Server (an cua so)
echo [2/2] Khoi dong CheckCTS Web Server (cong 3900)...
del "%~dp0web\server.err" >nul 2>&1
powershell -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0web' -WindowStyle Hidden -RedirectStandardError '%~dp0web\server.err'"

:: Cho dich vu san sang
echo.
echo    Dang cho cac dich vu khoi dong...
ping -n 5 127.0.0.1 >nul

title CheckCTS - Dang chay
:: Kiem tra loi khoi dong web (ERR_DLOPEN_FAILED = can chay setup.bat)
ping -n 3 127.0.0.1 >nul
if exist "%~dp0web\server.err" (
    findstr /i /c:"ERR_DLOPEN_FAILED" /c:"NODE_MODULE_VERSION" "%~dp0web\server.err" >nul 2>&1
    if not errorlevel 1 (
        echo.
        echo [LOI] Web server gap loi tuong thich Node.js:
        echo       better-sqlite3 can duoc recompile cho phien ban Node.js hien tai.
        echo.
        echo  ==> HAY DONG CUA SO NAY VA CHAY: setup.bat
        echo.
        timeout /t 30 >nul
        exit /b 1
    )
)

echo ============================================================
echo  [OK] He thong da san sang!
echo       Web  : http://localhost:3900
echo       Agent: http://127.0.0.1:8765
echo.
echo  Cua so nay tu dong dong sau 5 giay.
echo  (Dich vu tiep tuc chay nen - dung stop.bat de tat)
echo ============================================================
timeout /t 5 >nul
:: Cua so dong, dich vu van chay nen
exit /b 0

:: -------------------------------------------------------------------
:: Tim duong dan python.exe that, BO QUA stub WindowsApps (0 byte) cua
:: Microsoft Store - stub nay hay nam dau PATH khien agent khong khoi dong.
:: -------------------------------------------------------------------
:find_python
set "PYEXE="
for /d %%d in ("%LOCALAPPDATA%\Programs\Python\Python3*") do if exist "%%d\python.exe" set "PYEXE=%%d\python.exe"
if not defined PYEXE if exist "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Launcher\py.exe"
if not defined PYEXE for /d %%d in ("%ProgramFiles%\Python3*") do if exist "%%d\python.exe" set "PYEXE=%%d\python.exe"
if not defined PYEXE if exist "%SystemRoot%\py.exe" set "PYEXE=%SystemRoot%\py.exe"
goto :eof
