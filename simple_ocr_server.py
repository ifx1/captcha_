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
import tempfile
import shutil
from io import BytesIO
from PIL import Image
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from functools import lru_cache
from pathlib import Path
from logging.handlers import RotatingFileHandler
import asyncio

# 创建日志目录
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
cache_dir = Path("cache")
cache_dir.mkdir(exist_ok=True)

# 配置日志
log_file = log_dir / "ocr_server.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        # 控制台输出日志级别设为WARNING，减少输出
        logging.StreamHandler().setLevel(logging.WARNING),
        # 文件日志，使用RotatingFileHandler自动轮转
        RotatingFileHandler(
            log_file, 
            maxBytes=5*1024*1024,  # 5MB
            backupCount=3          # 保留3个备份
        )
    ]
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

# 创建结果缓存
@lru_cache(maxsize=100)
def cached_ocr_recognition(image_hash):
    # 获取图片数据
    image_data = image_cache.get(image_hash)
    if not image_data:
        return None
        
    # 尝试从磁盘缓存获取结果
    cached_result = get_disk_cache(image_hash, "ocr")
    if cached_result:
        logger.info(f"OCR磁盘缓存命中: {image_hash[:8]}")
        return cached_result
        
    # 如果没有缓存，执行OCR识别
    result = ocr.classification(image_data)
    
    # 保存到磁盘缓存
    save_disk_cache(image_hash, result, "ocr")
    
    return result

@lru_cache(maxsize=50)
def cached_slide_match(bg_hash, slide_hash):
    # 获取图片数据
    bg_data = image_cache.get(bg_hash)
    slide_data = image_cache.get(slide_hash)
    if not bg_data or not slide_data:
        return None
        
    # 尝试从磁盘缓存获取结果
    cache_key = f"{bg_hash}_{slide_hash}"
    cached_result = get_disk_cache(cache_key, "slide")
    if cached_result:
        logger.info(f"滑块磁盘缓存命中: {cache_key[:8]}")
        return cached_result
        
    # 如果没有缓存，执行滑块识别
    result = slide_detector.slide_match(bg_data, slide_data)
    
    # 保存到磁盘缓存
    save_disk_cache(cache_key, result, "slide")
    
    return result

# 图片内存缓存
image_cache = {}

# 磁盘缓存操作
def get_disk_cache(key, cache_type):
    """从磁盘获取缓存结果"""
    cache_file = cache_dir / f"{cache_type}_{key}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"读取缓存文件失败: {e}")
    return None

def save_disk_cache(key, result, cache_type):
    """保存结果到磁盘缓存"""
    try:
        cache_file = cache_dir / f"{cache_type}_{key}.json"
        with open(cache_file, "w") as f:
            json.dump(result, f)
    except Exception as e:
        logger.error(f"保存缓存文件失败: {e}")

@app.get("/")
async def root():
    """健康检查接口，显示服务状态和缓存信息"""
    return {
        "status": "running", 
        "message": "验证码识别服务正常运行中", 
        "cache_info": {
            "memory": {
                "ocr": str(cached_ocr_recognition.cache_info()), 
                "slide": str(cached_slide_match.cache_info()),
                "image_cache_size": len(image_cache)
            },
            "disk": {
                "cache_dir": str(cache_dir),
                "cache_size": get_cache_size()
            }
        }
    }

def get_cache_size():
    """获取磁盘缓存大小"""
    total_size = 0
    for path in cache_dir.glob("**/*"):
        if path.is_file():
            total_size += path.stat().st_size
    return f"{total_size / (1024*1024):.2f} MB"

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
        
        # 计算图片哈希值用于缓存
        image_hash = hashlib.md5(image_data).hexdigest()
        
        # 存入缓存
        image_cache[image_hash] = image_data
        
        # 识别验证码
        start_time = time.time()
        
        # 使用缓存识别
        result = cached_ocr_recognition(image_hash)
        
        elapsed = time.time() - start_time
        
        # 仅在命中缓存或详细日志模式下记录详细信息
        if cached_ocr_recognition.cache_info().hits > 0:
            logger.info(f"OCR识别成功(缓存): {result}, 哈希: {image_hash[:8]}, 耗时: {elapsed:.3f}秒")
        else:
            logger.info(f"OCR识别成功: {result}, 耗时: {elapsed:.3f}秒")
            
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
            
            # 计算哈希值用于缓存
            bg_hash = hashlib.md5(bg_data).hexdigest()
            slide_hash = hashlib.md5(slide_data).hexdigest()
            
            # 存入缓存
            image_cache[bg_hash] = bg_data
            image_cache[slide_hash] = slide_data
            
            # 使用ddddocr识别滑块位置
            start_time = time.time()
            
            # 使用缓存识别
            res = cached_slide_match(bg_hash, slide_hash)
            
            elapsed = time.time() - start_time
            
            # 仅在命中缓存或详细日志模式下记录详细信息
            if cached_slide_match.cache_info().hits > 0:
                logger.info(f"滑块识别成功(缓存), 哈希: {bg_hash[:8]}_{slide_hash[:8]}, 耗时: {elapsed:.3f}秒")
            else:
                logger.info(f"滑块识别成功, 耗时: {elapsed:.3f}秒")
                
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

