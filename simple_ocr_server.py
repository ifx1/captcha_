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
import hashlib
import asyncio
from io import BytesIO
from PIL import Image
from typing import Dict, Any, Optional, List, Tuple
from fastapi import FastAPI, Request, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from functools import lru_cache
from datetime import datetime, timedelta

# 配置日志
logging.basicConfig(
    level=logging.INFO,
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
    expose_headers=["*"],
    max_age=86400,
)

# 缓存配置
CACHE_EXPIRY = 3600  # 缓存过期时间（秒）
ocr_cache: Dict[str, Dict[str, Any]] = {}
slide_cache: Dict[str, Dict[str, Any]] = {}

# 并发控制
MAX_CONCURRENT_TASKS = 10
task_semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)

# 初始化多个OCR识别器，针对不同类型的验证码
ocr = ddddocr.DdddOcr(show_ad=False, beta=True, import_onnx_path="") # 基础版本
ocr_fast = ddddocr.DdddOcr(show_ad=False) # 标准版本，速度较快
ocr_difficult = ddddocr.DdddOcr(show_ad=False, beta=True, old=False) # 针对难识别验证码

try:
    # 尝试加载字母数字专用模型（可能不存在）
    ocr_alphanumeric = ddddocr.DdddOcr(show_ad=False, beta=True, alpha=True)
except:
    ocr_alphanumeric = None
    logger.warning("字母数字专用模型加载失败，将使用默认模型")

slide_detector = ddddocr.DdddOcr(det=False, ocr=False)

