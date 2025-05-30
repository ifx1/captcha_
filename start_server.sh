#!/bin/bash

echo "======================================"
echo "      验证码识别服务一键启动脚本"
echo "======================================"
echo ""

# 安装依赖
echo "正在安装所需依赖..."
pip3 install ddddocr fastapi uvicorn opencv-python numpy Pillow

# 确保logs目录存在
mkdir -p logs

# 获取当前日期时间作为日志文件名
LOG_DATE=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/ocr_server_${LOG_DATE}.log"

# 检查是否已有进程在运行
ps -ef | grep "simple_ocr_server.py" | grep -v grep > /dev/null
if [ $? -eq 0 ]; then
    echo "服务已经在运行中，无需重复启动"
    exit 0
fi

# 后台启动服务
echo "正在后台启动验证码识别服务..."
nohup python3 simple_ocr_server.py > "$LOG_FILE" 2>&1 &

# 保存PID
echo $! > ocr_server.pid
PID=$!

echo "服务已成功在后台启动！"
echo "PID: $PID"
echo "日志文件: $LOG_FILE"
echo ""
echo "查看日志命令: tail -f $LOG_FILE"
echo "停止服务命令: kill $PID" 