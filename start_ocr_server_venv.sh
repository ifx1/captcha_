#!/bin/bash

echo "======================================"
echo "    验证码识别服务启动程序(虚拟环境版)"
echo "======================================"
echo ""

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "未检测到虚拟环境，正在创建..."
    python3 -m venv venv || { echo "创建虚拟环境失败，请确保已安装python3-venv"; exit 1; }
    echo "虚拟环境创建成功"
fi

echo "正在激活虚拟环境..."
source venv/bin/activate || { echo "激活虚拟环境失败"; exit 1; }

# 检查依赖是否已安装
echo "检查依赖..."
python -c "import fastapi" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "正在安装所需依赖..."
    pip install ddddocr opencv-python numpy Pillow fastapi uvicorn
    if [ $? -ne 0 ]; then
        echo "依赖安装失败，请手动安装"
        deactivate
        exit 1
    fi
    echo "依赖安装成功"
fi

echo ""
echo "正在启动验证码识别服务..."
echo "服务运行在虚拟环境中，请不要关闭此窗口"
echo "如需停止服务，请按Ctrl+C"
echo ""

# 启动服务
python simple_ocr_server.py

# 如果服务退出，则退出虚拟环境
if [ $? -ne 0 ]; then
    echo ""
    echo "服务启动失败，可能是以下原因："
    echo "1. 端口9898已被占用"
    echo "2. 虚拟环境中的Python版本过低"
    echo "3. 依赖安装不完整"
    echo ""
fi

deactivate
echo "已退出虚拟环境"
echo "按Enter键退出..."
read 