# 验证码类型检测器
class CaptchaTypeDetector:
    # 验证码类型枚举
    NUMERIC = "numeric"  # 纯数字
    ALPHANUMERIC = "alphanumeric"  # 字母数字混合
    CHINESE = "chinese"  # 中文
    MATH = "math"  # 数学运算
    COMPLEX = "complex"  # 复杂验证码
    
    @staticmethod
    def detect_type(image_data: bytes) -> str:
        """检测验证码类型"""
        try:
            # 解码图像
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return CaptchaTypeDetector.ALPHANUMERIC
            
            # 转换为灰度图
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # 图像分析特征
            height, width = gray.shape
            
            # 如果宽高比很大，可能是数学验证码
            if width / height > 3:
                return CaptchaTypeDetector.MATH
            
            # 检测是否可能包含中文
            has_chinese = CaptchaTypeDetector._check_for_chinese(gray, width, height)
            if has_chinese:
                return CaptchaTypeDetector.CHINESE
            
            # 检测是否只有数字
            is_numeric = CaptchaTypeDetector._check_if_numeric(gray)
            if is_numeric:
                return CaptchaTypeDetector.NUMERIC
            
            # 默认返回字母数字混合
            return CaptchaTypeDetector.ALPHANUMERIC
        except Exception as e:
            logger.error(f"验证码类型检测失败: {str(e)}")
            return CaptchaTypeDetector.ALPHANUMERIC
    
    @staticmethod
    def _check_for_chinese(gray_img, width, height):
        """检查是否可能包含中文字符"""
        # 中文字符通常比拉丁字符更复杂，有更多轮廓
        _, thresh = cv2.threshold(gray_img, 150, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # 计算平均轮廓复杂度和大小
        if len(contours) == 0:
            return False
        
        avg_complexity = sum(len(cnt) for cnt in contours) / len(contours)
        avg_area = sum(cv2.contourArea(cnt) for cnt in contours) / len(contours)
        
        # 中文字符通常有更高的复杂度和更大的面积
        return avg_complexity > 20 and avg_area > (width * height * 0.02)
    
    @staticmethod
    def _check_if_numeric(gray_img):
        """检查是否可能只包含数字"""
        # 数字通常更简单，轮廓更少
        _, thresh = cv2.threshold(gray_img, 150, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if len(contours) == 0:
            return False
        
        # 数字通常高度相似且间距均匀
        if 3 <= len(contours) <= 6:  # 大多数纯数字验证码为4-6位
            heights = [cv2.boundingRect(cnt)[3] for cnt in contours]
            avg_height = sum(heights) / len(heights)
            height_variance = sum((h - avg_height)**2 for h in heights) / len(heights)
            
            # 数字高度变化小
            return height_variance < (avg_height * 0.1)
        
        return False

@app.get("/")
async def root():
    return {"status": "running", "message": "验证码识别服务正常运行中"}

@app.get("/stats")
async def stats():
    """返回服务器状态和缓存统计信息"""
    return {
        "status": "running",
        "ocr_cache_size": len(ocr_cache),
        "slide_cache_size": len(slide_cache),
        "memory_usage_mb": get_memory_usage(),
        "uptime": get_uptime()
    }

def get_memory_usage() -> float:
    """获取当前进程内存使用情况（MB）"""
    try:
        import psutil
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    except ImportError:
        return 0.0

def get_uptime() -> str:
    """获取服务运行时间"""
    global start_time
    if 'start_time' not in globals():
        start_time = datetime.now()
    
    delta = datetime.now() - start_time
    days = delta.days
    hours, remainder = divmod(delta.seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    
    return f"{days}天 {hours}小时 {minutes}分钟 {seconds}秒"

def clean_expired_cache():
    """清理过期的缓存项"""
    current_time = time.time()
    
    # 清理OCR缓存
    expired_keys = [k for k, v in ocr_cache.items() if current_time - v["timestamp"] > CACHE_EXPIRY]
    for key in expired_keys:
        del ocr_cache[key]
    
    # 清理滑块缓存
    expired_keys = [k for k, v in slide_cache.items() if current_time - v["timestamp"] > CACHE_EXPIRY]
    for key in expired_keys:
        del slide_cache[key]
    
    logger.info(f"已清理过期缓存，当前OCR缓存大小: {len(ocr_cache)}，滑块缓存大小: {len(slide_cache)}")

# 定期清理缓存的后台任务
async def periodic_cache_cleanup():
    while True:
        await asyncio.sleep(1800)  # 每30分钟清理一次
        clean_expired_cache()

@app.on_event("startup")
async def startup_event():
    """应用启动时执行的操作"""
    global start_time
    start_time = datetime.now()
    # 启动定期清理缓存的后台任务
    asyncio.create_task(periodic_cache_cleanup())
    logger.info("验证码识别服务已启动")

def calculate_image_hash(image_data: bytes) -> str:
    """计算图片数据的哈希值，用于缓存键"""
    return hashlib.md5(image_data).hexdigest()

async def segment_captcha(image_data: bytes) -> List[bytes]:
    """分割验证码字符"""
    try:
        # 解码图像
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return []
        
        # 转换为灰度图
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 自适应二值化
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY_INV, 11, 2
        )
        
        # 降噪
        kernel = np.ones((2, 2), np.uint8)
        opening = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        
        # 查找轮廓
        contours, _ = cv2.findContours(opening, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # 按照x坐标排序轮廓
        contours = sorted(contours, key=lambda c: cv2.boundingRect(c)[0])
        
        # 筛选有效的字符轮廓（过滤小噪点）
        char_contours = []
        min_width = img.shape[1] * 0.05  # 最小宽度为图片宽度的5%
        min_height = img.shape[0] * 0.3  # 最小高度为图片高度的30%
        
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w >= min_width and h >= min_height:
                char_contours.append(cnt)
        
        # 如果分割出的字符过少或过多，可能分割不正确，返回空
        if len(char_contours) < 3 or len(char_contours) > 8:
            return []
        
        # 提取每个字符
        char_images = []
        for cnt in char_contours:
            x, y, w, h = cv2.boundingRect(cnt)
            # 适当扩展边界，确保字符完整
            x_pad = max(0, x - 2)
            y_pad = max(0, y - 2)
            w_pad = min(w + 4, img.shape[1] - x_pad)
            h_pad = min(h + 4, img.shape[0] - y_pad)
            
            char_img = img[y_pad:y_pad+h_pad, x_pad:x_pad+w_pad]
            
            # 转为bytes
            _, buffer = cv2.imencode('.png', char_img)
            char_images.append(buffer.tobytes())
        
        return char_images
    except Exception as e:
        logger.error(f"验证码分割失败: {str(e)}")
        return []

async def process_ocr_task(image_data: bytes, use_enhanced: bool = False) -> str:
    """处理OCR任务，使用信号量控制并发"""
    async with task_semaphore:
        # 检测验证码类型
        captcha_type = CaptchaTypeDetector.detect_type(image_data)
        logger.info(f"检测到验证码类型: {captcha_type}")
        
        # 先增强图像
        if use_enhanced:
            image_data = await enhance_image(image_data, captcha_type)
        
        # 使用线程池执行耗时操作
        loop = asyncio.get_running_loop()
        
        # 根据验证码类型选择最佳识别策略
        if captcha_type == CaptchaTypeDetector.NUMERIC:
            # 对于数字验证码，使用专门处理
            result = await loop.run_in_executor(None, ocr.classification, image_data)
            # 过滤非数字字符
            result = ''.join(c for c in result if c.isdigit())
            
        elif captcha_type == CaptchaTypeDetector.ALPHANUMERIC:
            # 字母数字混合，尝试多个引擎
            if ocr_alphanumeric:
                result1 = await loop.run_in_executor(None, ocr_alphanumeric.classification, image_data)
            else:
                result1 = await loop.run_in_executor(None, ocr.classification, image_data)
                
            result2 = await loop.run_in_executor(None, ocr_difficult.classification, image_data)
            
            # 检查结果长度和复杂度，选择最可能的结果
            result = choose_best_result(result1, result2)
            
            # 如果结果包含特殊字符，尝试分割识别
            if has_special_chars(result) and len(result) > 2:
                char_images = await segment_captcha(image_data)
                if char_images:
                    seg_results = []
                    for char_img in char_images:
                        char_result = await loop.run_in_executor(None, ocr.classification, char_img)
                        seg_results.append(char_result)
                    
                    # 如果分割识别的结果合理，使用它
                    seg_result = ''.join(r for r in seg_results if len(r) <= 1)
                    if 3 <= len(seg_result) <= 8 and not has_special_chars(seg_result):
                        result = seg_result
            
        elif captcha_type == CaptchaTypeDetector.CHINESE:
            # 中文验证码
            result = await loop.run_in_executor(None, ocr.classification, image_data)
            
        elif captcha_type == CaptchaTypeDetector.MATH:
            # 数学运算验证码，需要特殊处理
            result = await loop.run_in_executor(None, ocr.classification, image_data)
            # 尝试计算结果
            math_result = try_solve_math_captcha(result)
            if math_result:
                result = math_result
                
        else:
            # 默认处理
            result1 = await loop.run_in_executor(None, ocr.classification, image_data)
            result2 = await loop.run_in_executor(None, ocr_difficult.classification, image_data)
            result = choose_best_result(result1, result2)
        
        # 后处理
        result = post_process_result(result, captcha_type)
        return result

def try_solve_math_captcha(text: str) -> str:
    """尝试解析并计算数学验证码的结果"""
    try:
        # 清理文本
        text = text.replace(' ', '').replace('×', '*').replace('÷', '/').replace('=', '').replace('?', '')
        
        # 检查是否包含数学运算符
        if any(op in text for op in ['+', '-', '*', '/']):
            # 安全的eval计算
            result = eval(text)
            return str(int(result))
    except:
        pass
    return ""

def post_process_result(result: str, captcha_type: str) -> str:
    """对识别结果进行后处理，提高准确性"""
    # 移除常见的错误字符
    result = result.replace(' ', '').replace('\n', '').replace('\t', '')
    
    # 根据类型进行特定处理
    if captcha_type == CaptchaTypeDetector.NUMERIC:
        # 纯数字验证码
        result = ''.join(c for c in result if c.isdigit())
    elif captcha_type == CaptchaTypeDetector.ALPHANUMERIC:
        # 字母数字混合
        result = ''.join(c for c in result if c.isalnum())
        # 常见误识别修正
        result = result.replace('0', 'O').replace('1', 'I').replace('5', 'S')
    
    # 处理长度异常的结果
    if len(result) > 8:  # 大多数验证码不会超过8个字符
        result = result[:8]
    
    return result

def choose_best_result(result1: str, result2: str) -> str:
    """从多个识别结果中选择最可能正确的结果"""
    # 如果结果相同，直接返回
    if result1 == result2:
        return result1
    
    # 检查结果长度，一般验证码长度为4-6个字符
    if 4 <= len(result1) <= 6 and not (4 <= len(result2) <= 6):
        return result1
    if not (4 <= len(result1) <= 6) and 4 <= len(result2) <= 6:
        return result2
    
    # 检查结果中是否包含特殊字符
    if has_special_chars(result1) and not has_special_chars(result2):
        return result2
    if not has_special_chars(result1) and has_special_chars(result2):
        return result1
    
    # 优先返回数字字母混合的结果
    if contains_letters_and_digits(result1) and not contains_letters_and_digits(result2):
        return result1
    if not contains_letters_and_digits(result1) and contains_letters_and_digits(result2):
        return result2
    
    # 默认返回第一个结果
    return result1

def has_special_chars(text: str) -> bool:
    """检查文本是否包含特殊字符"""
    import re
    return bool(re.search(r'[^a-zA-Z0-9]', text))

def contains_letters_and_digits(text: str) -> bool:
    """检查文本是否同时包含字母和数字"""
    has_letter = any(c.isalpha() for c in text)
    has_digit = any(c.isdigit() for c in text)
    return has_letter and has_digit

async def enhance_image(image_data: bytes, captcha_type: str) -> bytes:
    """增强图像质量，提高识别率"""
    try:
        # 解码图像
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            logger.warning("图像解码失败，返回原始数据")
            return image_data
        
        # 转换为灰度图
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 根据验证码类型应用不同的增强策略
        if captcha_type == CaptchaTypeDetector.NUMERIC:
            # 数字验证码通常较简单，使用简单增强
            enhanced = apply_numeric_enhancement(gray)
        elif captcha_type == CaptchaTypeDetector.ALPHANUMERIC:
            # 字母数字混合验证码，使用标准增强
            enhanced = apply_alphanumeric_enhancement(gray)
        elif captcha_type == CaptchaTypeDetector.CHINESE:
            # 中文验证码需要保留更多细节
            enhanced = apply_chinese_enhancement(gray)
        else:
            # 默认增强方法
            enhanced = apply_default_enhancement(gray)
        
        # 编码回bytes
        _, buffer = cv2.imencode('.png', enhanced)
        return buffer.tobytes()
    except Exception as e:
        logger.error(f"图像增强处理失败: {str(e)}")
        return image_data

def apply_numeric_enhancement(gray: np.ndarray) -> np.ndarray:
    """应用适合数字验证码的增强"""
    # 二值化处理
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 去除小噪点
    kernel = np.ones((2, 2), np.uint8)
    opening = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    
    return opening

def apply_alphanumeric_enhancement(gray: np.ndarray) -> np.ndarray:
    """应用适合字母数字混合验证码的增强"""
    # 自适应二值化
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 11, 2
    )
    
    # 降噪
    denoised = cv2.fastNlMeansDenoising(binary, None, 10, 7, 21)
    
    # 增强对比度
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(denoised)
    
    # 锐化
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    sharpened = cv2.filter2D(enhanced, -1, kernel)
    
    return sharpened

def apply_chinese_enhancement(gray: np.ndarray) -> np.ndarray:
    """应用适合中文验证码的增强"""
    # 高斯模糊去噪
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    
    # 自适应直方图均衡化
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(blurred)
    
    # 使用Canny边缘检测强化边缘
    edges = cv2.Canny(enhanced, 50, 150)
    
    # 合并原图和边缘
    result = cv2.addWeighted(enhanced, 0.7, edges, 0.3, 0)
    
    return result

def apply_default_enhancement(gray: np.ndarray) -> np.ndarray:
    """默认图像增强处理"""
    # 高斯模糊去噪
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    
    # 自适应二值化
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 11, 2
    )
    
    # 形态学操作去除小噪点
    kernel = np.ones((2, 2), np.uint8)
    opening = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    
    return opening

async def process_slide_task(bg_data: bytes, slide_data: bytes) -> Dict[str, Any]:
    """处理滑块识别任务，使用信号量控制并发"""
    async with task_semaphore:
        # 使用线程池执行耗时操作
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, slide_detector.slide_match, bg_data, slide_data)
        return result

