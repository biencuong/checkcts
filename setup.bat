@echo off
chcp 65001 >nul
cd /d "%~dp0"
title CheckCTS - Cai dat / Cap nhat

echo ============================================================
echo  CheckCTS - Cai dat lan dau / sau khi nang cap Node.js
echo ============================================================
echo.

:: Kiem tra Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Node.js. Tai ve tai: https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js: %%v

:: Kiem tra npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay npm.
    pause & exit /b 1
)

echo.
echo [*] Cai dat / cap nhat thu vien Node.js (co the mat vai phut)...
echo     (better-sqlite3 can compile native - can co Visual C++ Build Tools)
cd /d "%~dp0web"
call npm install
if errorlevel 1 (
    echo.
    echo [CANH BAO] npm install gap loi. Thu npm rebuild...
)

echo.
echo [*] Recompile better-sqlite3 cho phien ban Node.js hien tai...
call npm rebuild better-sqlite3
if errorlevel 1 (
    echo.
    echo [LOI] Khong recompile duoc. Co the thieu Visual C++ Build Tools.
    echo.
    echo Cach 1 - Cai Build Tools:
    echo   winget install Microsoft.VisualStudio.2022.BuildTools
    echo   (chon "Desktop development with C++" trong installer)
    echo.
    echo Cach 2 - Cai phien ban Node.js khop voi ban da compile:
    echo   MODULE_VERSION 115 = Node.js v20.x
    echo   MODULE_VERSION 127 = Node.js v22.x
    echo   MODULE_VERSION 137 = Node.js v24.x
    echo   MODULE_VERSION 147 = Node.js v26.x
    echo   (Node.js ^> 24.x van chay tot - chi can npm rebuild o tren thanh cong)
    echo.
    pause & exit /b 1
)

echo.
echo ============================================================
echo  [OK] Cai dat hoan tat! Co the chay start.bat
echo ============================================================
echo.
pause
