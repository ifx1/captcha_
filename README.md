# 自动验证码识别与填充系统

这是一个自动识别网页验证码并填充的系统，包含两个主要组件：
1. 油猴脚本 `captcha_solver_lite.user.js` - 在网页上检测验证码并自动填写
2. 本地OCR服务 `simple_ocr_server.py` - 提供验证码识别功能

## 功能特点

- **自动识别** - 自动检测页面上的验证码图片和输入框
- **自动填写** - 将识别结果自动填入对应输入框
- **验证码刷新监测** - 监听验证码变化并自动重新识别
- **滑块验证码支持** - 支持常见滑块验证码的识别和自动滑动
- **弹窗检测** - 能检测到弹出的验证码窗口
- **高性能后端** - 基于FastAPI的高性能OCR服务

## 系统要求

- **Python 3.6+**
- **油猴扩展（Tampermonkey）**
- **依赖库**：ddddocr, fastapi, uvicorn, opencv-python, numpy, Pillow

## 快速入门

### Windows用户

1. 双击运行 `install_dependencies.bat` 安装所需依赖
2. 双击运行 `start_ocr_server.bat` 启动OCR服务
3. 安装油猴脚本（见下方"油猴脚本安装"部分）
4. 访问包含验证码的网站，验证码将自动识别并填写

### Linux/Mac用户

1. 添加执行权限：`chmod +x *.sh`
2. 运行 `./install_dependencies.sh` 安装所需依赖
3. 运行 `./start_ocr_server.sh` 启动OCR服务
4. 安装油猴脚本（见下方"油猴脚本安装"部分）
5. 访问包含验证码的网站，验证码将自动识别并填写

### 服务器部署（使用虚拟环境）

1. 添加执行权限：`chmod +x *.sh`
2. 选择以下方式之一启动服务：
   - 前台运行：`./start_ocr_server_venv.sh`（会自动创建虚拟环境并安装依赖）
   - 后台运行：`./start_ocr_server_daemon.sh`（会自动创建虚拟环境并安装依赖）
3. 停止服务：`./stop_ocr_server.sh`
4. 修改油猴脚本中的服务器地址为您的服务器IP

## 部署步骤

### 1. 服务器端部署

#### 安装Python依赖

**方法一：使用安装脚本（推荐）**
- Windows：运行 `install_dependencies.bat`
- Linux/Mac：运行 `./install_dependencies.sh`

**方法二：手动安装**
```bash
pip install ddddocr fastapi uvicorn opencv-python numpy Pillow
```

**方法三：使用虚拟环境（服务器部署推荐）**

在服务器上使用虚拟环境可以避免依赖冲突，推荐使用此方法：

1. 安装虚拟环境工具（如果尚未安装）
```bash
# 使用pip安装virtualenv
pip install virtualenv

# 或者在Ubuntu/Debian系统上
sudo apt install python3-venv
```

2. 创建虚拟环境
```bash
# 在项目目录中创建名为venv的虚拟环境
python3 -m venv venv

# 或使用virtualenv
virtualenv venv
```

3. 激活虚拟环境
```bash
# Linux/Mac
source venv/bin/activate

# Windows
venv\Scripts\activate
```

4. 在虚拟环境中安装依赖
```bash
pip install ddddocr fastapi uvicorn opencv-python numpy Pillow
```

5. 在虚拟环境中运行服务
```bash
python simple_ocr_server.py

# 或使用uvicorn直接启动（生产环境推荐）
uvicorn simple_ocr_server:app --host 0.0.0.0 --port 9898
```

6. 退出虚拟环境（当不需要运行服务时）
```bash
deactivate
```

#### 启动OCR服务器

**方法一：使用启动脚本（推荐）**
- Windows：运行 `start_ocr_server.bat`
- Linux/Mac：运行 `./start_ocr_server.sh`

**方法二：直接运行Python脚本**
```bash
python simple_ocr_server.py
```

**方法三：使用Uvicorn启动（生产环境推荐）**
```bash
uvicorn simple_ocr_server:app --host 0.0.0.0 --port 9898
```

**方法四：在虚拟环境中启动（服务器部署推荐）**

使用提供的虚拟环境脚本（自动处理虚拟环境创建和依赖安装）：

```bash
# 前台运行（适合调试）
./start_ocr_server_venv.sh

# 后台运行（适合生产环境）
./start_ocr_server_daemon.sh

# 停止服务
./stop_ocr_server.sh
```