@app.post("/ocr")
async def recognize_captcha(request: Request, background_tasks: BackgroundTasks):
    """
    识别图形验证码
    
    请求格式: {"image": "base64编码的图片数据", "enhanced": true/false}
    返回格式: {"code": 0, "data": "识别结果", "from_cache": true|false}
    """
    try:
        # 获取请求数据
        data = await request.json()
        
        if "image" not in data:
            return {"code": 1, "message": "缺少image参数"}
        
        # 是否使用增强模式
        use_enhanced = data.get("enhanced", True)
        
        # 解码base64图片
        image_data = base64.b64decode(data["image"])
        
        # 计算图片哈希值
        image_hash = calculate_image_hash(image_data)
        
        # 检查缓存
        if image_hash in ocr_cache:
            cache_item = ocr_cache[image_hash]
            logger.info(f"缓存命中: {cache_item['result']}")
            
            # 更新缓存时间戳
            cache_item["timestamp"] = time.time()
            cache_item["hits"] += 1
            
            return {"code": 0, "data": cache_item["result"], "from_cache": True}
        
        # 识别验证码
        start_time = time.time()
        result = await process_ocr_task(image_data, use_enhanced)
        elapsed = time.time() - start_time
        
        # 存入缓存
        ocr_cache[image_hash] = {
            "result": result,
            "timestamp": time.time(),
            "hits": 1
        }
        
        # 在后台清理缓存
        if len(ocr_cache) > 1000:  # 如果缓存超过1000项，触发清理
            background_tasks.add_task(clean_expired_cache)
        
        logger.info(f"识别成功: {result}, 耗时: {elapsed:.3f}秒")
        return {"code": 0, "data": result, "from_cache": False}
    except Exception as e:
        logger.error(f"识别失败: {str(e)}")
        return {"code": 1, "message": f"识别失败: {str(e)}"}

