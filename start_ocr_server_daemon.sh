#!/bin/bash

echo "======================================"
echo "  验证码识别服务后台启动程序(守护进程)"
echo "======================================"
echo ""

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "未检测到虚拟环境，正在创建..."
    python3 -m venv venv || { echo "创建虚拟环境失败，请确保已安装python3-venv"; exit 1; }
    echo "虚拟环境创建成功"
fi

# 检查日志目录是否存在
if [ ! -d "logs" ]; then
    echo "创建日志目录..."
    mkdir logs
fi

# 检查进程状态
check_process() {
    pgrep -f "python.*simple_ocr_server.py" > /dev/null
}

# 如果服务已在运行，则提示用户
if check_process; then
    echo "检测到验证码识别服务已在运行！"
    echo "如需重启，请先运行 ./stop_ocr_server.sh"
    exit 0
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
echo "正在后台启动验证码识别服务..."

# 获取当前日期时间作为日志文件名
LOG_DATE=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/ocr_server_${LOG_DATE}.log"

# 使用nohup在后台启动服务
nohup python simple_ocr_server.py > "$LOG_FILE" 2>&1 &

# 保存PID到文件
echo $! > ocr_server.pid

# 等待几秒检查服务是否成功启动
sleep 3
if check_process; then
    echo "服务已成功在后台启动！"
    echo "PID: $(cat ocr_server.pid)"
    echo "日志文件: $LOG_FILE"
    echo ""
    echo "可以使用以下命令查看日志:"
    echo "tail -f $LOG_FILE"
    echo ""
    echo "要停止服务，请运行:"
    echo "./stop_ocr_server.sh"
else
    echo "服务启动失败，请查看日志文件: $LOG_FILE"
fi

# 退出虚拟环境
deactivate 