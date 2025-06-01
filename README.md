# 极简验证码识别系统

一个轻量级的验证码识别系统，包含服务器端和油猴脚本客户端，可自动识别网页中的图形验证码和滑块验证码。

## 功能特点

- 自动识别常见图形验证码
- 自动识别滑块验证码
- 一键式部署、启动和停止
- 跨平台支持(Windows/Linux/Mac)

## 系统组成

- **服务端**: Python OCR服务 (simple_ocr_server.py)
- **客户端**: 油猴脚本 (captcha_solver_lite.user.js)
- **部署脚本**: 一键部署脚本 (auto_setup.sh / auto_setup.cmd)

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/laozig/captcha_.git
cd captcha_
```

### 2. 一键部署和启动服务

**Linux/Mac系统**:
```bash
# 添加执行权限
chmod +x auto_setup.sh

# 启动服务
./auto_setup.sh
```

**Windows系统**:
- 双击运行 `auto_setup.cmd` 脚本

### 3. 安装客户端脚本

#### 方法一：直接安装URL（推荐）

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 点击下面的链接直接安装脚本：

   [**点击此处安装验证码识别脚本**](https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js)

#### 方法二：手动安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 点击Tampermonkey图标 → 创建新脚本
3. 复制 captcha_solver_lite.user.js 的内容并粘贴
4. 保存脚本

#### 配置服务器地址

安装脚本后，需要修改脚本中的服务器地址：

1. 点击Tampermonkey图标 → 管理面板
2. 找到"极简验证码识别工具"脚本并点击编辑
3. 修改以下两行为您的服务器IP地址：
   ```javascript
   // OCR服务器地址 - 修改为您的服务器IP地址
   const OCR_SERVER = 'http://您的服务器IP:9898/ocr';
   const SLIDE_SERVER = 'http://您的服务器IP:9898/slide';
   ```
4. 保存脚本 (Ctrl+S)

### 4. 停止服务

**Linux/Mac系统**:
```bash
./auto_setup.sh stop
```

**Windows系统**:
```
auto_setup.cmd stop
```

## 常见问题

### OpenCV依赖问题

如果遇到以下错误:
```
ImportError: libGL.so.1: cannot open shared object file: No such file or directory
```

一键部署脚本会自动解决此问题，它会:
1. 安装必要的系统依赖
2. 使用无头版本的OpenCV (opencv-python-headless)

如果仍有问题，可以手动安装系统依赖:
```bash
apt-get install -y libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6
```

### 脚本更新

油猴脚本配置了自动更新URL，当GitHub仓库中的脚本更新时，油猴会自动检测并提示更新。

## API接口

### 图形验证码识别

```
POST /ocr
Content-Type: application/json
{"image": "base64编码的图片"}

返回: {"code": 0, "data": "识别结果"}
```

### 滑块验证码识别

```
POST /slide
Content-Type: application/json
{"bg_image": "背景图base64", "slide_image": "滑块图base64"}

返回: {"code": 0, "data": {"x": 150, "y": 0}}
```

## 更新系统

### 从GitHub更新文件到服务器

#### 方法一：使用Git拉取更新

如果您是通过Git克隆的仓库，可以直接拉取最新更新：

**Linux/Mac系统**:
```bash
# 先停止服务
./auto_setup.sh stop

# 拉取最新代码
git pull

# 重新启动服务
./auto_setup.sh
```

**Windows系统**:
```bash
# 先停止服务
auto_setup.cmd stop

# 拉取最新代码
git pull

# 重新启动服务
auto_setup.cmd
```

#### 方法二：手动下载并替换文件

1. 从GitHub下载最新文件：
   - 访问 https://github.com/laozig/captcha_
   - 点击"Code"按钮，然后选择"Download ZIP"
   - 解压下载的ZIP文件

2. 替换服务器上的文件：
   ```bash
   # 先停止服务
   ./auto_setup.sh stop  # 或 auto_setup.cmd stop (Windows)
   
   # 复制新文件替换旧文件
   cp -r 下载解压路径/* 服务器项目路径/
   
   # 重新启动服务
   ./auto_setup.sh  # 或 auto_setup.cmd (Windows)
   ```

## 开放服务器端口

服务器需要开放9898端口以供油猴脚本访问。根据您的环境，可以使用以下方法开放端口：

### Linux系统（使用UFW防火墙）

```bash
# 安装UFW（如果尚未安装）
sudo apt-get install ufw

# 开放9898端口
sudo ufw allow 9898/tcp

# 重启防火墙
sudo ufw disable
sudo ufw enable
```

### Linux系统（使用iptables）

```bash
# 开放9898端口
sudo iptables -A INPUT -p tcp --dport 9898 -j ACCEPT

# 保存规则（取决于发行版）
# Debian/Ubuntu
sudo netfilter-persistent save
# CentOS/RHEL
sudo service iptables save
```

### Windows系统

通过Windows防火墙添加入站规则：

1. 打开"控制面板" -> "系统和安全" -> "Windows Defender防火墙"
2. 点击"高级设置"
3. 在左侧选择"入站规则"
4. 点击右侧的"新建规则..."
5. 选择"端口"，点击"下一步"
6. 选择"TCP"和"特定本地端口"，输入"9898"
7. 点击"下一步"，选择"允许连接"
8. 点击"下一步"，保持默认选择
9. 点击"下一步"，输入规则名称（如"OCR服务端口"）
10. 点击"完成"

### 云服务器（如AWS、阿里云、腾讯云等）

请登录您的云服务提供商的控制台，在安全组或防火墙设置中添加以下规则：
- 协议：TCP
- 端口：9898
- 来源：0.0.0.0/0（允许所有IP访问）或限制为特定IP

## 许可证

MIT
