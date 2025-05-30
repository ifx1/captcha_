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
        :: 尝试查找可能在虚拟环境中运行的Python进程
        echo 尝试查找可能在虚拟环境中运行的进程...
        tasklist | findstr "python" > temp_py.txt
        for /f "tokens=2" %%i in ('findstr "python" temp_py.txt') do (
            echo 发现Python进程: %%i
            taskkill /F /PID %%i /T 2>nul
            if %ERRORLEVEL% equ 0 (
                echo 已停止进程: %%i
            )
        )
        if exist temp_py.txt del /f /q temp_py.txt
        
        echo 所有可能的服务进程已尝试停止
    )
)

:: 删除临时文件
if exist temp.txt del /f /q temp.txt

:: 如果虚拟环境处于激活状态，尝试退出
if defined VIRTUAL_ENV (
    echo 检测到活跃的虚拟环境，正在退出...
    call deactivate 2>nul
)

echo 停止操作完成

pause 