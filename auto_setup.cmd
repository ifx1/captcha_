@echo off
setlocal enabledelayedexpansion

:: 颜色定义
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "RED=[91m"
set "NC=[0m"

:: 变量
set "PYTHON_CMD=python"
set "PIP_CMD=pip"
set "VENV_DIR=venv"
set "LOG_DIR=logs"
set "CACHE_DIR=cache"
set "SERVER_FILE=simple_ocr_server.py"
set "PORT=9898"
set "LOG_FILE=%LOG_DIR%\ocr_server.log"

:: 标题
title 验证码识别系统一键部署脚本

:: 主菜单
echo %BLUE%===== 验证码识别系统一键部署脚本 =====%NC%
echo.

:: 检查是否是停止命令
if "%1"=="stop" (
    call :stop_server
    goto :eof
)

:: 检查是否是清理命令
if "%1"=="cleanup" (
    call :cleanup_old_files
    goto :eof
)

:: 创建必要的目录
call :create_directories

:: 检查Python
call :check_python

:: 停止已有服务
call :stop_server

:: 设置虚拟环境
call :setup_venv

:: 安装依赖
call :install_dependencies

:: 清理旧文件
call :cleanup_old_files

:: 启动服务器
call :start_server

goto :eof

:: 创建必要的目录
:create_directories
echo %BLUE%创建必要的目录...%NC%
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"
if not exist "temp" mkdir "temp"
echo %GREEN%✓ 目录创建完成%NC%
goto :eof

:: 检查Python
:check_python
echo %BLUE%检查Python环境...%NC%
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo %RED%错误: 未找到Python，请安装Python 3.6或以上版本%NC%
    echo 请访问 https://www.python.org/downloads/ 下载安装
    exit /b 1
)

where pip >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo %RED%错误: 未找到pip，请确保Python安装完整%NC%
    exit /b 1
)

for /f "tokens=*" %%i in ('python -c "import sys; print('{}.{}'.format(sys.version_info.major, sys.version_info.minor))"') do (
    set "PYTHON_VERSION=%%i"
)
echo %GREEN%✓ 检测到Python版本: %PYTHON_VERSION%%NC%
goto :eof

:: 停止服务
:stop_server
echo %BLUE%正在停止验证码识别服务...%NC%

:: 查找运行在指定端口的进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%"') do (
    set "PID=%%a"
    if not "!PID!"=="" (
        echo %YELLOW%找到运行在端口 %PORT% 的进程 (PID: !PID!)，正在终止...%NC%
        taskkill /F /PID !PID! >nul 2>nul
        if %ERRORLEVEL% equ 0 (
            echo %GREEN%✓ 服务已成功停止%NC%
        ) else (
            echo %RED%警告: 无法停止服务，请手动终止进程 !PID!%NC%
        )
        goto :stop_server_done
    )
)

:: 尝试通过python进程查找
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq python.exe" /fi "windowtitle eq simple_ocr_server.py" /fo list ^| findstr "PID"') do (
    set "PID=%%a"
    if not "!PID!"=="" (
        echo %YELLOW%找到Python服务进程 (PID: !PID!)，正在终止...%NC%
        taskkill /F /PID !PID! >nul 2>nul
        if %ERRORLEVEL% equ 0 (
            echo %GREEN%✓ 服务已成功停止%NC%
        ) else (
            echo %RED%警告: 无法停止服务，请手动终止进程 !PID!%NC%
        )
        goto :stop_server_done
    )
)

echo %YELLOW%未发现运行中的验证码识别服务%NC%

:stop_server_done
goto :eof

:: 设置虚拟环境
:setup_venv
echo %BLUE%设置Python虚拟环境...%NC%

:: 检查虚拟环境是否已存在
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo %YELLOW%创建新的虚拟环境...%NC%
    %PYTHON_CMD% -m venv %VENV_DIR%
    if %ERRORLEVEL% neq 0 (
        echo %RED%创建虚拟环境失败，尝试使用virtualenv...%NC%
        %PIP_CMD% install virtualenv
        virtualenv %VENV_DIR%
    )
) else (
    echo %YELLOW%使用现有虚拟环境%NC%
)

:: 激活虚拟环境
if exist "%VENV_DIR%\Scripts\activate.bat" (
    call %VENV_DIR%\Scripts\activate.bat
    echo %GREEN%✓ 虚拟环境已激活%NC%
) else (
    echo %RED%错误: 无法激活虚拟环境%NC%
    exit /b 1
)
goto :eof

:: 安装依赖
:install_dependencies
echo %BLUE%安装依赖...%NC%
    
    :: 卸载常规OpenCV并安装无头版本
%PIP_CMD% uninstall -y opencv-python >nul 2>nul
%PIP_CMD% install opencv-python-headless ddddocr fastapi uvicorn numpy Pillow
if %ERRORLEVEL% neq 0 (
    echo %RED%安装依赖失败，请检查网络连接和Python环境%NC%
    exit /b 1
)

echo %GREEN%✓ 依赖安装完成%NC%
goto :eof

:: 清理旧的日志和缓存文件
:cleanup_old_files
echo %BLUE%清理旧的日志和缓存文件...%NC%

:: 由于Windows没有类似find命令，我们使用PowerShell
powershell -Command "Get-ChildItem -Path '%LOG_DIR%' -Filter '*.log.*' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force"
powershell -Command "Get-ChildItem -Path '%CACHE_DIR%' -Filter '*.json' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force"

echo %GREEN%✓ 清理完成%NC%
goto :eof

:: 启动服务器
:start_server
echo %BLUE%启动验证码识别服务...%NC%

:: 确保日志目录存在
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: 使用start命令在新窗口启动服务器
start "验证码识别服务" cmd /c "%VENV_DIR%\Scripts\python.exe %SERVER_FILE% > %LOG_FILE% 2>&1"

:: 等待几秒确认服务已启动
timeout /t 5 > nul

:: 检查服务是否成功启动
netstat -ano | findstr ":%PORT%" > nul
if %ERRORLEVEL% equ 0 (
    echo %GREEN%✓ 验证码识别服务已成功启动%NC%
    echo %GREEN%✓ 服务地址: http://localhost:%PORT%%NC%
    echo %GREEN%✓ 日志文件: %LOG_FILE%%NC%
    echo %YELLOW%提示: 使用 '%~nx0 stop' 命令停止服务%NC%
) else (
    echo %RED%错误: 服务启动失败，请检查日志: %LOG_FILE%%NC%
    echo %YELLOW%手动启动尝试: %PYTHON_CMD% %SERVER_FILE%%NC%
)
goto :eof

endlocal 