手动操作虚拟环境：
```bash
# 激活虚拟环境
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 启动服务
python simple_ocr_server.py
# 或使用uvicorn直接启动
uvicorn simple_ocr_server:app --host 0.0.0.0 --port 9898

# 使用nohup在后台运行（Linux/Mac）
nohup python simple_ocr_server.py > ocr_server.log 2>&1 &
```

#### 设置服务器自启动

##### Windows系统
1. 创建启动脚本快捷方式
2. 按 `Win+R`，输入 `shell:startup` 打开启动文件夹
3. 将启动脚本的快捷方式放入该文件夹

##### Linux系统（使用systemd）
1. 创建systemd服务文件 `/etc/systemd/system/ocr-server.service`：
```
[Unit]
Description=OCR Server Service
After=network.target

[Service]
User=yourusername
WorkingDirectory=/path/to/your/project
ExecStart=/usr/bin/python3 /path/to/your/project/simple_ocr_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```
2. 启用并启动服务：
```bash
sudo systemctl enable ocr-server.service
sudo systemctl start ocr-server.service
```

##### Linux系统（使用虚拟环境和systemd）
1. 创建systemd服务文件 `/etc/systemd/system/ocr-server.service`：
```
[Unit]
Description=OCR Server Service
After=network.target

[Service]
User=yourusername
WorkingDirectory=/path/to/your/project
ExecStart=/path/to/your/project/venv/bin/python /path/to/your/project/simple_ocr_server.py
# 或使用uvicorn
# ExecStart=/path/to/your/project/venv/bin/uvicorn simple_ocr_server:app --host 0.0.0.0 --port 9898
Restart=always

[Install]
WantedBy=multi-user.target
```
2. 启用并启动服务：
```bash
sudo systemctl enable ocr-server.service
sudo systemctl start ocr-server.service
```

##### 使用Screen或Tmux保持服务运行（适用于无systemd的系统）
```bash
# 使用Screen
screen -S ocr_server
source venv/bin/activate
python simple_ocr_server.py
# 按Ctrl+A然后按D分离Screen会话

# 使用Tmux
tmux new -s ocr_server
source venv/bin/activate
python simple_ocr_server.py
# 按Ctrl+B然后按D分离Tmux会话
```

### 2. 油猴脚本安装

