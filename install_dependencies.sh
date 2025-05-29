#!/bin/bash

echo "======================================"
echo "      验证码识别系统依赖安装程序"
echo "======================================"
echo ""
echo "正在检查Python安装..."

if ! command -v python3 &> /dev/null; then
    echo ""
    echo "错误：未检测到Python 3！"
    echo "请安装Python 3.6或更高版本"
    echo "Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "CentOS/RHEL: sudo yum install python3 python3-pip"
    echo ""
    echo "按Enter键退出..."
    read
    exit 1
fi

python3_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "检测到Python版本: $python3_version"

echo ""
echo "正在安装所需依赖..."
echo ""

pip3 install ddddocr opencv-python numpy Pillow fastapi uvicorn

if [ $? -ne 0 ]; then
    echo ""
    echo "依赖安装过程中出现错误！"
    echo "请尝试手动安装："
    echo "pip3 install ddddocr opencv-python numpy Pillow fastapi uvicorn"
    echo ""
    echo "如果遇到权限问题，请尝试："
    echo "pip3 install --user ddddocr opencv-python numpy Pillow fastapi uvicorn"
    echo ""
else
    echo ""
    echo "依赖安装完成！"
    echo "现在可以运行 ./start_ocr_server.sh 启动验证码识别服务"
    echo ""
    
    # 添加执行权限
    chmod +x start_ocr_server.sh
    echo "已为启动脚本添加执行权限"
fi

echo "按Enter键退出..."
read 