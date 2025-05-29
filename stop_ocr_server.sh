#!/bin/bash

echo "======================================"
echo "      验证码识别服务停止程序"
echo "======================================"
echo ""

# 检查进程状态
check_process() {
    pgrep -f "python.*simple_ocr_server.py" > /dev/null
}

# 如果PID文件存在，使用它来停止服务
if [ -f "ocr_server.pid" ]; then
    PID=$(cat ocr_server.pid)
    echo "尝试停止PID为 $PID 的服务..."
    kill $PID 2>/dev/null
    
    # 等待进程终止
    sleep 2
    if ! check_process; then
        echo "服务已成功停止"
        rm ocr_server.pid
        exit 0
    fi
fi

# 如果PID文件不存在或无法使用PID停止，尝试查找并停止所有相关进程
echo "正在查找并停止所有验证码识别服务进程..."
PIDS=$(pgrep -f "python.*simple_ocr_server.py")

if [ -z "$PIDS" ]; then
    echo "未检测到正在运行的验证码识别服务"
    # 清理可能存在的PID文件
    [ -f "ocr_server.pid" ] && rm ocr_server.pid
    exit 0
fi

echo "找到以下进程: $PIDS"
for pid in $PIDS; do
    echo "正在停止PID为 $pid 的进程..."
    kill $pid
done

# 等待进程终止
sleep 2
if check_process; then
    echo "部分进程未能正常停止，尝试强制终止..."
    for pid in $(pgrep -f "python.*simple_ocr_server.py"); do
        echo "强制终止PID为 $pid 的进程..."
        kill -9 $pid
    done
fi

# 最后检查
if check_process; then
    echo "警告：仍有进程未能终止，请手动检查"
    exit 1
else
    echo "所有服务已成功停止"
    # 清理PID文件
    [ -f "ocr_server.pid" ] && rm ocr_server.pid
fi 