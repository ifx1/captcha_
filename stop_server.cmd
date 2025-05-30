@echo off
echo ======================================
echo       验证码识别服务停止脚本
echo ======================================
echo.

:: 查找并停止服务进程
echo 正在查找并停止服务进程...
tasklist /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq 验证码识别服务" > temp.txt
findstr "python.exe" temp.txt > nul

if %ERRORLEVEL% equ 0 (
    echo 找到服务进程，正在停止...
    taskkill /F /FI "WINDOWTITLE eq 验证码识别服务" /T
    echo 服务已停止
) else (
    :: 尝试用进程名查找
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq simple_ocr_server.py" /T 2>nul
    if %ERRORLEVEL% equ 0 (
        echo 服务已停止
    ) else (
        echo 未找到正在运行的服务
    )
)

:: 删除临时文件
if exist temp.txt del /f /q temp.txt

pause 