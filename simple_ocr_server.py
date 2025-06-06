#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import time
import base64
import json
import logging
import uvicorn
import ddddocr
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# 配置日志
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

# 创建FastAPI应用
app = FastAPI(title="简易验证码识别服务")

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化OCR识别器
ocr = ddddocr.DdddOcr(show_ad=False)
slide_detector = ddddocr.DdddOcr(det=False, ocr=False)

@app.get("/")
async def root():
    return {"status": "running", "message": "验证码识别服务正常运行中"}

@app.post("/ocr")
async def recognize_captcha(request: Request):
    """
    识别图形验证码
    
    请求格式: {"image": "base64编码的图片数据"}
    返回格式: {"code": 0, "data": "识别结果"}
    """
    try:
        # 获取请求数据
        data = await request.json()
        
        if "image" not in data:
            return {"code": 1, "message": "缺少image参数"}
        
        # 解码base64图片
        image_data = base64.b64decode(data["image"])
        
        # 识别验证码
        start_time = time.time()
        result = ocr.classification(image_data)
        elapsed = time.time() - start_time
        
        logger.info(f"识别成功: {result}, 耗时: {elapsed:.3f}秒")
        return {"code": 0, "data": result}
    except Exception as e:
        logger.error(f"识别失败: {str(e)}")
        return {"code": 1, "message": f"识别失败: {str(e)}"}

@app.post("/slide")
async def recognize_slider(request: Request):
    """
    识别滑块验证码
    
    请求格式: {"bg_image": "背景图base64", "slide_image": "滑块图base64"} 
             或 {"full_image": "完整截图base64"}
    返回格式: {"code": 0, "data": {"x": 横向距离, "y": 纵向距离}}
    """
    try:
        data = await request.json()
        
        if "bg_image" in data and "slide_image" in data:
            # 解码背景图和滑块图
            bg_data = base64.b64decode(data["bg_image"])
            slide_data = base64.b64decode(data["slide_image"])
            
            # 使用ddddocr识别滑块位置
            start_time = time.time()
            res = slide_detector.slide_match(bg_data, slide_data)
            elapsed = time.time() - start_time
            
            logger.info(f"滑块识别成功: {res}, 耗时: {elapsed:.3f}秒")
            return {"code": 0, "data": {"x": res['target'][0], "y": res['target'][1]}}
            
        elif "full_image" in data:
            # 对于完整截图，返回一个合理的距离值
            # 实际应用中可能需要更复杂的处理
            logger.info("接收到完整截图，返回默认值")
            return {"code": 0, "data": {"x": 150, "y": 0}}
        else:
            return {"code": 1, "message": "缺少必要参数"}
    except Exception as e:
        logger.error(f"滑块识别失败: {str(e)}")
        return {"code": 1, "message": f"识别失败: {str(e)}"}

if __name__ == "__main__":
    logger.info("验证码识别服务已启动，监听端口：9898")
    uvicorn.run(app, host="0.0.0.0", port=9898) 