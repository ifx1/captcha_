#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}    验证码识别系统一键部署脚本    ${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# 检查参数
if [ "$1" == "stop" ]; then
    echo -e "${YELLOW}正在停止验证码识别服务...${NC}"
    
    # 检查PID文件
    if [ -f "ocr_server.pid" ]; then
        PID=$(cat ocr_server.pid)
        echo "正在停止PID为 $PID 的服务..."
        kill $PID 2>/dev/null
        
        # 等待进程终止
        sleep 2
        if ps -p $PID > /dev/null 2>&1; then
            echo "进程未能正常终止，尝试强制终止..."
            kill -9 $PID 2>/dev/null
        fi
        
        # 移除PID文件
        rm ocr_server.pid
        echo -e "${GREEN}服务已停止${NC}"
    else
        # 如果PID文件不存在，尝试查找进程
        echo "正在查找并停止服务进程..."
        PIDS=$(ps -ef | grep -E "python.*simple_ocr_server.py" | grep -v grep | awk '{print $2}')
        
        if [ -z "$PIDS" ]; then
            echo -e "${YELLOW}未找到正在运行的服务${NC}"
            exit 0
        fi
        
        echo "找到以下进程: $PIDS"
        for pid in $PIDS; do
            echo "正在停止PID为 $pid 的进程..."
            kill $pid
            
            # 等待进程终止
            sleep 1
            if ps -p $pid > /dev/null 2>&1; then
                echo "进程未能正常终止，尝试强制终止..."
                kill -9 $pid 2>/dev/null
            fi
        done
        
        echo -e "${GREEN}服务已停止${NC}"
    fi
    
    # 清理可能存在的虚拟环境激活状态
    if [ -n "$VIRTUAL_ENV" ]; then
        echo "检测到活跃的虚拟环境，正在退出..."
        deactivate 2>/dev/null
    fi
    
    exit 0
fi

# 检查Python是否安装
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}错误: 未找到Python3，请先安装Python3${NC}"
    echo "Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "CentOS/RHEL: sudo yum install python3 python3-pip"
    exit 1
fi

# 安装系统依赖（如果有root权限）
if [ "$(id -u)" = "0" ]; then
    echo -e "${YELLOW}检测到root权限，安装系统依赖...${NC}"
    apt-get update -qq && apt-get install -y --no-install-recommends \
        libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6 \
        > /dev/null 2>&1 || echo -e "${RED}系统依赖安装失败，可能影响服务运行${NC}"
else
    echo -e "${YELLOW}提示: 以非root用户运行，无法安装系统依赖${NC}"
    echo "如需安装系统依赖，请使用: sudo apt-get install -y libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6"
fi

# 检查虚拟环境是否存在
VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}未检测到虚拟环境，正在创建...${NC}"
    python3 -m venv $VENV_DIR || { 
        echo "创建虚拟环境失败，尝试安装venv模块..."; 
        pip3 install virtualenv; 
        python3 -m virtualenv $VENV_DIR || { 
            echo -e "${RED}创建虚拟环境失败，将使用系统Python环境${NC}"; 
            USE_VENV=false; 
        }
    }
    echo -e "${GREEN}虚拟环境创建成功${NC}"
    USE_VENV=true
else
    echo -e "${YELLOW}检测到虚拟环境，将使用现有环境${NC}"
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
    echo -e "${YELLOW}服务已经在运行中，无需重复启动${NC}"
    echo "如需重启，请先运行: $0 stop"
    exit 0
fi

# 如果使用虚拟环境，则激活它并安装依赖
if [ "$USE_VENV" = true ]; then
    echo -e "${YELLOW}激活虚拟环境...${NC}"
    source $VENV_DIR/bin/activate || { 
        echo -e "${RED}激活虚拟环境失败，将使用系统Python环境${NC}"; 
        USE_VENV=false; 
    }
    
    if [ "$USE_VENV" = true ]; then
        echo -e "${YELLOW}正在安装所需依赖到虚拟环境...${NC}"
        
        # 卸载常规OpenCV并安装无头版本
        echo "卸载常规OpenCV并安装无头版本..."
        pip uninstall -y opencv-python 2>/dev/null
        pip install opencv-python-headless
        
        # 安装其他依赖
        echo "安装其他依赖..."
        pip install ddddocr fastapi uvicorn numpy Pillow
    fi
else
    echo -e "${YELLOW}正在安装所需依赖到系统环境...${NC}"
    
    # 卸载常规OpenCV并安装无头版本
    echo "卸载常规OpenCV并安装无头版本..."
    pip3 uninstall -y opencv-python 2>/dev/null
    pip3 install opencv-python-headless
    
    # 安装其他依赖
    echo "安装其他依赖..."
    pip3 install ddddocr fastapi uvicorn numpy Pillow
fi

# 后台启动服务
echo -e "${YELLOW}正在后台启动验证码识别服务...${NC}"
if [ "$USE_VENV" = true ]; then
    nohup $VENV_DIR/bin/python simple_ocr_server.py > "$LOG_FILE" 2>&1 &
else
    nohup python3 simple_ocr_server.py > "$LOG_FILE" 2>&1 &
fi

# 保存PID
echo $! > ocr_server.pid
PID=$!

echo -e "${GREEN}服务已成功在后台启动！${NC}"
echo "PID: $PID"
echo "日志文件: $LOG_FILE"
echo ""
echo -e "${BLUE}使用方法:${NC}"
echo "查看日志: tail -f $LOG_FILE"
echo "停止服务: $0 stop"
echo "服务器地址: http://$(hostname -I | awk '{print $1}'):9898"
echo ""
echo -e "${YELLOW}提示: 请确保在油猴脚本中将服务器地址设置为:${NC}"
echo -e "${GREEN}http://$(hostname -I | awk '{print $1}'):9898/ocr${NC}" 