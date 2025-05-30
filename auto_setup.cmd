@echo off
setlocal enabledelayedexpansion

:: 颜色定义
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

echo %BLUE%=======================================%NC%
echo %BLUE%    验证码识别系统一键部署脚本(Windows版)    %NC%
echo %BLUE%=======================================%NC%
echo.

:: 检查参数
if "%1"=="stop" (
    echo %YELLOW%正在停止验证码识别服务...%NC%
    
    :: 查找并停止服务进程
    tasklist /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq 验证码识别服务" > temp.txt
    findstr "python.exe" temp.txt > nul
    
    if %ERRORLEVEL% equ 0 (
        echo 找到服务进程，正在停止...
        taskkill /F /FI "WINDOWTITLE eq 验证码识别服务" /T
        echo %GREEN%服务已停止%NC%
    ) else (
        :: 尝试用进程名查找
        taskkill /F /IM python.exe /FI "WINDOWTITLE eq simple_ocr_server.py" /T 2>nul
        if %ERRORLEVEL% equ 0 (
            echo %GREEN%服务已停止%NC%
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
            
            echo %GREEN%所有可能的服务进程已尝试停止%NC%
        )
    )
    
    :: 删除临时文件
    if exist temp.txt del /f /q temp.txt
    
    :: 如果虚拟环境处于激活状态，尝试退出
    if defined VIRTUAL_ENV (
        echo 检测到活跃的虚拟环境，正在退出...
        call deactivate 2>nul
    )
    
    echo %GREEN%停止操作完成%NC%
    pause
    exit /b 0
)

:: 检查Python是否安装
echo %YELLOW%检查Python是否安装...%NC%
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo %RED%错误: 未找到Python，请先安装Python%NC%
    echo 可以从 https://www.python.org/downloads/ 下载安装
    pause
    exit /b 1
)

:: 检查虚拟环境是否存在
set VENV_DIR=venv
if not exist %VENV_DIR%\ (
    echo %YELLOW%未检测到虚拟环境，正在创建...%NC%
    python -m venv %VENV_DIR% 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo 创建虚拟环境失败，尝试安装virtualenv...
        pip install virtualenv
        python -m virtualenv %VENV_DIR% 2>nul
        if %ERRORLEVEL% NEQ 0 (
            echo %RED%创建虚拟环境失败，将使用系统Python环境%NC%
            set USE_VENV=false
        ) else (
            echo %GREEN%虚拟环境创建成功%NC%
            set USE_VENV=true
        )
    ) else (
        echo %GREEN%虚拟环境创建成功%NC%
        set USE_VENV=true
    )
) else (
    echo %YELLOW%检测到虚拟环境，将使用现有环境%NC%
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
    echo %YELLOW%服务已经在运行中，无需重复启动%NC%
    echo 如需重启，请先运行: %0 stop
    pause
    exit /b
)

:: 如果使用虚拟环境，则激活它并安装依赖
if "%USE_VENV%"=="true" (
    echo %YELLOW%激活虚拟环境...%NC%
    call %VENV_DIR%\Scripts\activate.bat
    if %ERRORLEVEL% NEQ 0 (
        echo %RED%激活虚拟环境失败，将使用系统Python环境%NC%
        set USE_VENV=false
    ) else (
        echo %YELLOW%正在安装所需依赖到虚拟环境...%NC%
        
        :: 卸载常规OpenCV并安装无头版本
        echo 卸载常规OpenCV并安装无头版本...
        pip uninstall -y opencv-python 2>nul
        pip install opencv-python-headless
        
        :: 安装其他依赖
        echo 安装其他依赖...
        pip install ddddocr fastapi uvicorn numpy Pillow
    )
) else (
    echo %YELLOW%正在安装所需依赖到系统环境...%NC%
    
    :: 卸载常规OpenCV并安装无头版本
    echo 卸载常规OpenCV并安装无头版本...
    pip uninstall -y opencv-python 2>nul
    pip install opencv-python-headless
    
    :: 安装其他依赖
    echo 安装其他依赖...
    pip install ddddocr fastapi uvicorn numpy Pillow
)

:: 后台启动服务
echo %YELLOW%正在后台启动验证码识别服务...%NC%
if "%USE_VENV%"=="true" (
    start "验证码识别服务" /min %VENV_DIR%\Scripts\python simple_ocr_server.py > "%LOG_FILE%" 2>&1
) else (
    start "验证码识别服务" /min python simple_ocr_server.py > "%LOG_FILE%" 2>&1
)

echo %GREEN%服务已成功在后台启动！%NC%
echo 日志文件: %LOG_FILE%
echo.

:: 获取本机IP地址
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    set IP=!IP:~1!
    goto :got_ip
)
:got_ip

echo %BLUE%使用方法:%NC%
echo 查看日志: type %LOG_FILE%
echo 停止服务: %0 stop
echo 服务器地址: http://%IP%:9898
echo.
echo %YELLOW%提示: 请确保在油猴脚本中将服务器地址设置为:%NC%
echo %GREEN%http://%IP%:9898/ocr%NC%

pause 