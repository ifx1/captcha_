#!/bin/bash

# 验证码识别系统一键安装和启动脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 变量
PYTHON_CMD="python3"
PIP_CMD="pip3"
VENV_DIR="venv"
LOG_DIR="logs"
CACHE_DIR="cache"
SERVER_FILE="simple_ocr_server.py"
PORT=9898
STOP_COMMAND="$1"
LOG_FILE="$LOG_DIR/ocr_server.log"

# 创建必要的目录
create_directories() {
    echo -e "${BLUE}创建必要的目录...${NC}"
    mkdir -p "$LOG_DIR"
    mkdir -p "$CACHE_DIR"
    mkdir -p "temp"
    echo -e "${GREEN}✓ 目录创建完成${NC}"
}

# 检查Python和pip是否可用
check_python() {
    if ! command -v $PYTHON_CMD &> /dev/null; then
        echo -e "${RED}错误: 未找到Python3，请安装Python 3.6或以上版本${NC}"
        exit 1
    fi

    if ! command -v $PIP_CMD &> /dev/null; then
        echo -e "${RED}错误: 未找到pip3，请安装pip${NC}"
        exit 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    echo -e "${GREEN}✓ 检测到Python版本: $PYTHON_VERSION${NC}"
}

# 停止运行的服务
stop_server() {
    echo -e "${BLUE}正在停止验证码识别服务...${NC}"
    
    # 查找运行在指定端口的进程
    PID=$(lsof -t -i:$PORT 2>/dev/null)
    
    if [ -n "$PID" ]; then
        echo -e "${YELLOW}找到运行在端口 $PORT 的进程 (PID: $PID)，正在终止...${NC}"
        kill -15 $PID 2>/dev/null || kill -9 $PID 2>/dev/null
        sleep 1
        
        # 确认进程已终止
        if ! lsof -t -i:$PORT &>/dev/null; then
            echo -e "${GREEN}✓ 服务已成功停止${NC}"
        else
            echo -e "${RED}警告: 无法完全停止服务，请手动终止进程 $PID${NC}"
        fi
    else
        echo -e "${YELLOW}未发现运行中的验证码识别服务${NC}"
    fi
}

# 设置虚拟环境
setup_venv() {
    echo -e "${BLUE}设置Python虚拟环境...${NC}"
    
    # 检查虚拟环境是否已存在
    if [ ! -d "$VENV_DIR" ]; then
        echo -e "${YELLOW}创建新的虚拟环境...${NC}"
        $PYTHON_CMD -m venv $VENV_DIR || { 
            echo -e "${RED}创建虚拟环境失败，尝试使用virtualenv...${NC}"
            $PIP_CMD install virtualenv
            virtualenv $VENV_DIR
        }
    else
        echo -e "${YELLOW}使用现有虚拟环境${NC}"
    fi
    
    # 激活虚拟环境
    if [ -f "$VENV_DIR/bin/activate" ]; then
        source $VENV_DIR/bin/activate
        echo -e "${GREEN}✓ 虚拟环境已激活${NC}"
    else
        echo -e "${RED}错误: 无法激活虚拟环境${NC}"
        exit 1
    fi
}

# 安装依赖
install_dependencies() {
    echo -e "${BLUE}安装依赖...${NC}"
    
    # 尝试安装无头版OpenCV
    $PIP_CMD install opencv-python-headless ddddocr fastapi uvicorn numpy Pillow || {
        echo -e "${YELLOW}安装失败，尝试修复依赖问题...${NC}"
        
        # 检测系统类型并安装所需系统依赖
        if [ -f /etc/debian_version ]; then
            # Debian/Ubuntu
            echo -e "${YELLOW}检测到Debian/Ubuntu系统，安装系统依赖...${NC}"
            sudo apt-get update
            sudo apt-get install -y libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6
        elif [ -f /etc/redhat-release ]; then
            # RHEL/CentOS
            echo -e "${YELLOW}检测到RHEL/CentOS系统，安装系统依赖...${NC}"
            sudo yum install -y mesa-libGL glib2 libSM libXrender libXext
        elif [ -f /etc/arch-release ]; then
            # Arch Linux
            echo -e "${YELLOW}检测到Arch Linux系统，安装系统依赖...${NC}"
            sudo pacman -Sy --noconfirm mesa glib2 libsm libxrender libxext
        else
            echo -e "${YELLOW}无法检测系统类型，尝试通用安装方式${NC}"
        fi
        
        # 再次尝试安装依赖
        $PIP_CMD install opencv-python-headless ddddocr fastapi uvicorn numpy Pillow
    }
    
    echo -e "${GREEN}✓ 依赖安装完成${NC}"
}

# 启动服务器
start_server() {
    echo -e "${BLUE}启动验证码识别服务...${NC}"
    
    # 确保日志目录存在
    mkdir -p "$LOG_DIR"
    
    # 后台运行服务器
    nohup $PYTHON_CMD $SERVER_FILE > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    
    # 等待几秒确认服务已启动
    sleep 3
    
    if ps -p $SERVER_PID > /dev/null; then
        echo -e "${GREEN}✓ 验证码识别服务已成功启动 (PID: $SERVER_PID)${NC}"
        echo -e "${GREEN}✓ 服务地址: http://localhost:$PORT${NC}"
        echo -e "${GREEN}✓ 日志文件: $LOG_FILE${NC}"
        echo -e "${YELLOW}提示: 使用 '$0 stop' 命令停止服务${NC}"
    else
        echo -e "${RED}错误: 服务启动失败，请检查日志: $LOG_FILE${NC}"
        echo -e "${YELLOW}手动启动尝试: $PYTHON_CMD $SERVER_FILE${NC}"
    fi
}

# 清理旧的日志和缓存文件
cleanup_old_files() {
    echo -e "${BLUE}清理旧的日志和缓存文件...${NC}"
    
    # 删除超过30天的日志文件
    find "$LOG_DIR" -name "*.log.*" -type f -mtime +30 -delete 2>/dev/null
    
    # 删除超过7天的缓存文件
    find "$CACHE_DIR" -name "*.json" -type f -mtime +7 -delete 2>/dev/null
    
    echo -e "${GREEN}✓ 清理完成${NC}"
}

# 主函数
main() {
    echo -e "${BLUE}===== 验证码识别系统一键部署脚本 =====${NC}"
    
    # 如果是停止命令
    if [ "$STOP_COMMAND" = "stop" ]; then
        stop_server
        exit 0
    fi
    
    # 如果是清理命令
    if [ "$STOP_COMMAND" = "cleanup" ]; then
        cleanup_old_files
        exit 0
    fi
    
    # 创建必要的目录
    create_directories
    
    # 检查Python
    check_python
    
    # 停止已有服务
    stop_server
    
    # 设置虚拟环境
    setup_venv
    
    # 安装依赖
    install_dependencies
    
    # 清理旧文件
    cleanup_old_files
    
    # 启动服务器
    start_server
}

# 执行主函数
main 