1. 确保浏览器已安装[Tampermonkey扩展](https://www.tampermonkey.net/)
2. 安装脚本的方法：

   **方法一：通过文件安装**
   - 打开Tampermonkey扩展的管理页面
   - 点击"工具"标签
   - 选择"导入"按钮
   - 选择下载的 `captcha_solver_lite.user.js` 文件
   - 点击"安装"

   **方法二：通过URL安装**（如果您部署在网站上）
   - 访问脚本的URL
   - Tampermonkey会自动检测并提示安装
   - 点击"安装"按钮

   **方法三：手动创建**
   - 打开Tampermonkey扩展
   - 点击"+"创建新脚本
   - 复制 `captcha_solver_lite.user.js` 的内容
   - 粘贴到编辑器中并保存

## 使用方法

1. 确保OCR服务已启动（使用启动脚本或直接运行Python脚本）
2. 浏览包含验证码的网站，脚本会自动：
   - 检测验证码图片
   - 发送至本地OCR服务进行识别
   - 将识别结果填入对应输入框
   - 对于滑块验证码，自动计算滑动距离并模拟人工滑动

## 配置与自定义

在油猴脚本中，可以根据需要修改配置参数：

```javascript
const config = {
    autoMode: true,        // 自动识别验证码
    checkInterval: 1500,   // 自动检查间隔(毫秒)
    debug: true,           // 是否显示调试信息
    delay: 500,            // 点击验证码后的识别延迟(毫秒)
    sliderEnabled: true,   // 是否启用滑块验证码支持
    // ...其他配置项
};
```

## 服务器参数调整

如需更改服务器端口或其他参数，编辑 `simple_ocr_server.py` 文件：

```python
# 服务器端口
PORT = 9898  # 修改为所需端口
```

## 接口文档

服务启动后，可以通过以下URL访问API文档：
```
http://localhost:9898/docs
```

这是FastAPI自动生成的交互式API文档，您可以在这里测试和了解所有可用的接口。

## 文件说明

### 核心文件
- `captcha_solver_lite.user.js` - 油猴脚本，用于在网页上检测和填写验证码，是客户端核心组件
- `simple_ocr_server.py` - Python OCR服务器，提供验证码识别API，是服务器端核心组件

### Windows系统脚本
- `install_dependencies.bat` - Windows系统用于安装Python依赖的批处理脚本
- `start_ocr_server.bat` - Windows系统用于启动OCR服务的批处理脚本

### Linux/Mac系统脚本
- `install_dependencies.sh` - Linux/Mac系统用于安装Python依赖的shell脚本
- `start_ocr_server.sh` - Linux/Mac系统用于启动OCR服务的shell脚本

### 服务器部署脚本
- `start_ocr_server_venv.sh` - 使用虚拟环境启动服务的脚本（前台运行模式）
  * 自动创建并配置Python虚拟环境
  * 自动安装所需依赖
  * 在前台运行服务（适合调试）
  
- `start_ocr_server_daemon.sh` - 使用虚拟环境在后台启动服务的脚本（守护进程模式）
  * 自动创建并配置Python虚拟环境
  * 自动安装所需依赖
  * 将服务作为守护进程在后台运行
  * 自动生成日志文件并保存PID
  
- `stop_ocr_server.sh` - 停止后台运行的OCR服务的脚本
  * 查找并停止所有OCR服务进程
  * 支持通过PID文件或进程名查找服务
  * 包含优雅终止和强制终止两种方式

### 文件用途对应表

| 文件名 | 系统平台 | 用途 | 运行方式 |
|--------|---------|------|---------|
| captcha_solver_lite.user.js | 所有浏览器 | 验证码自动识别填写 | 油猴扩展运行 |
| simple_ocr_server.py | 所有平台 | OCR服务后端(FastAPI) | Python运行 |
| install_dependencies.bat | Windows | 安装依赖 | 双击运行 |
| start_ocr_server.bat | Windows | 启动服务 | 双击运行 |
| install_dependencies.sh | Linux/Mac | 安装依赖 | ./install_dependencies.sh |
| start_ocr_server.sh | Linux/Mac | 启动服务 | ./start_ocr_server.sh |
| start_ocr_server_venv.sh | Linux/Mac | 虚拟环境前台启动 | ./start_ocr_server_venv.sh |
| start_ocr_server_daemon.sh | Linux/Mac | 虚拟环境后台启动 | ./start_ocr_server_daemon.sh |
| stop_ocr_server.sh | Linux/Mac | 停止后台服务 | ./stop_ocr_server.sh |

## 问题排查

如果脚本无法正常工作：

1. **确认服务器状态**
   - 确保OCR服务正常运行
   - 访问 `http://localhost:9898` 检查服务是否响应
   - 访问 `http://localhost:9898/docs` 查看API文档并测试接口

2. **检查浏览器控制台**
   - 按F12打开开发者工具
   - 查看控制台是否有以`[验证码]`开头的日志
   - 检查是否有错误信息

3. **常见问题**
   - **验证码无法识别**：检查图片是否完全加载，尝试增加识别延迟时间
   - **找不到验证码**：网站可能使用了非标准的验证码实现，需要修改脚本中的选择器
   - **滑块验证失败**：调整滑块配置参数，或关闭滑块功能
   - **服务无响应**：检查防火墙设置，确保端口9898开放

4. **修改OCR服务地址**
   - 如果OCR服务部署在其他机器上，修改脚本中的服务器地址：
   ```javascript
   const OCR_SERVER = 'http://your-server-ip:9898/ocr';
   const SLIDE_SERVER = 'http://your-server-ip:9898/slide';
   ```

5. **虚拟环境问题**
   - 确保在正确的虚拟环境中安装了所有依赖
   - 检查虚拟环境的Python版本是否符合要求（3.6+）
   - 如果使用systemd，确保ExecStart路径指向正确的虚拟环境Python解释器

## 注意事项

- OCR服务默认监听在 `localhost:9898`
- 对于外部访问，需要配置防火墙允许该端口的访问
- 油猴脚本默认在所有网站上运行，可以根据需要限制特定网站
- 不同网站的验证码实现可能需要调整选择器
- 在服务器上部署时，推荐使用虚拟环境和systemd服务管理

## API接口说明

服务提供以下主要接口：

1. **GET /** - 服务状态检查
   - 返回服务状态和滑块支持情况

2. **POST /ocr** - 验证码图片识别
   - 输入：`{ "image": "图片base64编码" }`
   - 输出：`{ "code": 0, "data": "识别结果", "message": "识别成功" }`

3. **POST /slide** - 滑块验证码分析
   - 输入方式1：`{ "bg_image": "背景图base64", "slide_image": "滑块图base64" }`
   - 输入方式2：`{ "full_image": "完整图片base64" }`
   - 输出：`{ "code": 0, "data": { "x": 滑动距离, "y": 0 }, "message": "滑块分析成功" }`

所有接口都支持跨域请求(CORS)，可以从任何网站调用。 