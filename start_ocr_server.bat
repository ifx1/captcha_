@echo off
echo ======================================
echo       验证码识别服务启动程序
echo ======================================
echo.
echo 正在启动验证码识别服务...
echo.
echo 请不要关闭此窗口，服务运行期间需要保持窗口开启
echo 如需停止服务，请按Ctrl+C，然后输入Y确认
echo.

python -c "import uvicorn" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 检测到缺少uvicorn模块，正在安装...
    pip install uvicorn fastapi
    if %ERRORLEVEL% NEQ 0 (
        echo 安装uvicorn失败，请手动运行: pip install uvicorn fastapi
        echo.
        pause
        exit /b 1
    )
)

python simple_ocr_server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 服务启动失败，可能是以下原因：
    echo 1. Python未安装或未添加到环境变量
    echo 2. 所需依赖未安装（请运行: pip install ddddocr opencv-python numpy Pillow fastapi uvicorn）
    echo 3. 端口9898已被占用
    echo.
    echo 按任意键退出...
    pause > nul
) 