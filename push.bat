@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  CheckCTS - Day ma nguon len GitHub
echo  Repo: https://github.com/biencuong/checkcts
echo ============================================================

echo [1/3] Them thay doi...
git add -A

echo [2/3] Tao commit (neu co thay doi moi)...
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Update %date% %time%"
) else (
    echo    Khong co thay doi moi - day commit hien tai.
)

echo [3/3] Push len nhanh main...
git push -u origin main

echo.
if errorlevel 1 (
    echo LOI: push that bai. Kiem tra dang nhap GitHub hoac ket noi mang.
) else (
    echo Da day len GitHub thanh cong.
)
echo.
pause
