#!/bin/bash

echo "======================================"
echo "      验证码识别服务启动程序"
echo "======================================"
echo ""
echo "正在启动验证码识别服务..."
echo ""
echo "请不要关闭此窗口，服务运行期间需要保持窗口开启"
echo "如需停止服务，请按Ctrl+C"
echo ""

# 检查是否安装了uvicorn
python3 -c "import uvicorn" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "检测到缺少uvicorn模块，正在安装..."
    pip3 install uvicorn fastapi
    if [ $? -ne 0 ]; then
        echo "安装uvicorn失败，请手动运行: pip3 install uvicorn fastapi"
        echo ""
        read -p "按Enter继续..."
        exit 1
    fi
fi

python3 simple_ocr_server.py

if [ $? -ne 0 ]; then
    echo ""
    echo "服务启动失败，可能是以下原因："
    echo "1. Python未安装或版本过低（需要Python 3.6+）"
    echo "2. 所需依赖未安装（请运行: pip3 install ddddocr opencv-python numpy Pillow fastapi uvicorn）"
    echo "3. 端口9898已被占用"
    echo ""
    echo "按Enter键退出..."
    read
fi 