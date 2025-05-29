import base64
import json
import traceback
import io
import cv2
import numpy as np
from PIL import Image
import ddddocr
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 初始化OCR和滑块检测器
ocr = ddddocr.DdddOcr()
try:
    slide_detector = ddddocr.DdddOcr(det=False, ocr=False, show_ad=False)
    slide_available = True
    print("滑块识别模块已加载")
except Exception as e:
    slide_detector = None
    slide_available = False
    print(f"滑块识别模块加载失败: {str(e)}")

# 服务器端口
PORT = 9898

# 创建FastAPI应用
app = FastAPI(title="验证码识别服务", description="提供验证码识别和滑块验证码分析功能")

# 添加CORS中间件，允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """服务状态检查"""
    return {
        "status": "ok",
        "message": "OCR服务已启动",
        "slide_support": slide_available
    }

@app.post("/ocr")
async def ocr_service(request: Request):
    """识别验证码图片"""
    try:
        # 获取请求数据
        data = await request.json()
        
        # 验证请求数据
        if "image" not in data:
            raise HTTPException(status_code=400, detail="缺少图片数据")
        
        # 获取图片数据
        image_base64 = data["image"]
        
        try:
            # 识别验证码
            img_data = base64.b64decode(image_base64)
            result = ocr.classification(img_data)
            
            print(f"识别结果: {result}")
            
            # 返回结果
            return {
                "code": 0,
                "data": result,
                "message": "识别成功"
            }
        except Exception as e:
            print(f"识别错误: {str(e)}")
            return {"code": 2, "message": f"识别失败: {str(e)}"}
    except Exception as e:
        print(f"请求处理错误: {str(e)}")
        return {"code": 3, "message": f"请求处理错误: {str(e)}"}

@app.post("/slide")
async def slide_service(request: Request):
    """分析滑块验证码"""
    if not slide_available:
        return {"code": 5, "message": "滑块识别模块未加载"}
        
    try:
        # 获取请求数据
        data = await request.json()
        
        # 验证请求数据
        if "bg_image" not in data and "full_image" not in data:
            return {"code": 1, "message": "缺少背景图或全图数据"}
        
        # 使用ddddocr计算滑块缺口位置
        try:
            if "bg_image" in data and "slide_image" in data:
                # ddddocr模式：背景图+滑块图
                bg_img_data = base64.b64decode(data["bg_image"])
                slide_img_data = base64.b64decode(data["slide_image"])
                target_x = slide_detector.slide_match(slide_img_data, bg_img_data)
            elif "full_image" in data:
                # 单图模式：尝试使用OpenCV分析
                full_img_data = base64.b64decode(data["full_image"])
                target_x = analyze_slide_image(full_img_data)
            else:
                return {"code": 1, "message": "缺少必要的图片数据"}
            
            print(f"滑块分析结果: x = {target_x}")
            
            # 返回结果
            return {
                "code": 0,
                "data": {
                    "x": target_x,
                    "y": 0  # 一般滑块只需要x坐标
                },
                "message": "滑块分析成功"
            }
        except Exception as e:
            print(f"滑块分析错误: {str(e)}")
            traceback.print_exc()
            return {"code": 2, "message": f"滑块分析失败: {str(e)}"}
    except Exception as e:
        print(f"请求处理错误: {str(e)}")
        return {"code": 3, "message": f"请求处理错误: {str(e)}"}

def analyze_slide_image(img_data):
    """使用OpenCV分析单张图片中的滑块缺口位置"""
    try:
        # 将图像数据转换为OpenCV格式
        img_array = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        # 转为灰度图
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 二值化
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # 边缘检测
        edges = cv2.Canny(binary, 100, 200)
        
        # 查找轮廓
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # 假设最大的几个轮廓可能是滑块或缺口
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
        
        for contour in contours:
            # 计算轮廓的外接矩形
            x, y, w, h = cv2.boundingRect(contour)
            
            # 滑块缺口通常是边缘有明显变化的区域
            # 这里使用一个简单的启发式方法：取中等大小且宽高比接近1的轮廓
            if 10 < w < 80 and 10 < h < 80 and 0.5 < w/h < 2:
                return x
        
        # 如果没有找到合适的轮廓，返回图像宽度的60%作为默认值
        # 这是一个常见的滑块位置
        return int(img.shape[1] * 0.6)
    except Exception as e:
        print(f"OpenCV分析失败: {str(e)}")
        traceback.print_exc()
        # 返回一个合理的默认值
        return 150

if __name__ == "__main__":
    print("启动OCR服务器，端口9898...")
    print("按Ctrl+C可以停止服务")
    
    try:
        uvicorn.run(app, host="0.0.0.0", port=PORT)
    except KeyboardInterrupt:
        print("服务已停止")
    except Exception as e:
        print(f"启动服务出错: {str(e)}") 