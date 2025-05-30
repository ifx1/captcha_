#!/bin/bash

echo "======================================"
echo "      验证码识别服务一键启动脚本"
echo "======================================"
echo ""

# 检查Python是否安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请先安装Python3"
    echo "Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "CentOS/RHEL: sudo yum install python3 python3-pip"
    exit 1
fi

# 检查虚拟环境是否存在
VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "未检测到虚拟环境，正在创建..."
    python3 -m venv $VENV_DIR || { 
        echo "创建虚拟环境失败，尝试安装venv模块..."; 
        pip3 install virtualenv; 
        python3 -m virtualenv $VENV_DIR || { 
            echo "创建虚拟环境失败，将使用系统Python环境"; 
            USE_VENV=false; 
        }
    }
    echo "虚拟环境创建成功"
    USE_VENV=true
else
    echo "检测到虚拟环境，将使用现有环境"
    USE_VENV=true
fi

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

# 如果使用虚拟环境，则激活它并安装依赖
if [ "$USE_VENV" = true ]; then
    echo "激活虚拟环境..."
    source $VENV_DIR/bin/activate || { 
        echo "激活虚拟环境失败，将使用系统Python环境"; 
        USE_VENV=false; 
    }
    
    if [ "$USE_VENV" = true ]; then
        echo "正在安装所需依赖到虚拟环境..."
        pip install ddddocr fastapi uvicorn opencv-python numpy Pillow
    fi
else
    echo "正在安装所需依赖到系统环境..."
    pip3 install ddddocr fastapi uvicorn opencv-python numpy Pillow
fi

# 后台启动服务
echo "正在后台启动验证码识别服务..."
if [ "$USE_VENV" = true ]; then
    nohup $VENV_DIR/bin/python simple_ocr_server.py > "$LOG_FILE" 2>&1 &
else
    nohup python3 simple_ocr_server.py > "$LOG_FILE" 2>&1 &
fi

# 保存PID
echo $! > ocr_server.pid
PID=$!

echo "服务已成功在后台启动！"
echo "PID: $PID"
echo "日志文件: $LOG_FILE"
echo ""
echo "查看日志命令: tail -f $LOG_FILE"
echo "停止服务命令: ./stop_server.sh" 