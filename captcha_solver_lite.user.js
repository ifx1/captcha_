// ==UserScript==
// @name         极简验证码识别工具
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  极简版验证码识别工具，支持图形验证码和滑块验证码
// @author       laozig
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      *
// @connect      107.173.230.114
// @homepage     https://github.com/laozig/captcha_.git
// @updateURL    https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js
// @downloadURL  https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js
// ==/UserScript==

(function() {
    'use strict';
    
    // OCR服务器地址 - 已修改为您的服务器IP地址
    const OCR_SERVER = 'http://107.173.230.114:9898/ocr';
    const SLIDE_SERVER = 'http://107.173.230.114:9898/slide';
    
    // 配置
    const config = {
        autoMode: true,  // 自动识别验证码
        checkInterval: 1500,  // 自动检查间隔(毫秒)
        debug: true,  // 是否显示调试信息
        delay: 500,  // 点击验证码后的识别延迟(毫秒)
        loginDelay: 800,  // 点击登录按钮后的识别延迟(毫秒)
        popupCheckDelay: 1000,  // 弹窗检查延迟(毫秒)
        popupMaxChecks: 5,  // 弹窗出现后最大检查次数
        searchDepth: 5,  // 搜索深度级别，越大搜索越深
        maxSearchDistance: 500,  // 查找输入框的最大距离
        sliderEnabled: true,  // 是否启用滑块验证码支持
        sliderDelay: 500,  // 滑块验证码延迟(毫秒)
        sliderSpeed: 20,  // 滑块拖动速度，越大越慢
        sliderAccuracy: 5,  // 滑块拖动精度，像素误差范围
        initialSliderCheckDelay: 2000,  // 初始滑块检查延迟(毫秒)
        forceSliderCheck: true,  // 强制定期检查滑块验证码
        useSlideAPI: true  // 是否使用服务器API进行滑块分析
    };
    
    // 存储识别过的验证码和当前处理的验证码
    let processedCaptchas = new Set();
    let currentCaptchaImg = null;
    let currentCaptchaInput = null;
    let popupCheckCount = 0;
    let popupCheckTimer = null;
    
    // 初始化
    function init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onDOMReady);
        } else {
            onDOMReady();
        }
        
        // 显示服务器连接信息
        if (config.debug) {
            console.log('[验证码] 服务器地址: ' + OCR_SERVER);
            console.log('[验证码] 调试模式已开启');
            
            // 测试服务器连接
            testServerConnection();
        }
    }
    
    // 测试服务器连接
    function testServerConnection() {
        console.log('[验证码] 正在测试服务器连接...');
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: OCR_SERVER.replace('/ocr', '/'),
            timeout: 5000,
            onload: function(response) {
                try {
                    const result = JSON.parse(response.responseText);
                    console.log('[验证码] 服务器连接成功:', result);
                } catch (e) {
                    console.log('[验证码] 服务器响应解析错误:', e);
                }
            },
            onerror: function(error) {
                console.log('[验证码] 服务器连接失败:', error);
                console.log('[验证码] 请确认服务器地址是否正确，并检查服务器是否已启动');
            },
            ontimeout: function() {
                console.log('[验证码] 服务器连接超时，请检查服务器是否已启动');
            }
        });
    }
    
    // 页面加载完成后执行
    function onDOMReady() {
        // 立即检查一次
        setTimeout(() => {
            checkForCaptcha(true);
        }, 1000);
        
        // 初始滑块检查
        if (config.sliderEnabled) {
            setTimeout(() => {
                checkForSliderCaptcha(true);
            }, config.initialSliderCheckDelay);
        }
        
        // 开始定期检查
        setInterval(() => {
            checkForCaptcha();
        }, config.checkInterval);
        
        // 定期检查滑块验证码
        if (config.sliderEnabled) {
            setInterval(() => {
                if (config.forceSliderCheck) {
                    checkForSliderCaptcha(true);
                } else {
                    checkForSliderCaptcha();
                }
            }, config.checkInterval * 2);
        }
        
        // 监听页面变化
        observePageChanges();
        
        // 监听验证码点击事件（用户手动刷新）
        listenForCaptchaClicks();
        
        // 监听登录按钮点击事件
        listenForLoginButtonClicks();
        
        // 监听弹窗出现
        observePopups();
    }
    
    // 监听页面变化，检测新加载的验证码
    function observePageChanges() {
        // 创建MutationObserver实例
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            let popupDetected = false;
            let sliderDetected = false;
            
            for (const mutation of mutations) {
                // 检查新添加的节点
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        // 检查是否添加了图片
                        if (node.tagName === 'IMG' || 
                            (node.nodeType === 1 && node.querySelector('img'))) {
                            shouldCheck = true;
                        }
                        
                        // 检查是否添加了弹窗
                        if (node.nodeType === 1 && isPossiblePopup(node)) {
                            popupDetected = true;
                            if (config.debug) console.log('[验证码] 检测到可能的弹窗:', node);
                        }
                        
                        // 检查是否添加了滑块验证码
                        if (node.nodeType === 1 && config.sliderEnabled && isPossibleSlider(node)) {
                            sliderDetected = true;
                            if (config.debug) console.log('[验证码] 检测到可能的滑块验证码:', node);
                        }
                    }
                }
                // 检查属性变化（可能是验证码刷新或弹窗显示）
                else if (mutation.type === 'attributes') {
                    if (mutation.attributeName === 'src' && mutation.target.tagName === 'IMG') {
                        shouldCheck = true;
                    }
                    else if (['style', 'class', 'display', 'visibility'].includes(mutation.attributeName)) {
                        // 检查是否是弹窗显示
                        if (isPossiblePopup(mutation.target)) {
                            const styles = window.getComputedStyle(mutation.target);
                            if (styles.display !== 'none' && styles.visibility !== 'hidden') {
                                popupDetected = true;
                                if (config.debug) console.log('[验证码] 检测到弹窗显示:', mutation.target);
                            }
                        }
                        
                        // 检查是否是滑块验证码显示
                        if (config.sliderEnabled && isPossibleSlider(mutation.target)) {
                            const styles = window.getComputedStyle(mutation.target);
                            if (styles.display !== 'none' && styles.visibility !== 'hidden') {
                                sliderDetected = true;
                                if (config.debug) console.log('[验证码] 检测到滑块验证码显示:', mutation.target);
                            }
                        }
                        
                        // 元素显示状态变化可能意味着验证码出现
                        shouldCheck = true;
                    }
                }
            }
            
            if (shouldCheck) {
                // 延迟一点再检查验证码
                setTimeout(() => {
                    checkForCaptcha();
                }, config.delay);
            }
            
            if (popupDetected) {
                // 检测到弹窗，开始多次检查验证码
                startPopupChecks();
            }
            
            if (sliderDetected && config.sliderEnabled) {
                // 检测到滑块验证码，延迟一点再处理
                setTimeout(() => {
                    checkForSliderCaptcha();
                }, config.sliderDelay);
            }
        });
        
        // 开始观察整个文档
        observer.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class', 'display', 'visibility']
        });
    }
    
    // 检查元素是否可能是弹窗
    function isPossiblePopup(element) {
        if (!element || !element.tagName) return false;
        
        // 弹窗常见类名和ID特征
        const popupClasses = ['modal', 'dialog', 'popup', 'layer', 'overlay', 'mask', 'window'];
        
        // 检查类名和ID
        const className = (element.className || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        
        for (const cls of popupClasses) {
            if (className.includes(cls) || id.includes(cls)) return true;
        }
        
        // 检查角色属性
        const role = element.getAttribute('role');
        if (role && ['dialog', 'alertdialog'].includes(role)) return true;
        
        // 检查弹窗样式特征
        const styles = window.getComputedStyle(element);
        if (styles.position === 'fixed' && 
            (styles.zIndex > 100 || styles.zIndex === 'auto') && 
            styles.display !== 'none' && 
            styles.visibility !== 'hidden') {
            
            // 检查尺寸，弹窗通常较大
            const rect = element.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 200) return true;
        }
        
        return false;
    }
    
    // 开始多次检查弹窗中的验证码
    function startPopupChecks() {
        // 清除之前的定时器
        if (popupCheckTimer) {
            clearInterval(popupCheckTimer);
        }
        
        // 重置计数器
        popupCheckCount = 0;
        
        // 立即检查一次
        setTimeout(() => {
            checkForCaptcha(true, true);
        }, config.popupCheckDelay);
        
        // 设置定时器，连续多次检查
        popupCheckTimer = setInterval(() => {
            popupCheckCount++;
            
            if (popupCheckCount < config.popupMaxChecks) {
                checkForCaptcha(true, true);
            } else {
                // 达到最大检查次数，停止检查
                clearInterval(popupCheckTimer);
            }
        }, config.popupCheckDelay * 2);
    }
    
    // 监听登录按钮点击事件
    function listenForLoginButtonClicks() {
        document.addEventListener('click', event => {
            // 检查是否点击了可能的登录按钮
            const element = event.target;
            
            if (isLoginButton(element)) {
                if (config.debug) console.log('[验证码] 检测到点击登录按钮，稍后将检查验证码');
                
                // 延迟检查验证码，给验证码加载的时间
                setTimeout(() => {
                    checkForCaptcha(true);
                    
                    // 检查滑块验证码
                    if (config.sliderEnabled) {
                        checkForSliderCaptcha();
                    }
                    
                    // 再次延迟检查，因为有些网站验证码加载较慢
                    setTimeout(() => {
                        checkForCaptcha(true);
                        
                        // 再次检查滑块验证码
                        if (config.sliderEnabled) {
                            checkForSliderCaptcha();
                        }
                    }, config.loginDelay * 2);
                    
                    // 启动弹窗检查
                    startPopupChecks();
                }, config.loginDelay);
            }
        });
    }
    
    // 判断元素是否是登录按钮
    function isLoginButton(element) {
        // 如果点击的是按钮内部的元素，获取父级按钮
        let target = element;
        if (!isButton(target)) {
            const parent = target.closest('button, input[type="submit"], input[type="button"], a.btn, a.button, .login, .submit');
            if (parent) {
                target = parent;
            }
        }
        
        // 检查是否是按钮元素
        if (!isButton(target)) return false;
        
        // 基于文本判断是否是登录按钮
        const text = getElementText(target).toLowerCase();
        const buttonTypes = ['登录', '登陆', '提交', '确定', 'login', 'submit', 'sign in', 'signin', 'log in'];
        
        for (const type of buttonTypes) {
            if (text.includes(type)) return true;
        }
        
        // 基于ID、类名和name属性判断
        const props = [
            target.id || '', 
            target.className || '', 
            target.name || '',
            target.getAttribute('value') || ''
        ].map(p => p.toLowerCase());
        
        for (const prop of props) {
            for (const type of buttonTypes) {
                if (prop.includes(type)) return true;
            }
        }
        
        return false;
    }
    
    // 判断元素是否是按钮
    function isButton(element) {
        if (!element || !element.tagName) return false;
        
        const tag = element.tagName.toLowerCase();
        return tag === 'button' || 
               (tag === 'input' && (element.type === 'submit' || element.type === 'button')) ||
               (tag === 'a' && (element.className.includes('btn') || element.className.includes('button'))) ||
               element.getAttribute('role') === 'button';
    }
    
    // 获取元素文本内容
    function getElementText(element) {
        return element.textContent || element.value || element.innerText || '';
    }
    
    // 监听验证码点击事件（用户手动刷新）
    function listenForCaptchaClicks() {
        document.addEventListener('click', event => {
            // 检查是否点击了图片
            if (event.target.tagName === 'IMG') {
                const img = event.target;
                
                // 判断是否可能是验证码图片
                if (isCaptchaImage(img)) {
                    if (config.debug) console.log('[验证码] 检测到用户点击了验证码图片，等待新验证码加载...');
                    
                    // 延迟后识别新验证码
                    setTimeout(() => {
                        currentCaptchaImg = img;  // 设置为当前验证码
                        checkForCaptcha(true);  // 强制识别
                    }, config.delay);
                }
            }
        });
    }
    
    // 监听弹窗出现
    function observePopups() {
        // 特殊情况：iframe弹窗
        try {
            // 检查当前页面是否在iframe中
            if (window.top !== window.self) {
                // 如果是iframe，可能是验证码弹窗，自动检查验证码
                setTimeout(() => {
                    checkForCaptcha(true);
                }, 1000);
            }
        } catch (e) {
            // 可能有跨域问题，忽略错误
        }
    }
    
    // 判断图片是否可能是验证码
    function isCaptchaImage(img) {
        // 验证码常见特征
        const src = (img.src || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const title = (img.title || '').toLowerCase();
        const className = (img.className || '').toLowerCase();
        const id = (img.id || '').toLowerCase();
        
        // 检查所有属性是否包含验证码相关关键词
        const captchaKeywords = ['captcha', 'verify', 'vcode', 'yzm', 'yanzheng', 'code', 'check', 
                                'authcode', 'seccode', 'validate', 'verification', '验证码', '验证', '校验码'];
        
        // 检查图片各种属性
        for (const keyword of captchaKeywords) {
            if (src.includes(keyword) || alt.includes(keyword) || title.includes(keyword) || 
                className.includes(keyword) || id.includes(keyword)) {
                return true;
            }
        }
        
        // 基于图片尺寸判断
        if (img.complete && img.naturalWidth > 0) {
            // 验证码图片通常较小，但不会太小
            if (img.naturalWidth >= 20 && img.naturalWidth <= 200 &&
                img.naturalHeight >= 20 && img.naturalHeight <= 100) {
                
                // 排除明显不是验证码的图片
                if (img.naturalWidth === img.naturalHeight) return false; // 正方形可能是图标
                if (src.includes('logo') || src.includes('icon')) return false;
                
                // 验证码宽高比通常在1:1到5:1之间
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio >= 1 && ratio <= 5) return true;
            }
        }
        
        return false;
    }
    
    // 主函数：检查验证码
    function checkForCaptcha(isForceCheck = false, isPopupCheck = false) {
        if (isForceCheck) {
            if (config.debug) {
                if (isPopupCheck) {
                    console.log('[验证码] 检查弹窗中的验证码...');
                } else {
                    console.log('[验证码] 强制检查验证码...');
                }
            }
            processedCaptchas.clear();
        }
        
        // 查找验证码图片
        const captchaImg = findCaptchaImage(isPopupCheck);
        
        // 如果没找到验证码图片，直接返回
        if (!captchaImg) return;
        
        // 检查是否已经处理过该验证码
        const imageKey = captchaImg.src || captchaImg.id || captchaImg.className;
        if (!isForceCheck && processedCaptchas.has(imageKey)) return;
        
        if (config.debug) console.log('[验证码] 找到验证码图片:', captchaImg.src);
        
        // 查找输入框
        const captchaInput = findCaptchaInput(captchaImg, isPopupCheck);
        
        // 如果没找到输入框，直接返回
        if (!captchaInput) return;
        
        if (config.debug) console.log('[验证码] 找到验证码输入框:', captchaInput);
        
        // 保存当前验证码和输入框引用
        currentCaptchaImg = captchaImg;
        currentCaptchaInput = captchaInput;
        
        // 标记为已处理
        processedCaptchas.add(imageKey);
        
        // 即使输入框已有值，也继续处理，会在填写前清空
        if (captchaInput.value && captchaInput.value.trim() !== '') {
            if (config.debug) console.log('[验证码] 输入框已有值，将清空并重新识别');
        }
        
        // 获取验证码图片数据
        getImageBase64(captchaImg)
            .then(base64 => {
                if (!base64) {
                    console.error('[验证码] 获取图片数据失败');
                    return;
                }
                
                // 发送到OCR服务器识别
                recognizeCaptcha(base64, captchaInput);
            })
            .catch(err => {
                console.error('[验证码] 处理图片时出错:', err);
            });
    }
    
    // 查找验证码图片
    function findCaptchaImage(inPopup = false) {
        // 如果已经有当前的验证码图片，优先使用
        if (currentCaptchaImg && isVisible(currentCaptchaImg) && 
            currentCaptchaImg.complete && currentCaptchaImg.naturalWidth > 0) {
            return currentCaptchaImg;
        }
        
        // 扩展的验证码图片选择器
        const imgSelectors = [
            'img[src*="captcha"]',
            'img[src*="verify"]',
            'img[src*="vcode"]',
            'img[src*="yzm"]',
            'img[alt*="验证码"]',
            'img[src*="code"]',
            'img[onclick*="refresh"]',
            'img[title*="验证码"]',
            'img[src*="rand"]',
            'img[src*="check"]',
            'img[id*="captcha"]',
            'img[class*="captcha"]',
            'img[id*="vcode"]',
            'img[class*="vcode"]',
            'img[src*="authcode"]',
            'img[src*="seccode"]',
            'img[src*="validate"]',
            'img[src*="yanzheng"]',
            'img[id*="validate"]',
            'img[class*="validate"]',
            'img[data-role*="captcha"]',
            'img[data-type*="captcha"]',
            'img[aria-label*="验证码"]',
            'canvas[id*="captcha"]',
            'canvas[class*="captcha"]',
            'canvas[id*="vcode"]',
            'canvas[class*="vcode"]'
        ];
        
        let searchRoot = document;
        let captchaImg = null;
        
        // 在弹窗中查找
        if (inPopup) {
            // 查找可能的弹窗元素
            const popups = findPopups();
            
            for (const popup of popups) {
                // 在弹窗中深度查找验证码图片
                captchaImg = deepSearchCaptchaImage(popup, imgSelectors);
                if (captchaImg) return captchaImg;
            }
        } else {
            // 在整个文档中深度查找验证码图片
            captchaImg = deepSearchCaptchaImage(document, imgSelectors);
            if (captchaImg) return captchaImg;
        }
        
        return null;
    }
    
    // 深度搜索验证码图片
    function deepSearchCaptchaImage(root, selectors) {
        // 1. 首先使用选择器尝试查找
        for (const selector of selectors) {
            try {
                const elements = root.querySelectorAll(selector);
                for (const img of elements) {
                    if (isVisible(img) && img.complete && img.naturalWidth > 0) {
                        return img;
                    }
                }
            } catch (e) {
                // 忽略选择器错误
            }
        }
        
        // 2. 搜索所有图片，检查是否符合验证码特征
        try {
            const allImages = root.querySelectorAll('img, canvas');
            for (const img of allImages) {
                if (isCaptchaImage(img) && isVisible(img)) {
                    return img;
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        // 3. 递归查找所有可能包含验证码的容器
        try {
            // 查找可能包含验证码的容器
            const captchaContainers = [
                ...root.querySelectorAll('[class*="captcha"]'),
                ...root.querySelectorAll('[id*="captcha"]'),
                ...root.querySelectorAll('[class*="verify"]'),
                ...root.querySelectorAll('[id*="verify"]'),
                ...root.querySelectorAll('[class*="vcode"]'),
                ...root.querySelectorAll('[id*="vcode"]'),
                ...root.querySelectorAll('[class*="valid"]'),
                ...root.querySelectorAll('[id*="valid"]'),
                ...root.querySelectorAll('[class*="auth"]'),
                ...root.querySelectorAll('[id*="auth"]'),
                ...root.querySelectorAll('.login-form'),
                ...root.querySelectorAll('form')
            ];
            
            // 遍历每个容器，搜索图片
            for (const container of captchaContainers) {
                // 搜索容器内的所有图片
                const containerImages = container.querySelectorAll('img, canvas');
                for (const img of containerImages) {
                    if (isCaptchaImage(img) && isVisible(img)) {
                        return img;
                    }
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        // 4. 深度遍历DOM树 (限制深度，避免过度搜索)
        if (config.searchDepth > 3) {
            try {
                // 获取所有层级较深的容器
                const deepContainers = root.querySelectorAll('div > div > div, div > div > div > div');
                for (const container of deepContainers) {
                    const containerImages = container.querySelectorAll('img, canvas');
                    for (const img of containerImages) {
                        if (isCaptchaImage(img) && isVisible(img)) {
                            return img;
                        }
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 5. 额外深度搜索 (仅当搜索深度设置较高时)
        if (config.searchDepth > 4) {
            try {
                // 获取所有可能的frame和iframe
                const frames = root.querySelectorAll('iframe, frame');
                for (const frame of frames) {
                    try {
                        // 尝试访问frame内容 (可能受同源策略限制)
                        const frameDoc = frame.contentDocument || frame.contentWindow?.document;
                        if (frameDoc) {
                            // 在frame中搜索图片
                            const frameImg = deepSearchCaptchaImage(frameDoc, selectors);
                            if (frameImg) return frameImg;
                        }
                    } catch (e) {
                        // 忽略跨域错误
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        return null;
    }
    
    // 查找页面上的弹窗元素
    function findPopups() {
        const popups = [];
        
        // 查找可能的弹窗元素
        const popupSelectors = [
            '.modal', 
            '.dialog', 
            '.popup', 
            '.layer',
            '.overlay',
            '.mask',
            '[role="dialog"]',
            '[role="alertdialog"]',
            '.ant-modal',
            '.el-dialog',
            '.layui-layer',
            '.mui-popup',
            '.weui-dialog'
        ];
        
        for (const selector of popupSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (isVisible(element)) {
                    popups.push(element);
                }
            }
        }
        
        // 如果没有找到特定选择器的弹窗，尝试基于样式特征查找
        if (popups.length === 0) {
            const allElements = document.querySelectorAll('div, section, aside');
            for (const element of allElements) {
                if (isPossiblePopup(element) && isVisible(element)) {
                    popups.push(element);
                }
            }
        }
        
        return popups;
    }
    
    // 查找验证码输入框
    function findCaptchaInput(captchaImg, inPopup = false) {
        // 如果已经有当前的输入框，优先使用
        if (currentCaptchaInput && isVisible(currentCaptchaInput)) {
            return currentCaptchaInput;
        }
        
        // 扩展输入框选择器
        const inputSelectors = [
            'input[name*="captcha"]',
            'input[id*="captcha"]',
            'input[placeholder*="验证码"]',
            'input[name*="vcode"]',
            'input[id*="vcode"]',
            'input[maxlength="4"]',
            'input[maxlength="5"]',
            'input[maxlength="6"]',
            'input[name*="verify"]',
            'input[id*="verify"]',
            'input[placeholder*="验证"]',
            'input[placeholder*="图片"]',
            'input[name*="randcode"]',
            'input[id*="randcode"]',
            'input[name*="authcode"]',
            'input[id*="authcode"]',
            'input[name*="checkcode"]',
            'input[id*="checkcode"]',
            'input[aria-label*="验证码"]',
            'input[placeholder*="code"]',
            'input[name*="validate"]',
            'input[id*="validate"]',
            'input[name*="yanzheng"]',
            'input[id*="yanzheng"]',
            'input[autocomplete="off"][class*="input"]',
            'input.ant-input[autocomplete="off"]',
            'input.el-input__inner[autocomplete="off"]'
        ];
        
        let captchaInput = null;
        let searchRoot = document;
        
        // 如果在弹窗中查找，需要确定搜索范围
        if (inPopup) {
            // 尝试找到包含验证码图片的弹窗
            const popup = captchaImg.closest('.modal, .dialog, .popup, .layer, .overlay, .mask, [role="dialog"], [role="alertdialog"]');
            if (popup) {
                searchRoot = popup;
            }
        }
        
        // 1. 首先检查验证码图片附近的DOM结构
        // 向上查找多个层级的父元素
        let currentNode = captchaImg;
        const ancestors = [];
        
        // 收集验证码图片的所有祖先元素（最多5层）
        for (let i = 0; i < 5; i++) {
            const parent = currentNode.parentElement;
            if (!parent) break;
            ancestors.push(parent);
            currentNode = parent;
        }
        
        // 深度搜索验证码容器
        // 这个方法会处理多种常见的验证码布局
        for (const ancestor of ancestors) {
            // 1. 检查直接的兄弟节点
            let sibling = ancestor.firstElementChild;
            while (sibling) {
                // 检查这个兄弟节点中的输入框
                const inputs = sibling.querySelectorAll('input');
                for (const input of inputs) {
                    if (isVisible(input) && isPossibleCaptchaInput(input)) {
                        return input;
                    }
                }
                sibling = sibling.nextElementSibling;
            }
            
            // 2. 检查父容器中的所有输入框
            for (const selector of inputSelectors) {
                try {
                    const inputs = ancestor.querySelectorAll(selector);
                    for (const input of inputs) {
                        if (isVisible(input)) {
                            return input;
                        }
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 3. 在父容器中查找可能的输入框
            const allInputs = ancestor.querySelectorAll('input[type="text"], input:not([type])');
            for (const input of allInputs) {
                if (isVisible(input) && isPossibleCaptchaInput(input)) {
                    return input;
                }
            }
        }
        
        // 4. 在搜索范围内查找输入框
        for (const selector of inputSelectors) {
            try {
                const inputs = searchRoot.querySelectorAll(selector);
                for (const input of inputs) {
                    if (isVisible(input)) {
                        return input;
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 5. 如果仍然没找到，尝试找最近的输入框
        return findNearestInput(captchaImg, searchRoot);
    }
    
    // 检查输入框是否可能是验证码输入框
    function isPossibleCaptchaInput(input) {
        if (!input || input.type === 'password' || input.type === 'hidden') return false;
        
        // 检查属性
        const attributes = {
            name: (input.name || '').toLowerCase(),
            id: (input.id || '').toLowerCase(),
            placeholder: (input.placeholder || '').toLowerCase(),
            className: (input.className || '').toLowerCase(),
            autocomplete: (input.autocomplete || '').toLowerCase()
        };
        
        // 验证码输入框的常见特征
        const captchaKeywords = ['captcha', 'vcode', 'verify', 'yzm', 'yanzheng', 'code', 'validate', '验证', '验证码'];
        
        // 检查各种属性是否包含验证码关键词
        for (const keyword of captchaKeywords) {
            if (attributes.name.includes(keyword) || 
                attributes.id.includes(keyword) || 
                attributes.placeholder.includes(keyword) || 
                attributes.className.includes(keyword)) {
                return true;
            }
        }
        
        // 检查输入框的其他特征
        // 验证码输入框通常较短且有最大长度限制
        if (input.maxLength > 0 && input.maxLength <= 8) return true;
        
        // 验证码输入框通常设置autocomplete="off"
        if (attributes.autocomplete === 'off' && (input.size <= 10 || input.style.width && parseInt(input.style.width) < 150)) {
            return true;
        }
        
        // 检查输入框尺寸 - 验证码输入框通常较小
        if (input.offsetWidth > 0 && input.offsetWidth < 150) {
            return true;
        }
        
        return false;
    }
    
    // 查找距离验证码图片最近的输入框
    function findNearestInput(captchaImg, searchRoot = document) {
        const inputs = searchRoot.querySelectorAll('input[type="text"], input:not([type])');
        if (!inputs.length) return null;
        
        const imgRect = captchaImg.getBoundingClientRect();
        const imgX = imgRect.left + imgRect.width / 2;
        const imgY = imgRect.top + imgRect.height / 2;
        
        let nearestInput = null;
        let minDistance = Infinity;
        
        for (const input of inputs) {
            if (!isVisible(input) || input.type === 'password' || input.type === 'hidden') continue;
            
            const inputRect = input.getBoundingClientRect();
            const inputX = inputRect.left + inputRect.width / 2;
            const inputY = inputRect.top + inputRect.height / 2;
            
            const distance = Math.sqrt(
                Math.pow(imgX - inputX, 2) + 
                Math.pow(imgY - inputY, 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestInput = input;
            }
        }
        
        // 只返回距离较近且可能是验证码输入框的输入框
        return (minDistance < config.maxSearchDistance && isPossibleCaptchaInput(nearestInput)) ? nearestInput : null;
    }
    
    // 检查元素是否可见
    function isVisible(element) {
        return element && element.offsetWidth > 0 && element.offsetHeight > 0;
    }
    
    // 获取图片的base64数据
    async function getImageBase64(img) {
        try {
            // 创建canvas
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            
            // 在canvas上绘制图片
            const ctx = canvas.getContext('2d');
            
            try {
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL('image/png').split(',')[1];
            } catch (e) {
                console.error('[验证码] 绘制图片到Canvas失败，可能是跨域问题');
                
                // 尝试直接获取src
                if (img.src && img.src.startsWith('data:image')) {
                    return img.src.split(',')[1];
                }
                
                // 通过GM_xmlhttpRequest获取跨域图片
                return await fetchImage(img.src);
            }
        } catch (e) {
            console.error('[验证码] 获取图片base64失败:', e);
            return null;
        }
    }
    
    // 通过GM_xmlhttpRequest获取图片
    function fetchImage(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: function(response) {
                    try {
                        const binary = new Uint8Array(response.response);
                        const base64 = btoa(
                            Array.from(binary).map(byte => String.fromCharCode(byte)).join('')
                        );
                        resolve(base64);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }
    
    // 识别验证码
    function recognizeCaptcha(imageBase64, inputElement) {
        if (config.debug) console.log('[验证码] 发送到OCR服务器识别...');
        
        GM_xmlhttpRequest({
            method: 'POST',
            url: OCR_SERVER,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ image: imageBase64 }),
            timeout: 10000, // 10秒超时
            onload: function(response) {
                try {
                    if (config.debug) console.log('[验证码] 收到服务器响应:', response.responseText);
                    
                    const result = JSON.parse(response.responseText);
                    
                    if (result.code === 0 && result.data) {
                        const captchaText = result.data.trim();
                        
                        if (captchaText) {
                            if (config.debug) console.log('[验证码] 识别成功:', captchaText);
                            
                            // 填写验证码
                            inputElement.value = captchaText;
                            
                            // 触发input事件
                            const event = new Event('input', { bubbles: true });
                            inputElement.dispatchEvent(event);
                            
                            // 触发change事件
                            const changeEvent = new Event('change', { bubbles: true });
                            inputElement.dispatchEvent(changeEvent);
                            
                            if (config.debug) console.log('%c[验证码] 已自动填写: ' + captchaText, 'color: green; font-weight: bold;');
                            
                            // 尝试查找并点击提交按钮
                            tryFindAndClickSubmitButton(inputElement);
                        } else {
                            if (config.debug) console.log('[验证码] 识别结果为空');
                        }
                    } else {
                        if (config.debug) console.log('[验证码] 识别失败:', result.message || '未知错误');
                    }
                } catch (e) {
                    if (config.debug) console.log('[验证码] 解析OCR结果时出错:', e);
                }
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            },
            onerror: function(error) {
                if (config.debug) console.log('[验证码] OCR请求失败:', error);
                console.log('[验证码] 请检查服务器地址是否正确，以及服务器是否已启动');
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            },
            ontimeout: function() {
                if (config.debug) console.log('[验证码] OCR请求超时');
                console.log('[验证码] 请检查服务器是否已启动，网络连接是否正常');
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            }
        });
    }
    
    // 尝试查找并点击提交按钮
    function tryFindAndClickSubmitButton(inputElement) {
        // 查找可能的提交按钮（但不自动点击，只是提示）
        const form = inputElement.closest('form');
        if (form) {
            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitButton) {
                if (config.debug) console.log('[验证码] 找到验证码提交按钮，但不自动点击');
            }
        }
        
        // 查找表单外的可能提交按钮
        const parentContainer = inputElement.closest('.form, .login-form, .captcha-container, .form-container');
        if (parentContainer) {
            const submitButton = parentContainer.querySelector('button, input[type="submit"], input[type="button"], a.btn, a.button');
            if (submitButton && isLoginButton(submitButton)) {
                if (config.debug) console.log('[验证码] 找到验证码提交按钮，但不自动点击');
            }
        }
    }
    
    // 主函数：检查滑块验证码
    function checkForSliderCaptcha(isForceCheck = false) {
        if (config.debug) console.log('[验证码] ' + (isForceCheck ? '强制' : '常规') + '检查滑块验证码...');
        
        // 查找滑块验证码
        const result = findSliderCaptcha();
        
        if (!result) {
            if (config.debug) console.log('[验证码] 未找到滑块验证码元素');
            return;
        }
        
        const { slider, track, container } = result;
        
        if (config.debug) console.log('[验证码] 找到滑块验证码:');
        
        // 检查是否已处理过该滑块
        const sliderKey = slider.outerHTML;
        if (processedCaptchas.has(sliderKey) && !isForceCheck) {
            if (config.debug) console.log('[验证码] 该滑块已被处理过，跳过');
            return;
        }
        
        // 记录该滑块已处理
        processedCaptchas.add(sliderKey);
        
        // 计算滑动距离
        calculateSlideDistance(slider, track, container).then(distance => {
            if (distance) {
                if (config.debug) console.log('[验证码] 计算的滑动距离:', distance, 'px');
                
                // 模拟滑动
                simulateSliderDrag(slider, distance);
            }
        });
    }
    
    // 检查元素是否可能是滑块验证码
    function isPossibleSlider(element) {
        if (!element || !element.tagName) return false;
        
        // 滑块验证码常见特征
        const sliderKeywords = ['slider', 'drag', 'slide', 'captcha', 'verify', 'puzzle', '滑块', '拖动', '滑动', '验证'];
        
        // 检查类名、ID和属性
        const className = (element.className || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const role = (element.getAttribute('role') || '').toLowerCase();
        
        for (const keyword of sliderKeywords) {
            if (className.includes(keyword) || id.includes(keyword) || role.includes(keyword)) {
                if (config.debug) console.log('[验证码] 通过关键词检测到滑块:', keyword, element);
                return true;
            }
        }
        
        // 检查内部元素
        if (element.querySelector('.slider, .drag, .slide, .sliderBtn, .handler, [class*="slider"], [class*="drag"]')) {
            if (config.debug) console.log('[验证码] 通过子元素检测到滑块:', element);
            return true;
        }
        
        return false;
    }
    
    // 查找滑块验证码元素
    function findSliderCaptcha() {
        if (config.debug) console.log('[验证码] 开始查找滑块验证码元素...');
        
        // 常见滑块验证码选择器
        const sliderSelectors = [
            // 滑块按钮
            '.slider-btn', '.sliderBtn', '.slider_button', '.yidun_slider', '.slider', '.handler', '.drag', 
            '.sliderContainer .sliderIcon', '.verify-slider-btn', '.verify-move-block',
            '[class*="slider-btn"]', '[class*="sliderBtn"]', '[class*="handler"]', '[class*="drag-btn"]',
            
            // 通用选择器
            '[class*="slider"][class*="btn"]', '[class*="slide"][class*="btn"]', '[class*="drag"][class*="btn"]'
        ];
        
        // 滑块轨道
        const trackSelectors = [
            '.slider-track', '.sliderTrack', '.track', '.yidun_track', '.slide-track', '.slider-runway',
            '.verify-bar-area', '.verify-slider', '.sliderContainer',
            '[class*="slider-track"]', '[class*="sliderTrack"]', '[class*="track"]', '[class*="runway"]'
        ];
        
        // 容器
        const containerSelectors = [
            '.slider-container', '.sliderContainer', '.yidun_panel', '.captcha-container', '.slider-wrapper',
            '.verify-wrap', '.verify-box', '.verify-container', '.captcha-widget',
            '[class*="slider-container"]', '[class*="sliderContainer"]', '[class*="captcha"]',
            '[class*="slider"][class*="wrapper"]', '[class*="slide"][class*="container"]'
        ];
        
        // 首先查找容器
        let container = null;
        for (const selector of containerSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (isVisible(element)) {
                    container = element;
                    if (config.debug) console.log('[验证码] 找到滑块容器:', selector, element);
                    break;
                }
            }
            if (container) break;
        }
        
        // 如果没找到容器，尝试查找更广泛的元素
        if (!container) {
            const possibleContainers = document.querySelectorAll('[class*="slider"], [class*="captcha"], [class*="verify"]');
            for (const element of possibleContainers) {
                if (isVisible(element) && isPossibleSlider(element)) {
                    container = element;
                    if (config.debug) console.log('[验证码] 找到可能的滑块容器:', element);
                    break;
                }
            }
        }
        
        // 尝试查找iframe中的滑块验证码
        if (!container) {
            try {
                const frames = document.querySelectorAll('iframe');
                for (const frame of frames) {
                    try {
                        const frameDoc = frame.contentDocument || frame.contentWindow?.document;
                        if (!frameDoc) continue;
                        
                        // 在iframe中查找容器
                        for (const selector of containerSelectors) {
                            const elements = frameDoc.querySelectorAll(selector);
                            for (const element of elements) {
                                if (isVisible(element)) {
                                    container = element;
                                    if (config.debug) console.log('[验证码] 在iframe中找到滑块容器:', selector, element);
                                    break;
                                }
                            }
                            if (container) break;
                        }
                    } catch (e) {
                        // 可能有跨域问题，忽略错误
                    }
                    if (container) break;
                }
            } catch (e) {
                console.error('[验证码] 检查iframe时出错:', e);
            }
        }
        
        // 如果没找到容器，直接返回null
        if (!container) {
            if (config.debug) console.log('[验证码] 未找到滑块容器');
            return null;
        }
        
        // 在容器中查找滑块按钮
        let slider = null;
        for (const selector of sliderSelectors) {
            try {
                const element = container.querySelector(selector);
                if (element && isVisible(element)) {
                    slider = element;
                    if (config.debug) console.log('[验证码] 找到滑块按钮:', selector, element);
                    break;
                }
            } catch (e) {
                // 忽略选择器错误
            }
        }
        
        // 如果没找到具体选择器匹配的滑块，尝试找符合特征的元素
        if (!slider) {
            // 查找可能的滑块元素
            const possibleSliders = container.querySelectorAll('div, span, i, button');
            for (const element of possibleSliders) {
                if (!isVisible(element)) continue;
                
                const styles = window.getComputedStyle(element);
                // 滑块通常是绝对定位或相对定位的小元素
                if ((styles.position === 'absolute' || styles.position === 'relative') && 
                    element.offsetWidth < 50 && element.offsetHeight < 50) {
                    
                    // 检查是否有常见的滑块类名特征
                    const className = (element.className || '').toLowerCase();
                    if (className.includes('btn') || className.includes('button') || 
                        className.includes('slider') || className.includes('handler') || 
                        className.includes('drag')) {
                        slider = element;
                        if (config.debug) console.log('[验证码] 找到可能的滑块按钮:', element);
                        break;
                    }
                }
            }
        }
        
        // 如果仍然没找到滑块，再尝试一些常见的样式特征
        if (!slider) {
            // 查找具有手型光标的元素
            const cursorElements = Array.from(container.querySelectorAll('*')).filter(el => {
                if (!isVisible(el)) return false;
                const style = window.getComputedStyle(el);
                return style.cursor === 'pointer' || style.cursor === 'grab' || style.cursor === 'move';
            });
            
            for (const el of cursorElements) {
                // 滑块通常较小
                if (el.offsetWidth < 60 && el.offsetHeight < 60) {
                    slider = el;
                    if (config.debug) console.log('[验证码] 通过光标样式找到可能的滑块:', el);
                    break;
                }
            }
        }
        
        // 如果仍然没找到滑块，尝试点击交互元素
        if (!slider && config.debug) {
            console.log('[验证码] 未能找到滑块按钮，尝试查找其他交互元素');
            
            // 查找可能的交互元素
            const interactiveElements = container.querySelectorAll('div[role="button"], div.slider, div.handler, div.btn');
            for (const el of interactiveElements) {
                if (isVisible(el)) {
                    if (config.debug) console.log('[验证码] 找到可能的交互元素:', el);
                    slider = el;
                    break;
                }
            }
        }
        
        // 如果没找到滑块，返回null
        if (!slider) {
            if (config.debug) console.log('[验证码] 未找到滑块按钮');
            return null;
        }
        
        // 在容器中查找滑动轨道
        let track = null;
        for (const selector of trackSelectors) {
            try {
                const element = container.querySelector(selector);
                if (element && isVisible(element)) {
                    track = element;
                    if (config.debug) console.log('[验证码] 找到滑块轨道:', selector, element);
                    break;
                }
            } catch (e) {
                // 忽略选择器错误
            }
        }
        
        // 如果没找到轨道，尝试推断
        if (!track) {
            // 滑块的父元素通常是轨道
            const parent = slider.parentElement;
            if (parent && parent !== container) {
                track = parent;
                if (config.debug) console.log('[验证码] 使用滑块父元素作为轨道:', parent);
            } else {
                // 否则查找可能的轨道元素
                const possibleTracks = container.querySelectorAll('div');
                for (const element of possibleTracks) {
                    if (!isVisible(element) || element === slider) continue;
                    
                    const styles = window.getComputedStyle(element);
                    // 轨道通常是一个较宽的水平条
                    if (element.offsetWidth > 100 && element.offsetHeight < 50 && 
                        (styles.position === 'relative' || styles.position === 'absolute')) {
                        track = element;
                        if (config.debug) console.log('[验证码] 找到可能的滑块轨道:', element);
                        break;
                    }
                }
            }
        }
        
        // 如果仍然找不到轨道，使用容器作为轨道的后备方案
        if (!track) {
            track = container;
            if (config.debug) console.log('[验证码] 未找到明确的轨道，使用容器作为轨道');
        }
        
        return { slider, track, container };
    }
    
    // 计算滑动距离
    async function calculateSlideDistance(slider, track, container) {
        try {
            // 如果启用了服务器API，先尝试使用服务器分析
            if (config.useSlideAPI) {
                const apiDistance = await analyzeSlideImagesWithAPI(slider, track, container);
                if (apiDistance) {
                    if (config.debug) console.log('[验证码] 使用API计算的滑动距离:', apiDistance);
                    return apiDistance;
                }
            }
            
            // 本地计算逻辑（备用）
            // 获取轨道宽度和滑块宽度
            const trackRect = track.getBoundingClientRect();
            const sliderRect = slider.getBoundingClientRect();
            
            // 最大可滑动距离
            const maxDistance = trackRect.width - sliderRect.width;
            
            // 检查是否有缺口图片
            const bgImage = findBackgroundImage(container);
            const puzzleImage = findPuzzleImage(container);
            
            if (bgImage && puzzleImage) {
                // 如果有拼图元素，尝试分析图片计算缺口位置
                // 这里简化处理，实际上需要复杂的图像处理
                // 在复杂场景中，可能需要发送到服务器进行处理
                
                // 随机一个合理的距离，在80%-95%范围内
                // 这是简化处理，实际应该进行图像分析
                const distance = Math.floor(maxDistance * (0.8 + Math.random() * 0.15));
                return distance;
            } else {
                // 没有找到明确的缺口图片，使用随机策略
                // 大多数滑块验证码的有效区域在50%-80%之间
                const distance = Math.floor(maxDistance * (0.5 + Math.random() * 0.3));
                return distance;
            }
        } catch (e) {
            console.error('[验证码] 计算滑动距离时出错:', e);
            return null;
        }
    }
    
    // 使用服务器API分析滑块图片
    async function analyzeSlideImagesWithAPI(slider, track, container) {
        if (config.debug) console.log('[验证码] 尝试使用API分析滑块图片...');
        
        try {
            // 找到背景图
            const bgImage = findBackgroundImage(container);
            // 找到滑块图
            const puzzleImage = findPuzzleImage(container);
            
            let bgBase64 = null;
            let puzzleBase64 = null;
            let fullBase64 = null;
            
            // 获取背景图和滑块图的base64
            if (bgImage) {
                bgBase64 = await getImageBase64(bgImage);
                if (config.debug) console.log('[验证码] 成功获取背景图');
            }
            
            if (puzzleImage) {
                puzzleBase64 = await getImageBase64(puzzleImage);
                if (config.debug) console.log('[验证码] 成功获取滑块图');
            }
            
            // 如果无法获取单独的图片，尝试获取整个容器截图
            if ((!bgBase64 || !puzzleBase64) && container) {
                try {
                    // 创建canvas
                    const canvas = document.createElement('canvas');
                    const rect = container.getBoundingClientRect();
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                    
                    const ctx = canvas.getContext('2d');
                    
                    // 使用html2canvas库如果可用
                    if (typeof html2canvas !== 'undefined') {
                        const canvas = await html2canvas(container, {
                            logging: false,
                            useCORS: true,
                            allowTaint: true
                        });
                        fullBase64 = canvas.toDataURL('image/png').split(',')[1];
                        if (config.debug) console.log('[验证码] 使用html2canvas获取了容器截图');
                    } else {
                        // 尝试获取容器背景
                        const computedStyle = window.getComputedStyle(container);
                        if (computedStyle.backgroundImage && computedStyle.backgroundImage !== 'none') {
                            const bgUrl = computedStyle.backgroundImage.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
                            if (bgUrl) {
                                try {
                                    const img = new Image();
                                    img.crossOrigin = 'Anonymous';
                                    await new Promise((resolve, reject) => {
                                        img.onload = resolve;
                                        img.onerror = reject;
                                        img.src = bgUrl;
                                    });
                                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    fullBase64 = canvas.toDataURL('image/png').split(',')[1];
                                    if (config.debug) console.log('[验证码] 获取了容器背景图');
                                } catch (e) {
                                    console.error('[验证码] 获取容器背景图失败:', e);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[验证码] 获取容器截图失败:', e);
                }
            }
            
            // 发送到服务器分析
            if ((bgBase64 && puzzleBase64) || fullBase64) {
                if (config.debug) console.log('[验证码] 发送图片到服务器分析');
                
                return new Promise((resolve, reject) => {
                    const data = {};
                    
                    if (bgBase64 && puzzleBase64) {
                        data.bg_image = bgBase64;
                        data.slide_image = puzzleBase64;
                    } else if (fullBase64) {
                        data.full_image = fullBase64;
                    }
                    
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: SLIDE_SERVER,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(data),
                        onload: function(response) {
                            try {
                                const result = JSON.parse(response.responseText);
                                
                                if (result.code === 0 && result.data) {
                                    if (config.debug) console.log('[验证码] 服务器返回的滑动距离:', result.data.x);
                                    resolve(result.data.x);
                                } else {
                                    console.error('[验证码] 服务器分析失败:', result.message || '未知错误');
                                    resolve(null);
                                }
                            } catch (e) {
                                console.error('[验证码] 解析服务器响应时出错:', e);
                                resolve(null);
                            }
                        },
                        onerror: function(error) {
                            console.error('[验证码] 滑块分析请求失败:', error);
                            resolve(null);
                        }
                    });
                });
            } else {
                if (config.debug) console.log('[验证码] 无法获取有效的图片数据');
                return null;
            }
        } catch (e) {
            console.error('[验证码] API分析滑块图片时出错:', e);
            return null;
        }
    }
    
    // 查找背景图片
    function findBackgroundImage(container) {
        // 查找可能的背景图元素
        const bgSelectors = [
            '.slider-bg', '.bg-img', '.captcha-bg', '.yidun_bg-img', 
            '[class*="bg"]', '[class*="background"]'
        ];
        
        for (const selector of bgSelectors) {
            const element = container.querySelector(selector);
            if (element && isVisible(element)) {
                return element;
            }
        }
        
        // 检查容器内的所有图片
        const images = container.querySelectorAll('img');
        for (const img of images) {
            if (isVisible(img) && img.offsetWidth > 100) {
                return img;
            }
        }
        
        return null;
    }
    
    // 查找拼图块
    function findPuzzleImage(container) {
        // 查找可能的拼图元素
        const puzzleSelectors = [
            '.slider-puzzle', '.puzzle', '.jigsaw', '.yidun_jigsaw', 
            '[class*="puzzle"]', '[class*="jigsaw"]'
        ];
        
        for (const selector of puzzleSelectors) {
            const element = container.querySelector(selector);
            if (element && isVisible(element)) {
                return element;
            }
        }
        
        // 检查容器内的小图片或拼图形状元素
        const elements = container.querySelectorAll('img, canvas, svg, div');
        for (const element of elements) {
            if (!isVisible(element)) continue;
            
            // 拼图块通常较小且有绝对定位
            const styles = window.getComputedStyle(element);
            if (styles.position === 'absolute' && 
                element.offsetWidth > 10 && element.offsetWidth < 80 && 
                element.offsetHeight > 10 && element.offsetHeight < 80) {
                
                // 检查是否可能是拼图块
                const className = (element.className || '').toLowerCase();
                if (className.includes('puzzle') || className.includes('jigsaw') || 
                    className.includes('block') || className.includes('piece')) {
                    return element;
                }
            }
        }
        
        return null;
    }
    
    // 模拟滑块拖动
    function simulateSliderDrag(slider, distance) {
        if (config.debug) console.log('[验证码] 开始模拟滑块拖动，目标距离:', distance);
        
        try {
            // 获取滑块位置
            const rect = slider.getBoundingClientRect();
            const startX = rect.left + rect.width / 2;
            const startY = rect.top + rect.height / 2;
            
            // 创建鼠标事件
            const createMouseEvent = (type, x, y) => {
                const event = new MouseEvent(type, {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    button: 0
                });
                return event;
            };
            
            // 模拟人类拖动的时间和路径
            const totalSteps = Math.max(5, Math.floor(distance / 10));  // 至少5步
            const stepDelay = config.sliderSpeed; // 每步延迟时间
            
            // 开始拖动
            slider.dispatchEvent(createMouseEvent('mousedown', startX, startY));
            if (config.debug) console.log('[验证码] 触发鼠标按下事件');
            
            // 模拟人类拖动轨迹
            let currentDistance = 0;
            let step = 1;
            
            const moveInterval = setInterval(() => {
                if (step <= totalSteps) {
                    // 使用加速然后减速的模式，更像人类拖动
                    let progress;
                    if (step < totalSteps / 3) {
                        // 加速阶段
                        progress = step / totalSteps * 1.5;
                    } else if (step > totalSteps * 2 / 3) {
                        // 减速阶段
                        progress = 0.5 + (step / totalSteps) * 0.5;
                    } else {
                        // 匀速阶段
                        progress = step / totalSteps;
                    }
                    
                    // 添加一些随机性
                    const randomOffset = (Math.random() - 0.5) * 2;
                    currentDistance = Math.floor(distance * progress);
                    
                    // 移动鼠标
                    const newX = startX + currentDistance;
                    const newY = startY + randomOffset;
                    
                    slider.dispatchEvent(createMouseEvent('mousemove', newX, newY));
                    
                    if (config.debug && step % 5 === 0) {
                        console.log(`[验证码] 拖动进度: ${Math.round(progress * 100)}%`);
                    }
                    
                    step++;
                } else {
                    // 结束拖动
                    clearInterval(moveInterval);
                    
                    // 最后一步，确保到达目标位置
                    const finalX = startX + distance;
                    slider.dispatchEvent(createMouseEvent('mousemove', finalX, startY));
                    
                    // 释放鼠标
                    setTimeout(() => {
                        slider.dispatchEvent(createMouseEvent('mouseup', finalX, startY));
                        
                        if (config.debug) console.log('[验证码] 滑块拖动完成');
                        
                        // 尝试触发额外的事件
                        try {
                            // 有些验证码需要触发额外事件
                            slider.dispatchEvent(new Event('dragend', { bubbles: true }));
                            slider.dispatchEvent(new Event('drop', { bubbles: true }));
                        } catch (e) {
                            // 忽略错误
                        }
                    }, stepDelay);
                }
            }, stepDelay);
        } catch (e) {
            console.error('[验证码] 模拟滑块拖动时出错:', e);
        }
    }
    
    // 启动脚本
    init();
})(); 