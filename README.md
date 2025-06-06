# 极简验证码识别系统

一个轻量级的验证码识别系统，包含服务器端和油猴脚本客户端，可自动识别网页中的图形验证码和滑块验证码。

## 功能特点

- 自动识别常见图形验证码
- 自动识别滑块验证码
- 一键式部署、启动和停止
- 跨平台支持(Windows/Linux/Mac)
- **全新优化功能：**
  - 服务器缓存机制，提升响应速度
  - 智能重试识别机制，提高成功率
  - 识别成功模式记忆，加速相同验证码识别
  - 图像预处理优化，提升识别准确率
  - 离线识别模式，支持服务器不可用时应急
  - 并发请求处理优化，提高服务器性能

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

## 新增功能与优化

### 服务器优化

1. **缓存机制**
   - 自动缓存识别结果，大幅提高相同验证码的响应速度
   - 智能缓存过期策略，避免内存占用过高
   - 定期后台清理过期缓存

2. **并发处理能力**
   - 支持并发请求处理，提高高负载场景下性能
   - 使用信号量控制最大并发任务数
   - 异步处理耗时操作，避免阻塞

3. **服务状态监控**
   - 新增`/stats`状态监控接口
   - 显示缓存使用情况、内存占用和运行时间
   - 方便管理员实时监控服务状态

### 客户端优化

1. **智能重试机制**
   - 识别失败时自动重试
   - 根据错误类型调整重试策略
   - 可配置最大重试次数和间隔时间

2. **图像优化处理**
   - 自动增强图像对比度
   - 智能去除图像噪点
   - 优化图像压缩质量

3. **识别成功模式记忆**
   - 为每个网站保存成功识别的验证码模式
   - 加速相同类型验证码的识别
   - 自动管理数据过期清理

4. **离线识别模式**
   - 服务器不可用时自动切换到离线模式
   - 内置简单数字验证码识别能力
   - 应急保障网站可用性

5. **跨域问题优化**
   - 增强油猴脚本跨域请求支持
   - 添加广泛的IP范围支持
   - 优化CORS配置解决跨域问题

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

### 跨域问题解决方案

如果客户端报告跨域错误，请尝试以下解决方法：

1. 确保服务器的9898端口已正确开放
2. 检查油猴脚本中的服务器地址是否正确配置
3. 如果使用独特的内网IP地址，在油猴脚本中的`@connect`声明添加该IP地址

### 脚本更新

油猴脚本配置了自动更新URL，当GitHub仓库中的脚本更新时，油猴会自动检测并提示更新。

## API接口

### 图形验证码识别

```
POST /ocr
Content-Type: application/json
{"image": "base64编码的图片"}

返回: {"code": 0, "data": "识别结果", "from_cache": true|false}
```

### 滑块验证码识别

```
POST /slide
Content-Type: application/json
{"bg_image": "背景图base64", "slide_image": "滑块图base64"}

返回: {"code": 0, "data": {"x": 150, "y": 0}, "from_cache": true|false}
```

### 服务器状态查询

```
GET /stats

返回: {
  "status": "running",
  "ocr_cache_size": 42,
  "slide_cache_size": 15,
  "memory_usage_mb": 75.4,
  "uptime": "2天 5小时 30分钟 15秒"
}
```

## 更新系统

### 从GitHub更新文件到服务器

#### 方法一：使用Git拉取更新

如果您是通过Git克隆的仓库，可以直接拉取最新更新：

**基本更新方法（Linux/Mac/Windows通用）**:
```bash
# 先停止服务
./auto_setup.sh stop  # Linux/Mac
# 或
auto_setup.cmd stop  # Windows

# 查看当前状态
git status

# 拉取最新代码
git pull

# 重新启动服务
./auto_setup.sh  # Linux/Mac
# 或
auto_setup.cmd  # Windows
```

**如果git pull只更新了部分文件，可以尝试以下方法**:

```bash
# 1. 查看远程仓库信息
git remote -v

# 2. 确保本地分支跟踪正确的远程分支
git branch -vv

# 3. 重置本地更改（注意：这会丢失未提交的更改）
git reset --hard

# 4. 获取所有最新内容
git fetch --all

# 5. 强制更新到最新版本
git pull --force
# 或者
git reset --hard origin/main  # 假设主分支是main，如果是master则改为master
```

**完全重新克隆的方法（适用于本地仓库有问题的情况）**:
```bash
# 1. 备份重要的本地修改（如有）
cp -r captcha_/your_important_files /backup/location/

# 2. 删除当前仓库
rm -rf captcha_

# 3. 重新克隆
git clone https://github.com/laozig/captcha_.git

# 4. 进入目录
cd captcha_

# 5. 启动服务
./auto_setup.sh  # Linux/Mac
# 或
auto_setup.cmd  # Windows
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

## 性能调优建议

- 对于高流量环境，建议增加服务器内存，缓存机制会提高性能
- 根据使用场景调整`config`中的值，例如优化重试次数、缓存过期时间等
- 如需进一步减小脚本大小，可移除调试日志和注释

## 许可证

MIT
