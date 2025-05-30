# 极简验证码识别系统

一个轻量级的验证码识别系统，包含服务器端和油猴脚本客户端，可自动识别网页中的图形验证码和滑块验证码。

## 功能特点

- 自动识别常见图形验证码
- 自动识别滑块验证码
- 一键式后台启动和停止
- 跨平台支持(Windows/Linux/Mac)

## 系统组成

- **服务端**: Python OCR服务 (simple_ocr_server.py)
- **客户端**: 油猴脚本 (captcha_solver_lite.user.js)

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/laozig/captcha_.git
cd captcha_
```

### 2. 启动服务

**Windows系统**:
- 双击运行 `start_server.cmd` 脚本

**Linux/Mac系统**:
```bash
chmod +x start_server.sh
./start_server.sh
```

### 3. 安装客户端脚本

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. [点击此处安装脚本](https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js)

### 4. 停止服务

**Windows系统**:
- 双击运行 `stop_server.cmd` 脚本

**Linux/Mac系统**:
```bash
./stop_server.sh
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
