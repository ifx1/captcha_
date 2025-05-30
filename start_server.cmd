@echo off
echo ======================================
echo       验证码识别服务一键启动脚本
echo ======================================
echo.

:: 安装依赖
echo 正在安装所需依赖...
pip install ddddocr fastapi uvicorn opencv-python numpy Pillow

:: 确保logs目录存在
if not exist logs mkdir logs

:: 获取当前日期时间作为日志文件名
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "LOG_DATE=%dt:~0,8%_%dt:~8,6%"
set "LOG_FILE=logs\ocr_server_%LOG_DATE%.log"

:: 检查是否已有进程在运行
tasklist /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq simple_ocr_server.py" | findstr "python.exe" > nul
if %ERRORLEVEL% equ 0 (
    echo 服务已经在运行中，无需重复启动
    pause
    exit /b
)

:: 后台启动服务
echo 正在后台启动验证码识别服务...
start "验证码识别服务" /min python simple_ocr_server.py > "%LOG_FILE%" 2>&1

echo 服务已成功在后台启动！
echo 日志文件: %LOG_FILE%
echo.
echo 查看日志命令: type %LOG_FILE%
echo 停止服务: 使用stop_server.cmd

pause 