@echo off
echo ======================================
echo       验证码识别服务一键启动脚本
echo ======================================
echo.

:: 检查Python是否安装
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误: 未找到Python，请先安装Python
    echo 可以从 https://www.python.org/downloads/ 下载安装
    pause
    exit /b 1
)

:: 检查虚拟环境是否存在
set VENV_DIR=venv
if not exist %VENV_DIR%\ (
    echo 未检测到虚拟环境，正在创建...
    python -m venv %VENV_DIR% 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo 创建虚拟环境失败，尝试安装virtualenv...
        pip install virtualenv
        python -m virtualenv %VENV_DIR% 2>nul
        if %ERRORLEVEL% NEQ 0 (
            echo 创建虚拟环境失败，将使用系统Python环境
            set USE_VENV=false
        ) else (
            echo 虚拟环境创建成功
            set USE_VENV=true
        )
    ) else (
        echo 虚拟环境创建成功
        set USE_VENV=true
    )
) else (
    echo 检测到虚拟环境，将使用现有环境
    set USE_VENV=true
)

:: 确保logs目录存在
if not exist logs mkdir logs

:: 获取当前日期时间作为日志文件名
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "LOG_DATE=%dt:~0,8%_%dt:~8,6%"
set "LOG_FILE=logs\ocr_server_%LOG_DATE%.log"

:: 检查是否已有进程在运行
tasklist /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq 验证码识别服务" | findstr "python.exe" > nul
if %ERRORLEVEL% equ 0 (
    echo 服务已经在运行中，无需重复启动
    pause
    exit /b
)

:: 如果使用虚拟环境，则激活它并安装依赖
if "%USE_VENV%"=="true" (
    echo 激活虚拟环境...
    call %VENV_DIR%\Scripts\activate.bat
    if %ERRORLEVEL% NEQ 0 (
        echo 激活虚拟环境失败，将使用系统Python环境
        set USE_VENV=false
    ) else (
        echo 正在安装所需依赖到虚拟环境...
        pip install ddddocr fastapi uvicorn opencv-python numpy Pillow
    )
) else (
    echo 正在安装所需依赖到系统环境...
    pip install ddddocr fastapi uvicorn opencv-python numpy Pillow
)

:: 后台启动服务
echo 正在后台启动验证码识别服务...
if "%USE_VENV%"=="true" (
    start "验证码识别服务" /min %VENV_DIR%\Scripts\python simple_ocr_server.py > "%LOG_FILE%" 2>&1
) else (
    start "验证码识别服务" /min python simple_ocr_server.py > "%LOG_FILE%" 2>&1
)

echo 服务已成功在后台启动！
echo 日志文件: %LOG_FILE%
echo.
echo 查看日志命令: type %LOG_FILE%
echo 停止服务: 使用stop_server.cmd

pause 