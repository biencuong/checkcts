@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  CheckCTS - Tao Release v1.0 va upload 2 file .exe
echo  Repo: https://github.com/biencuong/checkcts
echo ============================================================

where gh >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua co GitHub CLI ^(gh^).
    echo Cai bang:  winget install --id GitHub.cli
    echo Sau do dang nhap:  gh auth login
    pause
    exit /b 1
)

if not exist "dist\CheckCTS-Agent.exe" echo [CANH BAO] Thieu dist\CheckCTS-Agent.exe
if not exist "dist\CheckCTS.exe" echo [CANH BAO] Thieu dist\CheckCTS.exe

echo Tao release v1.0 va upload...
gh release create v1.0 ^
  --repo biencuong/checkcts ^
  --title "CheckCTS v1.0" ^
  --notes "Ban phat hanh dau tien: agent doc token + ban offline day du." ^
  "dist\CheckCTS-Agent.exe" "dist\CheckCTS.exe"

if errorlevel 1 (
    echo.
    echo Neu tag v1.0 da ton tai, dung lenh sau de upload de len release cu:
    echo   gh release upload v1.0 "dist\CheckCTS-Agent.exe" "dist\CheckCTS.exe" --clobber --repo biencuong/checkcts
) else (
    echo.
    echo Da tao release va upload xong. Kiem tra:
    echo   https://github.com/biencuong/checkcts/releases/latest
)
echo.
pause
