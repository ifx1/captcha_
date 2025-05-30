#!/bin/bash

echo "======================================"
echo "      验证码识别服务停止脚本"
echo "======================================"
echo ""

# 检查PID文件
if [ -f "ocr_server.pid" ]; then
    PID=$(cat ocr_server.pid)
    echo "正在停止PID为 $PID 的服务..."
    kill $PID 2>/dev/null
    
    # 移除PID文件
    rm ocr_server.pid
    echo "服务已停止"
else
    # 如果PID文件不存在，尝试查找进程
    echo "正在查找并停止服务进程..."
    PIDS=$(ps -ef | grep "simple_ocr_server.py" | grep -v grep | awk '{print $2}')
    
    if [ -z "$PIDS" ]; then
        echo "未找到正在运行的服务"
        exit 0
    fi
    
    echo "找到以下进程: $PIDS"
    for pid in $PIDS; do
        echo "正在停止PID为 $pid 的进程..."
        kill $pid
    done
    
    echo "服务已停止"
fi 