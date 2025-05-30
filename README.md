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

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. [点击此处安装脚本](https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js)
3. 修改脚本中的服务器地址为您的服务器IP地址:
   ```javascript
   // OCR服务器地址 - 修改为您的服务器IP地址
   const OCR_SERVER = 'http://您的服务器IP:9898/ocr';
   const SLIDE_SERVER = 'http://您的服务器IP:9898/slide';
   ```

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

## 许可证

MIT