@app.post("/feedback")
async def receive_feedback(request: Request):
    """
    接收验证码识别结果反馈，用于改进识别效果
    
    请求格式: {"image": "base64编码的图片数据", "correct_result": "正确的验证码结果"}
    返回格式: {"code": 0, "message": "反馈已记录"}
    """
    try:
        # 获取请求数据
        data = await request.json()
        
        if "image" not in data or "correct_result" not in data:
            return {"code": 1, "message": "缺少必要参数"}
        
        # 解码base64图片
        image_data = base64.b64decode(data["image"])
        correct_result = data["correct_result"]
        
        # 计算图片哈希值
        image_hash = calculate_image_hash(image_data)
        
        # 记录正确结果到缓存（覆盖原有结果）
        ocr_cache[image_hash] = {
            "result": correct_result,
            "timestamp": time.time(),
            "hits": 1,
            "is_feedback": True  # 标记为用户反馈的结果
        }
        
        logger.info(f"接收到用户反馈: 图片哈希 {image_hash}, 正确结果: {correct_result}")
        return {"code": 0, "message": "反馈已记录"}
    except Exception as e:
        logger.error(f"接收反馈失败: {str(e)}")
        return {"code": 1, "message": f"接收反馈失败: {str(e)}"}

@app.post("/slide")
async def recognize_slider(request: Request, background_tasks: BackgroundTasks):
    """
    识别滑块验证码
    
    请求格式: {"bg_image": "背景图base64", "slide_image": "滑块图base64"} 
             或 {"full_image": "完整截图base64"}
    返回格式: {"code": 0, "data": {"x": 横向距离, "y": 纵向距离}, "from_cache": true|false}
    """
    try:
        data = await request.json()
        
        if "bg_image" in data and "slide_image" in data:
            # 解码背景图和滑块图
            bg_data = base64.b64decode(data["bg_image"])
            slide_data = base64.b64decode(data["slide_image"])
            
            # 计算组合哈希值
            combined_hash = calculate_image_hash(bg_data + slide_data)
            
            # 检查缓存
            if combined_hash in slide_cache:
                cache_item = slide_cache[combined_hash]
                logger.info(f"滑块缓存命中: {cache_item['result']}")
                
                # 更新缓存时间戳
                cache_item["timestamp"] = time.time()
                cache_item["hits"] += 1
                
                return {"code": 0, "data": cache_item["result"], "from_cache": True}
            
            # 使用ddddocr识别滑块位置
            start_time = time.time()
            res = await process_slide_task(bg_data, slide_data)
            elapsed = time.time() - start_time
            
            result = {"x": res['target'][0], "y": res['target'][1]}
            
            # 存入缓存
            slide_cache[combined_hash] = {
                "result": result,
                "timestamp": time.time(),
                "hits": 1
            }
            
            # 在后台清理缓存
            if len(slide_cache) > 500:  # 如果缓存超过500项，触发清理
                background_tasks.add_task(clean_expired_cache)
            
            logger.info(f"滑块识别成功: {result}, 耗时: {elapsed:.3f}秒")
            return {"code": 0, "data": result, "from_cache": False}
            
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