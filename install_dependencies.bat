@echo off
echo ======================================
echo       验证码识别系统依赖安装程序
echo ======================================
echo.
echo 正在检查Python安装...

python --version 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 错误：未检测到Python！
    echo 请安装Python 3.6或更高版本，并确保添加到环境变量中
    echo 下载地址：https://www.python.org/downloads/
    echo.
    echo 按任意键退出...
    pause > nul
    exit /b 1
)

echo.
echo 正在安装所需依赖...
echo.

pip install ddddocr opencv-python numpy Pillow fastapi uvicorn

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 依赖安装过程中出现错误！
    echo 请尝试手动安装：pip install ddddocr opencv-python numpy Pillow fastapi uvicorn
    echo.
) else (
    echo.
    echo 依赖安装完成！
    echo 现在可以运行 start_ocr_server.bat 启动验证码识别服务
    echo.
)

echo 按任意键退出...
pause > nul 