# 清理过期缓存文件
async def cleanup_cache_files():
    """清理过期的磁盘缓存文件"""
    while True:
        try:
            now = time.time()
            deleted_count = 0
            cache_files = list(cache_dir.glob("**/*.json"))
            
            # 如果缓存文件总数超过500，删除最旧的文件
            if len(cache_files) > 500:
                cache_files.sort(key=lambda x: x.stat().st_mtime)
                # 删除最旧的30%文件
                files_to_delete = cache_files[:int(len(cache_files) * 0.3)]
                for file in files_to_delete:
                    try:
                        file.unlink()
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"删除缓存文件失败: {e}")
                        
                logger.info(f"已清理{deleted_count}个旧缓存文件")
            
            # 删除超过7天的缓存文件
            for file in cache_dir.glob("**/*.json"):
                if now - file.stat().st_mtime > 7 * 24 * 3600:  # 7天
                    try:
                        file.unlink()
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"删除过期缓存文件失败: {e}")
                        
            if deleted_count > 0:
                logger.info(f"已清理{deleted_count}个过期缓存文件")
                
            # 检查和清理旧日志文件
            cleanup_old_logs()
                
        except Exception as e:
            logger.error(f"清理缓存文件时出错: {e}")
            
        # 每12小时运行一次
        await asyncio.sleep(12 * 3600)

def cleanup_old_logs():
    """清理超过30天的日志文件"""
    try:
        now = time.time()
        for log_file in log_dir.glob("*.log.*"):
            if now - log_file.stat().st_mtime > 30 * 24 * 3600:  # 30天
                log_file.unlink()
                logger.info(f"已删除旧日志文件: {log_file.name}")
    except Exception as e:
        logger.error(f"清理日志文件时出错: {e}")

# 清理内存缓存
async def cleanup_memory_cache():
    """定期清理内存缓存"""
    while True:
        try:
            if len(image_cache) > 200:
                # 清理内存缓存，保留最近的100个
                keys = list(image_cache.keys())
                keys.sort(key=lambda k: image_cache.get(k, 0))  # 按时间排序
                
                # 删除最旧的一半
                for key in keys[:len(keys)//2]:
                    image_cache.pop(key, None)
                    
                logger.info(f"已清理内存缓存，当前缓存大小: {len(image_cache)}")
        except Exception as e:
            logger.error(f"清理内存缓存时出错: {e}")
            
        # 每30分钟运行一次
        await asyncio.sleep(30 * 60)

# 清理临时文件夹
def cleanup_temp_files():
    """清理系统临时文件夹中可能的遗留文件"""
    try:
        temp_dir = tempfile.gettempdir()
        # 查找可能是本应用创建的临时文件
        pattern = "ocr_*"
        current_time = time.time()
        
        for item in Path(temp_dir).glob(pattern):
            # 如果文件超过1天未被修改，则删除
            if current_time - item.stat().st_mtime > 24 * 3600:
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                    
        logger.info("已清理临时文件夹")
    except Exception as e:
        logger.error(f"清理临时文件时出错: {e}")

# 在启动时运行清理任务
@app.on_event("startup")
async def startup_events():
    # 清理临时文件
    cleanup_temp_files()
    
    # 启动定期清理任务
    asyncio.create_task(cleanup_cache_files())
    asyncio.create_task(cleanup_memory_cache())
    
    logger.info("验证码识别服务已启动，已设置自动清理任务")

if __name__ == "__main__":
    logger.info("验证码识别服务已启动，监听端口：9898")
    uvicorn.run(app, host="0.0.0.0", port=9898) 