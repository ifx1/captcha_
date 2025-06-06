// ==UserScript==
// @name         极简验证码识别工具
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  极简版验证码识别工具，支持图形验证码和滑块验证码，带UI配置界面
// @author       laozig
// @license      MIT
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_notification
// @connect      localhost
// @connect      *
// @connect      captcha.tangyun.lat
// @homepage     https://github.com/laozig/captcha_.git
// @updateURL    https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js
// @downloadURL  https://github.com/laozig/captcha_/raw/main/captcha_solver_lite.user.js
// ==/UserScript==

(function() {
    'use strict';
    
    // OCR服务器地址 - 可通过UI配置
    const DEFAULT_OCR_SERVER = 'http://captcha.tangyun.lat:9898/ocr';
    const DEFAULT_SLIDE_SERVER = 'http://captcha.tangyun.lat:9898/slide';
    
    // 从存储中获取服务器地址
    const OCR_SERVER = GM_getValue('ocr_server', DEFAULT_OCR_SERVER);
    const SLIDE_SERVER = GM_getValue('slide_server', DEFAULT_SLIDE_SERVER);
    
    // 配置
    const defaultConfig = {
        autoMode: true,  // 自动识别验证码
        checkInterval: 2000,  // 自动检查间隔(毫秒)，减少频率以降低CPU使用率
        debug: false,  // 默认关闭调试信息，减少控制台输出
        consoleLogLevel: 'error',  // 控制台日志级别: debug, info, warn, error, none
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
        forceSliderCheck: false,  // 关闭强制定期检查滑块验证码，减少资源占用
        useSlideAPI: true,  // 是否使用服务器API进行滑块分析
        throttleInterval: 100,  // 节流间隔(毫秒)
        mutationObserverConfig: {  // MutationObserver配置
            childList: true,  // 监听子节点变化
            attributes: true,  // 监听属性变化
            subtree: true,  // 监听整个子树
            attributeFilter: ['src', 'style', 'class', 'display', 'visibility']  // 只监听这些属性
        },
        debounceDelay: 300,  // 防抖延迟(毫秒)
        cacheSize: 50,  // 缓存大小
        preloadImages: false,  // 是否预加载图片
        persistentCache: true,  // 是否使用持久化缓存
        cacheTTL: 7 * 24 * 60 * 60 * 1000,  // 缓存有效期(毫秒)，默认7天
        autoCleanupInterval: 24 * 60 * 60 * 1000,  // 自动清理间隔(毫秒)，默认1天
        maxPersistentCacheSize: 500,  // 持久化缓存最大条目数
        showNotifications: true,  // 是否显示通知
        showIcon: true,  // 是否显示状态图标
        iconPosition: 'top-right',  // 图标位置: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
        darkMode: false,  // 暗黑模式
        captchaTypes: {  // 支持的验证码类型
            normal: true,  // 普通图形验证码
            slider: true,  // 滑块验证码
            clickCaptcha: true,  // 点选验证码
            rotationCaptcha: false,  // 旋转验证码(实验性)
            jigsaw: true  // 拼图验证码
        },
        autoSubmit: false,  // 自动提交表单(默认关闭)
        enableKeyboardShortcuts: true,  // 启用键盘快捷键
        shortcuts: {  // 键盘快捷键
            toggleEnabled: 'Alt+C',  // 切换启用/禁用状态
            forceScan: 'Alt+S',  // 强制扫描验证码
            openSettings: 'Alt+O',  // 打开设置
            toggleIcon: 'Alt+I'  // 切换图标显示
        },
        customSelectors: "",  // 自定义验证码选择器，逗号分隔
        siteSpecificRules: {},  // 针对特定网站的规则
        statistics: {  // 统计信息
            enabled: true,  // 是否启用统计
            totalCaptchas: 0,  // 总处理验证码数
            successCount: 0,  // 成功识别数
            failCount: 0,  // 失败数
            avgTime: 0,  // 平均识别时间(ms)
            lastReset: Date.now()  // 上次重置时间
        }
    };
    
    // 合并默认配置和保存的配置
    let config = Object.assign({}, defaultConfig, GM_getValue('config', {}));
    
    // 保存配置
    function saveConfig() {
        GM_setValue('config', config);
    }
    
    // 初次使用时保存默认配置
    if (!GM_getValue('config')) {
        saveConfig();
    }
    
    // 存储识别过的验证码和当前处理的验证码
    const processedCaptchas = new Set();
    let currentCaptchaImg = null;
    let currentCaptchaInput = null;
    let popupCheckCount = 0;
    let popupCheckTimer = null;
    let lastCheckTime = 0;  // 上次检查时间戳
    let debounceTimer = null;  // 防抖定时器
    let lastCleanupTime = GM_getValue('lastCleanupTime', 0);  // 上次清理时间
    let isEnabled = GM_getValue('isEnabled', true);  // 是否启用脚本
    let uiInitialized = false;  // UI是否已初始化
    
    // 统计数据
    const stats = Object.assign({}, defaultConfig.statistics, GM_getValue('statistics', {}));
    
    // 保存统计数据
    function saveStats() {
        GM_setValue('statistics', stats);
    }
    
    // 更新统计数据
    function updateStats(success, time) {
        if (!config.statistics.enabled) return;
        
        stats.totalCaptchas++;
        if (success) {
            stats.successCount++;
        } else {
            stats.failCount++;
        }
        
        // 更新平均时间
        const totalTimes = stats.avgTime * (stats.successCount + stats.failCount - 1);
        stats.avgTime = (totalTimes + time) / (stats.successCount + stats.failCount);
        
        saveStats();
    }
    
    // 重置统计
    function resetStats() {
        stats.totalCaptchas = 0;
        stats.successCount = 0;
        stats.failCount = 0;
        stats.avgTime = 0;
        stats.lastReset = Date.now();
        saveStats();
    }
    
    // 日志系统
    const logger = {
        levels: {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
            none: 99
        },
        
        getCurrentLevel() {
            return this.levels[config.consoleLogLevel] || this.levels.error;
        },
        
        debug(...args) {
            if (this.getCurrentLevel() <= this.levels.debug) {
                console.log('[验证码]', ...args);
            }
        },
        
        info(...args) {
            if (this.getCurrentLevel() <= this.levels.info) {
                console.info('[验证码]', ...args);
            }
        },
        
        warn(...args) {
            if (this.getCurrentLevel() <= this.levels.warn) {
                console.warn('[验证码]', ...args);
            }
        },
        
        error(...args) {
            if (this.getCurrentLevel() <= this.levels.error) {
                console.error('[验证码]', ...args);
            }
        },
        
        // 显示通知
        notify(title, message, type = 'info') {
            if (!config.showNotifications) return;
            
            GM_notification({
                title: `验证码识别 - ${title}`,
                text: message,
                timeout: 3000,
                onclick: () => { /* 可选的点击事件 */ }
            });
        }
    };
    
    // 简单的缓存实现
    const captchaCache = {
        data: new Map(),
        maxSize: config.cacheSize,
        
        get(key) {
            // 先尝试从内存缓存获取
            const memValue = this.data.get(key);
            if (memValue) return memValue;
            
            // 如果启用了持久化缓存，尝试从GM存储获取
            if (config.persistentCache) {
                try {
                    const storageKey = 'captcha_' + key;
                    const storedValue = GM_getValue(storageKey);
                    if (storedValue) {
                        // 检查缓存是否过期
                        const now = Date.now();
                        if (storedValue.timestamp && now - storedValue.timestamp < config.cacheTTL) {
                            // 将从持久化存储获取的值放入内存缓存
                            this.data.set(key, storedValue.value);
                            return storedValue.value;
                        } else {
                            // 清理过期缓存
                            GM_deleteValue(storageKey);
                        }
                    }
                } catch (e) {
                    logger.error('从持久化存储读取缓存失败:', e);
                }
            }
            
            return null;
        },
        
        set(key, value) {
            // 内存缓存控制
            if (this.data.size >= this.maxSize) {
                // 删除最早添加的项
                const firstKey = this.data.keys().next().value;
                this.data.delete(firstKey);
            }
            
            // 设置内存缓存
            this.data.set(key, value);
            
            // 如果启用了持久化缓存，同时保存到GM存储
            if (config.persistentCache) {
                try {
                    const storageKey = 'captcha_' + key;
                    GM_setValue(storageKey, {
                        value: value,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    logger.error('保存到持久化存储失败:', e);
                }
            }
        },
        
        // 清理过期和过多的持久化缓存
        cleanup() {
            if (!config.persistentCache) return;
            
            try {
                // 获取所有缓存键
                const cacheKeys = [];
                const keyPrefix = 'captcha_';
                const allValues = GM_listValues ? GM_listValues() : [];
                
                // 筛选出验证码缓存键
                for (const key of allValues) {
                    if (key.startsWith(keyPrefix)) {
                        const value = GM_getValue(key);
                        if (value && value.timestamp) {
                            cacheKeys.push({
                                key: key,
                                timestamp: value.timestamp
                            });
                        }
                    }
                }
                
                // 如果缓存数量超过限制，删除旧的
                if (cacheKeys.length > config.maxPersistentCacheSize) {
                    // 按时间戳排序
                    cacheKeys.sort((a, b) => a.timestamp - b.timestamp);
                    
                    // 删除最旧的一批
                    const deleteCount = cacheKeys.length - config.maxPersistentCacheSize;
                    for (let i = 0; i < deleteCount; i++) {
                        GM_deleteValue(cacheKeys[i].key);
                    }
                    
                    logger.info(`已清理${deleteCount}条过期缓存`);
                }
                
                // 清理过期缓存
                const now = Date.now();
                let expiredCount = 0;
                
                for (const {key, timestamp} of cacheKeys) {
                    if (now - timestamp > config.cacheTTL) {
                        GM_deleteValue(key);
                        expiredCount++;
                    }
                }
                
                if (expiredCount > 0) {
                    logger.info(`已清理${expiredCount}条过期缓存`);
                }
                
                // 更新上次清理时间
                GM_setValue('lastCleanupTime', now);
                lastCleanupTime = now;
                
            } catch (e) {
                logger.error('清理持久化缓存失败:', e);
            }
        }
    };
    
    // 工具函数 - 节流函数，控制函数调用频率
    const throttle = (func, delay) => {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall < delay) return;
            lastCall = now;
            return func.apply(this, args);
        };
    };
    
    // 工具函数 - 防抖函数，延迟执行函数
    const debounce = (func, delay) => {
        return function(...args) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };
    
    // 对字符串进行简单哈希处理，用于缓存键生成
    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash.toString(16);
    }
    
    // 找到与验证码相关联的提交按钮
    function findSubmitButton(captchaElement) {
        // 查找最近的表单
        let form = captchaElement.closest('form');
        if (form) {
            // 在表单中查找提交按钮
            const button = form.querySelector('button[type="submit"], input[type="submit"], button:not([type]), .submit-btn, .login-btn, [class*="submit"], [class*="login"]');
            if (button) return button;
        }
        
        // 如果没有在表单中找到，向上查找到公共容器，然后查找按钮
        let container = captchaElement.parentElement;
        for (let i = 0; i < 5 && container; i++) {
            const button = container.querySelector('button, input[type="submit"], .submit-btn, .login-btn, [class*="submit"], [class*="login"]');
            if (button) return button;
            container = container.parentElement;
        }
        
        return null;
    }
    
    // 初始化
    function init() {
        logger.info('验证码识别工具启动');

        // 首次清理过期缓存
        if (config.persistentCache && Date.now() - lastCleanupTime > config.autoCleanupInterval) {
            captchaCache.cleanup();
        }
        
        // 设置定时器检查验证码
        if (config.autoMode && isEnabled) {
            setInterval(() => {
                const now = Date.now();
                // 控制检查频率，减少CPU使用
                if (now - lastCheckTime < config.checkInterval) return;
                lastCheckTime = now;
                
                checkForCaptcha();
                
                // 如果启用了滑块验证码支持，检查滑块验证码
                if (config.captchaTypes.slider) {
                    checkForSliderCaptcha();
                }
                
                // 如果启用了点选验证码支持，检查点选验证码
                if (config.captchaTypes.clickCaptcha) {
                    checkForClickCaptcha();
                }
            }, Math.max(500, config.checkInterval / 2)); // 确保至少有500ms的间隔
        }
        
        // 监听DOM变化
        if (isEnabled) {
            observeDOMChanges();
        }
        
        // 初始化UI
        if (document.body) {
            initUI();
        } else {
            // 如果body尚未加载，等待DOMContentLoaded事件
            document.addEventListener('DOMContentLoaded', () => {
                initUI();
            });
        }
    }
    
    // 测试服务器连接
    function testServerConnection() {
        logger.info('正在测试服务器连接...');
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: OCR_SERVER.replace('/ocr', '/'),
            timeout: 5000,
            onload: function(response) {
                try {
                    const result = JSON.parse(response.responseText);
                    logger.info('服务器连接成功:', result);
                } catch (e) {
                    logger.error('服务器响应解析错误:', e);
                }
            },
            onerror: function(error) {
                logger.error('服务器连接失败:', error);
                logger.error('请确认服务器地址是否正确，并检查服务器是否已启动');
            },
            ontimeout: function() {
                logger.error('服务器连接超时，请检查服务器是否已启动');
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
        
        // 使用节流函数包装检查函数
        const throttledCheckForCaptcha = throttle(checkForCaptcha, config.throttleInterval);
        const throttledCheckForSliderCaptcha = throttle(checkForSliderCaptcha, config.throttleInterval);
        
        // 开始定期检查，使用较低频率
        setInterval(() => {
            const now = Date.now();
            // 确保至少间隔config.checkInterval毫秒
            if (now - lastCheckTime >= config.checkInterval) {
                lastCheckTime = now;
                throttledCheckForCaptcha();
            }
        }, config.checkInterval);
        
        // 定期检查滑块验证码，使用较低频率
        if (config.sliderEnabled) {
            setInterval(() => {
                const now = Date.now();
                // 频率更低的滑块检查
                if (now - lastCheckTime >= config.checkInterval * 2) {
                if (config.forceSliderCheck) {
                        throttledCheckForSliderCaptcha(true);
                } else {
                        throttledCheckForSliderCaptcha();
                }
                }
            }, config.checkInterval * 3);  // 更低的检查频率
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
        const observer = new MutationObserver(
            // 使用防抖函数，减少频繁调用
            debounce((mutations) => {
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
                                if (config.debug) logger.info('[验证码] 检测到可能的弹窗:', node);
                        }
                        
                        // 检查是否添加了滑块验证码
                        if (node.nodeType === 1 && config.sliderEnabled && isPossibleSlider(node)) {
                            sliderDetected = true;
                                if (config.debug) logger.info('[验证码] 检测到可能的滑块验证码:', node);
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
                                    if (config.debug) logger.info('[验证码] 检测到弹窗显示:', mutation.target);
                            }
                        }
                        
                        // 检查是否是滑块验证码显示
                        if (config.sliderEnabled && isPossibleSlider(mutation.target)) {
                            const styles = window.getComputedStyle(mutation.target);
                            if (styles.display !== 'none' && styles.visibility !== 'hidden') {
                                sliderDetected = true;
                                    if (config.debug) logger.info('[验证码] 检测到滑块验证码显示:', mutation.target);
                            }
                        }
                        
                        // 元素显示状态变化可能意味着验证码出现
                        shouldCheck = true;
                    }
                }
            }
                
                // 避免频繁检查
                const now = Date.now();
                if (now - lastCheckTime < config.throttleInterval) {
                    return;
                }
                lastCheckTime = now;
            
            if (shouldCheck) {
                    // 使用节流函数检查验证码
                    setTimeout(() => checkForCaptcha(), config.delay);
            }
            
            if (popupDetected) {
                    // 开始弹窗检查
                startPopupChecks();
            }
            
            if (sliderDetected && config.sliderEnabled) {
                    // 检查滑块验证码
                    setTimeout(() => checkForSliderCaptcha(), config.sliderDelay);
                }
            }, config.debounceDelay)
        );
        
        // 开始监听
        observer.observe(document.documentElement, config.mutationObserverConfig);
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
                if (config.debug) logger.info('[验证码] 检测到点击登录按钮，稍后将检查验证码');
                
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
                    if (config.debug) logger.info('[验证码] 检测到用户点击了验证码图片，等待新验证码加载...');
                    
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
                    logger.info('[验证码] 检查弹窗中的验证码...');
                } else {
                    logger.info('[验证码] 强制检查验证码...');
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
        
        if (config.debug) logger.info('[验证码] 找到验证码图片:', captchaImg.src);
        
        // 查找输入框
        const captchaInput = findCaptchaInput(captchaImg, isPopupCheck);
        
        // 如果没找到输入框，直接返回
        if (!captchaInput) return;
        
        if (config.debug) logger.info('[验证码] 找到验证码输入框:', captchaInput);
        
        // 保存当前验证码和输入框引用
        currentCaptchaImg = captchaImg;
        currentCaptchaInput = captchaInput;
        
        // 标记为已处理
        processedCaptchas.add(imageKey);
        
        // 即使输入框已有值，也继续处理，会在填写前清空
        if (captchaInput.value && captchaInput.value.trim() !== '') {
            if (config.debug) logger.info('[验证码] 输入框已有值，将清空并重新识别');
        }
        
        // 获取验证码图片数据
        getImageBase64(captchaImg)
            .then(base64 => {
                if (!base64) {
                    logger.error('[验证码] 获取图片数据失败');
                    return;
                }
                
                // 发送到OCR服务器识别
                recognizeCaptcha(base64, captchaInput);
            })
            .catch(err => {
                logger.error('[验证码] 处理图片时出错:', err);
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
            // 检查缓存
            const imgSrc = img.src || '';
            const cacheKey = imgSrc;
            
            // 如果有缓存，直接返回
            const cachedData = captchaCache.get(cacheKey);
            if (cachedData) {
                if (config.debug) logger.info('[验证码] 使用缓存的图片数据');
                return cachedData;
            }
            
            // 创建canvas
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            
            // 在canvas上绘制图片
            const ctx = canvas.getContext('2d');
            
            try {
                ctx.drawImage(img, 0, 0);
                const base64Data = canvas.toDataURL('image/png').split(',')[1];
                
                // 存入缓存
                captchaCache.set(cacheKey, base64Data);
                
                return base64Data;
            } catch (e) {
                logger.error('[验证码] 绘制图片到Canvas失败，可能是跨域问题');
                
                // 尝试直接获取src
                if (img.src && img.src.startsWith('data:image')) {
                    const directData = img.src.split(',')[1];
                    captchaCache.set(cacheKey, directData);
                    return directData;
                }
                
                // 通过GM_xmlhttpRequest获取跨域图片
                const fetchedData = await fetchImage(img.src);
                if (fetchedData) {
                    captchaCache.set(cacheKey, fetchedData);
                }
                return fetchedData;
            }
        } catch (e) {
            logger.error('[验证码] 获取图片base64失败:', e);
            return null;
        }
    }
    
    // 通过GM_xmlhttpRequest获取图片
    function fetchImage(url) {
        if (!url) return Promise.resolve(null);
        
        // 检查缓存
        const cacheKey = url;
        const cachedData = captchaCache.get(cacheKey);
        if (cachedData) {
            if (config.debug) logger.info('[验证码] 使用缓存的远程图片数据');
            return Promise.resolve(cachedData);
        }
        
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
                        
                        // 存入缓存
                        captchaCache.set(cacheKey, base64);
                        
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
        // 检查缓存
        const cacheKey = imageBase64.slice(0, 100); // 使用图片数据的前100个字符作为缓存键
        const cachedResult = captchaCache.get('ocr_' + cacheKey);
        
        if (cachedResult) {
            if (config.debug) logger.info('[验证码] 使用缓存的识别结果:', cachedResult);
            
            // 填写验证码
            inputElement.value = cachedResult;
            
            // 触发事件
            triggerInputEvents(inputElement);
            
            if (config.debug) logger.info('%c[验证码] 已自动填写(缓存): ' + cachedResult, 'color: green; font-weight: bold;');
            
            // 清除当前处理的验证码
            currentCaptchaImg = null;
            currentCaptchaInput = null;
            
            return;
        }
        
        if (config.debug) logger.info('[验证码] 发送到OCR服务器识别...');
        
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
                    if (config.debug) logger.info('[验证码] 收到服务器响应:', response.responseText);
                    
                    const result = JSON.parse(response.responseText);
                    
                    if (result.code === 0 && result.data) {
                        const captchaText = result.data.trim();
                        
                        if (captchaText) {
                            // 存入缓存
                            captchaCache.set('ocr_' + cacheKey, captchaText);
                            
                            if (config.debug) logger.info('[验证码] 识别成功:', captchaText);
                            
                            // 填写验证码
                            inputElement.value = captchaText;
                            
                            // 触发事件
                            triggerInputEvents(inputElement);
                            
                            if (config.debug) logger.info('%c[验证码] 已自动填写: ' + captchaText, 'color: green; font-weight: bold;');
                            
                            // 尝试查找并点击提交按钮
                            tryFindAndClickSubmitButton(inputElement);
                        } else {
                            if (config.debug) logger.info('[验证码] 识别结果为空');
                        }
                    } else {
                        if (config.debug) logger.error('[验证码] 识别失败:', result.message || '未知错误');
                    }
                } catch (e) {
                    if (config.debug) logger.error('[验证码] 解析OCR结果时出错:', e);
                }
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            },
            onerror: function(error) {
                if (config.debug) logger.error('[验证码] OCR请求失败:', error);
                logger.error('[验证码] 请检查服务器地址是否正确，以及服务器是否已启动');
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            },
            ontimeout: function() {
                if (config.debug) logger.error('[验证码] OCR请求超时');
                logger.error('[验证码] 请检查服务器是否已启动，网络连接是否正常');
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            }
        });
    }
    
    // 触发输入框事件
    function triggerInputEvents(inputElement) {
        // 触发input事件
        const event = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(event);
        
        // 触发change事件
        const changeEvent = new Event('change', { bubbles: true });
        inputElement.dispatchEvent(changeEvent);
    }
    
    // 尝试查找并点击提交按钮
    function tryFindAndClickSubmitButton(inputElement) {
        // 查找可能的提交按钮（但不自动点击，只是提示）
        const form = inputElement.closest('form');
        if (form) {
            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitButton) {
                if (config.debug) logger.info('[验证码] 找到验证码提交按钮，但不自动点击');
            }
        }
        
        // 查找表单外的可能提交按钮
        const parentContainer = inputElement.closest('.form, .login-form, .captcha-container, .form-container');
        if (parentContainer) {
            const submitButton = parentContainer.querySelector('button, input[type="submit"], input[type="button"], a.btn, a.button');
            if (submitButton && isLoginButton(submitButton)) {
                if (config.debug) logger.info('[验证码] 找到验证码提交按钮，但不自动点击');
            }
        }
    }
    
    // 主函数：检查滑块验证码
    function checkForSliderCaptcha(isForceCheck = false) {
        if (config.debug) logger.info('[验证码] ' + (isForceCheck ? '强制' : '常规') + '检查滑块验证码...');
        
        // 查找滑块验证码
        const result = findSliderCaptcha();
        
        if (!result) {
            if (config.debug) logger.info('[验证码] 未找到滑块验证码元素');
            return;
        }
        
        const { slider, track, container } = result;
        
        if (config.debug) logger.info('[验证码] 找到滑块验证码:');
        
        // 检查是否已处理过该滑块
        const sliderKey = slider.outerHTML;
        if (processedCaptchas.has(sliderKey) && !isForceCheck) {
            if (config.debug) logger.info('[验证码] 该滑块已被处理过，跳过');
            return;
        }
        
        // 记录该滑块已处理
        processedCaptchas.add(sliderKey);
        
        // 计算滑动距离
        calculateSlideDistance(slider, track, container).then(distance => {
            if (distance) {
                if (config.debug) logger.info('[验证码] 计算的滑动距离:', distance, 'px');
                
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
                if (config.debug) logger.info('[验证码] 通过关键词检测到滑块:', keyword, element);
                return true;
            }
        }
        
        // 检查内部元素
        if (element.querySelector('.slider, .drag, .slide, .sliderBtn, .handler, [class*="slider"], [class*="drag"]')) {
            if (config.debug) logger.info('[验证码] 通过子元素检测到滑块:', element);
            return true;
        }
        
        return false;
    }
    
    // 查找滑块验证码元素
    function findSliderCaptcha() {
        if (config.debug) logger.info('[验证码] 开始查找滑块验证码元素...');
        
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
                    if (config.debug) logger.info('[验证码] 找到滑块容器:', selector, element);
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
                    if (config.debug) logger.info('[验证码] 找到可能的滑块容器:', element);
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
                                    if (config.debug) logger.info('[验证码] 在iframe中找到滑块容器:', selector, element);
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
                logger.error('[验证码] 检查iframe时出错:', e);
            }
        }
        
        // 如果没找到容器，直接返回null
        if (!container) {
            if (config.debug) logger.info('[验证码] 未找到滑块容器');
            return null;
        }
        
        // 在容器中查找滑块按钮
        let slider = null;
        for (const selector of sliderSelectors) {
            try {
                const element = container.querySelector(selector);
                if (element && isVisible(element)) {
                    slider = element;
                    if (config.debug) logger.info('[验证码] 找到滑块按钮:', selector, element);
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
                        if (config.debug) logger.info('[验证码] 找到可能的滑块按钮:', element);
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
                    if (config.debug) logger.info('[验证码] 通过光标样式找到可能的滑块:', el);
                    break;
                }
            }
        }
        
        // 如果仍然没找到滑块，尝试点击交互元素
        if (!slider && config.debug) {
            logger.info('[验证码] 未能找到滑块按钮，尝试查找其他交互元素');
            
            // 查找可能的交互元素
            const interactiveElements = container.querySelectorAll('div[role="button"], div.slider, div.handler, div.btn');
            for (const el of interactiveElements) {
                if (isVisible(el)) {
                    if (config.debug) logger.info('[验证码] 找到可能的交互元素:', el);
                    slider = el;
                    break;
                }
            }
        }
        
        // 如果没找到滑块，返回null
        if (!slider) {
            if (config.debug) logger.info('[验证码] 未找到滑块按钮');
            return null;
        }
        
        // 在容器中查找滑动轨道
        let track = null;
        for (const selector of trackSelectors) {
            try {
                const element = container.querySelector(selector);
                if (element && isVisible(element)) {
                    track = element;
                    if (config.debug) logger.info('[验证码] 找到滑块轨道:', selector, element);
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
                if (config.debug) logger.info('[验证码] 使用滑块父元素作为轨道:', parent);
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
                        if (config.debug) logger.info('[验证码] 找到可能的滑块轨道:', element);
                        break;
                    }
                }
            }
        }
        
        // 如果仍然找不到轨道，使用容器作为轨道的后备方案
        if (!track) {
            track = container;
            if (config.debug) logger.info('[验证码] 未找到明确的轨道，使用容器作为轨道');
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
                    if (config.debug) logger.info('[验证码] 使用API计算的滑动距离:', apiDistance);
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
            logger.error('[验证码] 计算滑动距离时出错:', e);
            return null;
        }
    }
    
    // 使用API分析滑块图片
    async function analyzeSlideImagesWithAPI(slider, track, container) {
        if (config.debug) logger.info('[验证码] 尝试使用API分析滑块图片...');
        
        try {
            // 找到背景图
            const bgImage = findBackgroundImage(container);
            // 找到滑块图
            const puzzleImage = findPuzzleImage(container);
            
            // 生成缓存键
            const generateCacheKey = (img) => {
                if (!img) return '';
                return img.src || (img.style && img.style.backgroundImage) || '';
            };
            
            const bgCacheKey = generateCacheKey(bgImage);
            const puzzleCacheKey = generateCacheKey(puzzleImage);
            const combinedKey = 'slide_' + bgCacheKey + '_' + puzzleCacheKey;
            
            // 检查缓存
            const cachedResult = captchaCache.get(combinedKey);
            if (cachedResult) {
                if (config.debug) logger.info('[验证码] 使用缓存的滑块分析结果:', cachedResult);
                return cachedResult;
            }
            
            let bgBase64 = null;
            let puzzleBase64 = null;
            let fullBase64 = null;
            
            // 获取背景图和滑块图的base64
            if (bgImage) {
                bgBase64 = await getImageBase64(bgImage);
                if (config.debug) logger.info('[验证码] 成功获取背景图');
            }
            
            if (puzzleImage) {
                puzzleBase64 = await getImageBase64(puzzleImage);
                if (config.debug) logger.info('[验证码] 成功获取滑块图');
            }
            
            // 如果无法获取单独的图片，尝试获取整个容器截图
            if ((!bgBase64 || !puzzleBase64) && container) {
                try {
                    // 使用简化的方法获取容器截图
                    fullBase64 = await getContainerScreenshot(container);
                                } catch (e) {
                    logger.error('[验证码] 获取容器截图失败:', e);
                }
            }
            
            // 发送到服务器分析
            if ((bgBase64 && puzzleBase64) || fullBase64) {
                if (config.debug) logger.info('[验证码] 发送图片到服务器分析');
                
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
                                    if (config.debug) logger.info('[验证码] 服务器返回的滑动距离:', result.data.x);
                                    
                                    // 存入缓存
                                    captchaCache.set(combinedKey, result.data.x);
                                    
                                    resolve(result.data.x);
                                } else {
                                    logger.error('[验证码] 服务器分析失败:', result.message || '未知错误');
                                    resolve(null);
                                }
                            } catch (e) {
                                logger.error('[验证码] 解析服务器响应时出错:', e);
                                resolve(null);
                            }
                        },
                        onerror: function(error) {
                            logger.error('[验证码] 滑块分析请求失败:', error);
                            resolve(null);
                        }
                    });
                });
            } else {
                if (config.debug) logger.info('[验证码] 无法获取有效的图片数据');
                return null;
            }
        } catch (e) {
            logger.error('[验证码] API分析滑块图片时出错:', e);
            return null;
        }
    }
    
    // 简化的获取容器截图方法
    async function getContainerScreenshot(container) {
        try {
            // 创建canvas
            const canvas = document.createElement('canvas');
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            
            const ctx = canvas.getContext('2d');
            
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
                        return canvas.toDataURL('image/png').split(',')[1];
                    } catch (e) {
                        logger.error('[验证码] 获取容器背景图失败:', e);
                    }
                }
            }
            
            // 如果无法获取背景，尝试绘制容器内的所有图片
            const images = container.querySelectorAll('img');
            for (const img of images) {
                if (isVisible(img)) {
                    try {
                        const imgRect = img.getBoundingClientRect();
                        const x = imgRect.left - rect.left;
                        const y = imgRect.top - rect.top;
                        ctx.drawImage(img, x, y, img.width, img.height);
                    } catch (e) {
                        // 忽略错误，继续处理其他图片
                    }
                }
            }
            
            return canvas.toDataURL('image/png').split(',')[1];
        } catch (e) {
            logger.error('[验证码] 获取容器截图失败:', e);
            return null;
        }
    }
    
    // 模拟滑块拖动
    function simulateSliderDrag(slider, distance) {
        if (config.debug) logger.info('[验证码] 开始模拟滑块拖动，目标距离:', distance);
        
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
            
            // 模拟人类拖动的时间和路径 - 使用更自然的曲线
            const generateHumanLikeTrack = (distance) => {
                // 使用更少的步骤，降低CPU使用率
                const totalSteps = Math.max(5, Math.min(20, Math.floor(distance / 15)));
                const track = [];
                
                // 生成加速-匀速-减速的轨迹
                for (let i = 0; i < totalSteps; i++) {
                    const progress = i / (totalSteps - 1);
                    let factor;
                    
                    // 使用三段式加速度模型
                    if (progress < 0.2) {
                        // 起步阶段，加速
                        factor = progress * 2;
                    } else if (progress > 0.8) {
                        // 结束阶段，减速
                        factor = 0.8 + (progress - 0.8) * 0.2;
                    } else {
                        // 中间阶段，匀速+微波动
                        factor = 0.4 + progress * 0.5 + (Math.random() - 0.5) * 0.1;
                    }
                    
                    // 添加轻微的垂直方向波动，模拟人手抖动
                    const xPos = Math.round(distance * factor);
                    const yPos = Math.round((Math.random() - 0.5) * 3);
                    
                    track.push({ x: xPos, y: yPos });
                }
                
                // 确保最后一步到达目标位置
                track[track.length - 1].x = distance;
                track[track.length - 1].y = 0;
                
                return track;
            };
            
            // 生成人类轨迹
            const track = generateHumanLikeTrack(distance);
            const trackLength = track.length;
            
            // 开始拖动，计算合适的延迟，较短距离使用较快速度
            const baseDelay = Math.min(25, Math.max(15, config.sliderSpeed - distance / 50));
            const totalDuration = baseDelay * trackLength;
            
            if (config.debug) logger.info(`[验证码] 计划拖动轨迹: ${trackLength}步, 总时长: ${totalDuration}ms`);
            
            // 开始拖动
            slider.dispatchEvent(createMouseEvent('mousedown', startX, startY));
            
            // 使用更高效的轨迹执行方法
            let currentStep = 0;
            
            const moveSlider = () => {
                if (currentStep < trackLength) {
                    const point = track[currentStep];
                    const newX = startX + point.x;
                    const newY = startY + point.y;
                    
                    // 移动到下一个位置
                    slider.dispatchEvent(createMouseEvent('mousemove', newX, newY));
                    
                    // 调试信息，减少输出频率
                    if (config.debug && (currentStep === 0 || currentStep === trackLength - 1 || currentStep % 5 === 0)) {
                        logger.info(`[验证码] 拖动进度: ${Math.round((currentStep / (trackLength - 1)) * 100)}%, 位置: (${point.x}, ${point.y})`);
                    }
                    
                    currentStep++;
                    
                    // 使用setTimeout而不是setInterval，更好地控制轨迹执行
                    setTimeout(moveSlider, baseDelay);
                } else {
                    // 完成拖动后释放鼠标
                    const finalX = startX + distance;
                    slider.dispatchEvent(createMouseEvent('mouseup', finalX, startY));
                    
                    if (config.debug) logger.info('[验证码] 滑块拖动完成');
                    
                    // 尝试触发额外的事件
                    try {
                        // 有些验证码需要触发额外事件
                        slider.dispatchEvent(new Event('dragend', { bubbles: true }));
                        
                        // 只有在需要时才触发额外事件
                        const slideContainer = slider.closest('.captcha-container, .slider-container, [class*="captcha"], [class*="slider"]');
                        if (slideContainer) {
                            slideContainer.dispatchEvent(new Event('mouseup', { bubbles: true }));
                            slideContainer.dispatchEvent(new Event('drop', { bubbles: true }));
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }
            };
            
            // 开始移动
            moveSlider();
        } catch (e) {
            logger.error('[验证码] 模拟滑块拖动时出错:', e);
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
    
    // 处理点选验证码
    function checkForClickCaptcha(forceCheck = false) {
        if (!isEnabled || !config.captchaTypes.clickCaptcha) return;
        
        try {
            // 查找常见的点选验证码容器
            const clickCaptchaContainers = Array.from(document.querySelectorAll(
                '.captcha-click, .click-captcha, .point-captcha, ' +
                '[class*="clickCaptcha"], [class*="pointCaptcha"], ' +
                '[id*="clickCaptcha"], [id*="pointCaptcha"]'
            ));
            
            // 如果有自定义选择器，添加到检测列表
            if (config.customSelectors) {
                const customSelectors = config.customSelectors.split(',').map(s => s.trim()).filter(Boolean);
                if (customSelectors.length > 0) {
                    for (const selector of customSelectors) {
                        try {
                            const elements = Array.from(document.querySelectorAll(selector));
                            clickCaptchaContainers.push(...elements);
                        } catch (e) {
                            logger.error('自定义选择器错误:', selector, e);
                        }
                    }
                }
            }
            
            if (clickCaptchaContainers.length === 0) return;
            
            for (const container of clickCaptchaContainers) {
                // 如果已处理过，跳过
                if (processedCaptchas.has(container) && !forceCheck) continue;
                
                // 查找点选验证码的图片
                const captchaImg = container.querySelector('img');
                if (!captchaImg) continue;
                
                // 查找点选提示文本（通常包含"请点击"或"请选择"等字样）
                const captchaText = container.innerText;
                const hasClickPrompt = /请点击|请选择|点击图中|选择所有|click|select/i.test(captchaText);
                
                if (!captchaImg.src || !hasClickPrompt) continue;
                
                // 标记为已处理
                processedCaptchas.add(container);
                
                // 发送识别请求
                logger.info('检测到点选验证码:', captchaImg.src);
                
                // 获取验证码图片数据
                getImageData(captchaImg.src)
                    .then(imageData => {
                        // 从提示文本中提取需要点击的目标
                        const targetMatch = captchaText.match(/请点击[""](.+?)[""]|请选择[""](.+?)[""]|点击图中的[""](.+?)[""]|选择所有[""](.+?)[""]|click[""](.+?)[""]|select[""](.+?)[""]/i);
                        const target = targetMatch ? (targetMatch[1] || targetMatch[2] || targetMatch[3] || targetMatch[4] || targetMatch[5] || targetMatch[6] || '') : '';
                        
                        // 使用服务器识别点选目标位置
                        return recognizeClickCaptcha(imageData, target);
                    })
                    .then(result => {
                        if (!result || !result.success || !result.points || result.points.length === 0) {
                            logger.warn('点选验证码识别失败:', result);
                            return;
                        }
                        
                        logger.info('点选验证码识别成功:', result);
                        
                        // 延迟执行点击操作，使其看起来更自然
                        setTimeout(() => {
                            // 点击识别到的位置
                            simulateClicksOnCaptcha(captchaImg, result.points);
                        }, config.delay);
                    })
                    .catch(error => {
                        logger.error('点选验证码识别错误:', error);
                    });
            }
        } catch (error) {
            logger.error('检查点选验证码时出错:', error);
        }
    }
    
    // 识别点选验证码
    function recognizeClickCaptcha(imageData, target) {
        return new Promise((resolve, reject) => {
            // 构建请求数据
            const data = {
                image: imageData,
                target: target || '',
                type: 'click'
            };
            
            // 检查缓存
            const cacheKey = 'click_' + hashString(imageData + target);
            const cachedResult = captchaCache.get(cacheKey);
            
            if (cachedResult) {
                logger.info('使用缓存的点选验证码结果');
                resolve(cachedResult);
                return;
            }
            
            // 发送识别请求
            GM_xmlhttpRequest({
                method: 'POST',
                url: OCR_SERVER,
                data: JSON.stringify(data),
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: function(response) {
                    try {
                        const result = JSON.parse(response.responseText);
                        
                        // 缓存结果
                        if (result && result.success && result.points && result.points.length > 0) {
                            captchaCache.set(cacheKey, result);
                        }
                        
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }
    
    // 模拟点击验证码上的点
    function simulateClicksOnCaptcha(captchaImg, points) {
        try {
            // 获取图片位置和尺寸
            const rect = captchaImg.getBoundingClientRect();
            
            // 依次点击每个点
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                
                // 计算相对于浏览器窗口的坐标
                const clientX = rect.left + point.x;
                const clientY = rect.top + point.y;
                
                // 延迟点击，使每次点击间隔不同，更像人类操作
                setTimeout(() => {
                    // 创建并触发鼠标事件
                    const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                        view: window,
                        clientX: clientX,
                        clientY: clientY
                    });
                    
                    captchaImg.dispatchEvent(clickEvent);
                    
                    logger.info(`点击点选验证码位置: (${point.x}, ${point.y})`);
                    
                    // 如果点击完所有点后需要提交，可以在这里添加提交逻辑
                    if (i === points.length - 1 && config.autoSubmit) {
                        setTimeout(() => {
                            // 查找提交按钮
                            const submitButton = findSubmitButton(captchaImg);
                            if (submitButton) {
                                submitButton.click();
                                logger.info('自动点击提交按钮');
                            }
                        }, 500);
                    }
                }, 300 + Math.random() * 700 + i * 500); // 随机延迟使点击看起来更自然
            }
        } catch (error) {
            logger.error('模拟点击点选验证码时出错:', error);
        }
    }
    
    // 启动脚本
    init();

    // 初始化UI
    function initUI() {
        if (uiInitialized) return;
        
        // 添加样式
        GM_addStyle(uiStyles);
        
        // 创建图标
        if (config.showIcon) {
            createStatusIcon();
        }
        
        // 创建设置面板
        createSettingsPanel();
        
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'captcha-solver-overlay';
        document.body.appendChild(overlay);
        
        // 添加菜单命令
        registerMenuCommands();
        
        // 绑定快捷键
        if (config.enableKeyboardShortcuts) {
            bindKeyboardShortcuts();
        }
        
        uiInitialized = true;
    }

    // 创建状态图标
    function createStatusIcon() {
        const iconContainer = document.createElement('div');
        iconContainer.className = `captcha-solver-ui captcha-solver-icon ${config.iconPosition} ${!isEnabled ? 'disabled' : ''}`;
        iconContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"></path>
            <path d="M12 9v4l2 2"></path>
        </svg>`;
        
        // 点击图标切换启用状态
        iconContainer.addEventListener('click', toggleEnabled);
        
        // 右键点击图标打开设置
        iconContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            toggleSettingsPanel();
        });
        
        document.body.appendChild(iconContainer);
    }

    // 创建设置面板
    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.className = 'captcha-solver-panel';
        if (config.darkMode) {
            panel.classList.add('captcha-solver-dark-mode');
        }
        
        panel.innerHTML = `
            <div class="captcha-solver-panel-header">
                <h3 class="captcha-solver-panel-title">验证码识别工具设置</h3>
                <button class="captcha-solver-panel-close">&times;</button>
            </div>
            <div class="captcha-solver-panel-content">
                <div class="captcha-solver-tabs">
                    <div class="captcha-solver-tab active" data-tab="general">常规设置</div>
                    <div class="captcha-solver-tab" data-tab="advanced">高级设置</div>
                    <div class="captcha-solver-tab" data-tab="captcha">验证码设置</div>
                    <div class="captcha-solver-tab" data-tab="stats">统计信息</div>
                </div>
                
                <div class="captcha-solver-tab-content active" data-tab="general">
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-server">OCR服务器地址:</label>
                        <input type="text" id="captcha-solver-server" value="${OCR_SERVER}">
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-slide-server">滑块服务器地址:</label>
                        <input type="text" id="captcha-solver-slide-server" value="${SLIDE_SERVER}">
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-auto-mode" ${config.autoMode ? 'checked' : ''}>
                            自动识别验证码
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-show-notifications" ${config.showNotifications ? 'checked' : ''}>
                            显示通知
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-show-icon" ${config.showIcon ? 'checked' : ''}>
                            显示状态图标
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-dark-mode" ${config.darkMode ? 'checked' : ''}>
                            暗黑模式
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-icon-position">图标位置:</label>
                        <select id="captcha-solver-icon-position">
                            <option value="top-right" ${config.iconPosition === 'top-right' ? 'selected' : ''}>右上角</option>
                            <option value="top-left" ${config.iconPosition === 'top-left' ? 'selected' : ''}>左上角</option>
                            <option value="bottom-right" ${config.iconPosition === 'bottom-right' ? 'selected' : ''}>右下角</option>
                            <option value="bottom-left" ${config.iconPosition === 'bottom-left' ? 'selected' : ''}>左下角</option>
                        </select>
                    </div>
                </div>
                
                <div class="captcha-solver-tab-content" data-tab="advanced">
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-check-interval">检查间隔(毫秒):</label>
                        <input type="number" id="captcha-solver-check-interval" value="${config.checkInterval}" min="500" step="100">
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-console-log-level">日志级别:</label>
                        <select id="captcha-solver-console-log-level">
                            <option value="debug" ${config.consoleLogLevel === 'debug' ? 'selected' : ''}>调试</option>
                            <option value="info" ${config.consoleLogLevel === 'info' ? 'selected' : ''}>信息</option>
                            <option value="warn" ${config.consoleLogLevel === 'warn' ? 'selected' : ''}>警告</option>
                            <option value="error" ${config.consoleLogLevel === 'error' ? 'selected' : ''}>错误</option>
                            <option value="none" ${config.consoleLogLevel === 'none' ? 'selected' : ''}>无</option>
                        </select>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-persistent-cache" ${config.persistentCache ? 'checked' : ''}>
                            启用持久化缓存
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-cache-size">缓存大小:</label>
                        <input type="number" id="captcha-solver-cache-size" value="${config.cacheSize}" min="10" step="10">
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-enable-shortcuts" ${config.enableKeyboardShortcuts ? 'checked' : ''}>
                            启用键盘快捷键
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-auto-submit" ${config.autoSubmit ? 'checked' : ''}>
                            自动提交表单
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-custom-selectors">自定义验证码选择器(逗号分隔):</label>
                        <textarea id="captcha-solver-custom-selectors" rows="3">${config.customSelectors}</textarea>
                    </div>
                </div>
                
                <div class="captcha-solver-tab-content" data-tab="captcha">
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-normal-captcha" ${config.captchaTypes.normal ? 'checked' : ''}>
                            普通图形验证码
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-slider-captcha" ${config.captchaTypes.slider ? 'checked' : ''}>
                            滑块验证码
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-click-captcha" ${config.captchaTypes.clickCaptcha ? 'checked' : ''}>
                            点选验证码
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-rotation-captcha" ${config.captchaTypes.rotationCaptcha ? 'checked' : ''}>
                            旋转验证码(实验性)
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label>
                            <input type="checkbox" id="captcha-solver-jigsaw-captcha" ${config.captchaTypes.jigsaw ? 'checked' : ''}>
                            拼图验证码
                        </label>
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-search-depth">搜索深度:</label>
                        <input type="number" id="captcha-solver-search-depth" value="${config.searchDepth}" min="1" max="10">
                    </div>
                    <div class="captcha-solver-form-group">
                        <label for="captcha-solver-slider-speed">滑块速度:</label>
                        <input type="number" id="captcha-solver-slider-speed" value="${config.sliderSpeed}" min="5" max="50">
                    </div>
                </div>
                
                <div class="captcha-solver-tab-content" data-tab="stats">
                    <div class="captcha-solver-stats">
                        <div class="captcha-solver-stats-item">
                            <span class="captcha-solver-stats-label">总处理验证码数:</span>
                            <span id="captcha-solver-stats-total">${stats.totalCaptchas}</span>
                        </div>
                        <div class="captcha-solver-stats-item">
                            <span class="captcha-solver-stats-label">成功识别数:</span>
                            <span id="captcha-solver-stats-success">${stats.successCount}</span>
                        </div>
                        <div class="captcha-solver-stats-item">
                            <span class="captcha-solver-stats-label">失败数:</span>
                            <span id="captcha-solver-stats-fail">${stats.failCount}</span>
                        </div>
                        <div class="captcha-solver-stats-item">
                            <span class="captcha-solver-stats-label">平均识别时间:</span>
                            <span id="captcha-solver-stats-avg-time">${stats.avgTime.toFixed(2)} ms</span>
                        </div>
                        <div class="captcha-solver-stats-item">
                            <span class="captcha-solver-stats-label">上次重置时间:</span>
                            <span id="captcha-solver-stats-last-reset">${new Date(stats.lastReset).toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="margin-top: 15px; text-align: center;">
                        <button id="captcha-solver-reset-stats" class="captcha-solver-btn captcha-solver-btn-secondary">重置统计</button>
                    </div>
                </div>
            </div>
            <div class="captcha-solver-panel-footer">
                <button class="captcha-solver-btn captcha-solver-btn-secondary" id="captcha-solver-reset">重置默认设置</button>
                <button class="captcha-solver-btn captcha-solver-btn-primary" id="captcha-solver-save">保存设置</button>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 绑定事件
        bindSettingsPanelEvents();
    }

    // 绑定设置面板事件
    function bindSettingsPanelEvents() {
        // 关闭按钮
        document.querySelector('.captcha-solver-panel-close').addEventListener('click', toggleSettingsPanel);
        
        // Tab切换
        document.querySelectorAll('.captcha-solver-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // 切换标签激活状态
                document.querySelectorAll('.captcha-solver-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // 切换内容显示
                const tabName = tab.getAttribute('data-tab');
                document.querySelectorAll('.captcha-solver-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.querySelector(`.captcha-solver-tab-content[data-tab="${tabName}"]`).classList.add('active');
            });
        });
        
        // 保存设置
        document.getElementById('captcha-solver-save').addEventListener('click', saveSettings);
        
        // 重置默认设置
        document.getElementById('captcha-solver-reset').addEventListener('click', resetSettings);
        
        // 重置统计
        document.getElementById('captcha-solver-reset-stats').addEventListener('click', () => {
            resetStats();
            updateStatsDisplay();
            showNotification('成功', '统计数据已重置', 'success');
        });
        
        // 遮罩层点击关闭设置面板
        document.querySelector('.captcha-solver-overlay').addEventListener('click', toggleSettingsPanel);
    }

    // 保存设置
    function saveSettings() {
        // 服务器地址
        const ocrServer = document.getElementById('captcha-solver-server').value;
        const slideServer = document.getElementById('captcha-solver-slide-server').value;
        
        if (ocrServer) GM_setValue('ocr_server', ocrServer);
        if (slideServer) GM_setValue('slide_server', slideServer);
        
        // 更新配置
        config.autoMode = document.getElementById('captcha-solver-auto-mode').checked;
        config.showNotifications = document.getElementById('captcha-solver-show-notifications').checked;
        config.showIcon = document.getElementById('captcha-solver-show-icon').checked;
        config.darkMode = document.getElementById('captcha-solver-dark-mode').checked;
        config.iconPosition = document.getElementById('captcha-solver-icon-position').value;
        config.checkInterval = parseInt(document.getElementById('captcha-solver-check-interval').value);
        config.consoleLogLevel = document.getElementById('captcha-solver-console-log-level').value;
        config.persistentCache = document.getElementById('captcha-solver-persistent-cache').checked;
        config.cacheSize = parseInt(document.getElementById('captcha-solver-cache-size').value);
        config.enableKeyboardShortcuts = document.getElementById('captcha-solver-enable-shortcuts').checked;
        config.autoSubmit = document.getElementById('captcha-solver-auto-submit').checked;
        config.customSelectors = document.getElementById('captcha-solver-custom-selectors').value;
        config.searchDepth = parseInt(document.getElementById('captcha-solver-search-depth').value);
        config.sliderSpeed = parseInt(document.getElementById('captcha-solver-slider-speed').value);
        
        // 验证码类型
        config.captchaTypes.normal = document.getElementById('captcha-solver-normal-captcha').checked;
        config.captchaTypes.slider = document.getElementById('captcha-solver-slider-captcha').checked;
        config.captchaTypes.clickCaptcha = document.getElementById('captcha-solver-click-captcha').checked;
        config.captchaTypes.rotationCaptcha = document.getElementById('captcha-solver-rotation-captcha').checked;
        config.captchaTypes.jigsaw = document.getElementById('captcha-solver-jigsaw-captcha').checked;
        
        // 保存配置
        saveConfig();
        
        // 显示通知
        showNotification('成功', '设置已保存', 'success');
        
        // 更新UI
        updateUI();
        
        // 关闭设置面板
        toggleSettingsPanel();
    }

    // 重置默认设置
    function resetSettings() {
        if (confirm('确定要重置所有设置到默认值吗？统计数据将被保留。')) {
            config = Object.assign({}, defaultConfig, { statistics: stats });
            saveConfig();
            
            // 刷新设置面板
            document.body.removeChild(document.querySelector('.captcha-solver-panel'));
            createSettingsPanel();
            
            // 显示通知
            showNotification('成功', '设置已重置为默认值', 'success');
            
            // 更新UI
            updateUI();
        }
    }

    // 更新UI
    function updateUI() {
        // 更新图标
        if (config.showIcon) {
            const iconElement = document.querySelector('.captcha-solver-icon');
            if (!iconElement) {
                createStatusIcon();
                    } else {
                // 更新图标位置
                iconElement.className = `captcha-solver-ui captcha-solver-icon ${config.iconPosition} ${!isEnabled ? 'disabled' : ''}`;
            }
        } else {
            const iconElement = document.querySelector('.captcha-solver-icon');
            if (iconElement) {
                iconElement.remove();
            }
        }
        
        // 更新设置面板
        const panel = document.querySelector('.captcha-solver-panel');
        if (panel) {
            if (config.darkMode) {
                panel.classList.add('captcha-solver-dark-mode');
            } else {
                panel.classList.remove('captcha-solver-dark-mode');
            }
        }
        
        // 更新键盘快捷键
        if (config.enableKeyboardShortcuts) {
            bindKeyboardShortcuts();
        } else {
            unbindKeyboardShortcuts();
        }
    }

    // 切换设置面板显示状态
    function toggleSettingsPanel() {
        const panel = document.querySelector('.captcha-solver-panel');
        const overlay = document.querySelector('.captcha-solver-overlay');
        
        if (panel.classList.contains('active')) {
            panel.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            // 更新统计显示
            updateStatsDisplay();
            
            panel.classList.add('active');
            overlay.classList.add('active');
        }
    }

    // 更新统计显示
    function updateStatsDisplay() {
        document.getElementById('captcha-solver-stats-total').textContent = stats.totalCaptchas;
        document.getElementById('captcha-solver-stats-success').textContent = stats.successCount;
        document.getElementById('captcha-solver-stats-fail').textContent = stats.failCount;
        document.getElementById('captcha-solver-stats-avg-time').textContent = `${stats.avgTime.toFixed(2)} ms`;
        document.getElementById('captcha-solver-stats-last-reset').textContent = new Date(stats.lastReset).toLocaleString();
    }

    // 切换启用状态
    function toggleEnabled() {
        isEnabled = !isEnabled;
        GM_setValue('isEnabled', isEnabled);
        
        // 更新图标状态
        const iconElement = document.querySelector('.captcha-solver-icon');
        if (iconElement) {
            if (isEnabled) {
                iconElement.classList.remove('disabled');
                } else {
                iconElement.classList.add('disabled');
            }
        }
        
        // 显示通知
        showNotification(
            isEnabled ? '已启用' : '已禁用', 
            isEnabled ? '验证码识别服务已启用' : '验证码识别服务已禁用', 
            isEnabled ? 'success' : 'info'
        );
    }

    // 显示通知
    function showNotification(title, message, type = 'info') {
        if (!config.showNotifications) return;
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `captcha-solver-notification ${type}`;
        notification.innerHTML = `
            <div class="captcha-solver-notification-title">${title}</div>
            <div class="captcha-solver-notification-content">${message}</div>
        `;
        
        // 添加到页面
        document.body.appendChild(notification);
        
        // 显示通知
                    setTimeout(() => {
            notification.style.display = 'block';
        }, 100);
        
        // 自动关闭
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // 注册菜单命令
    function registerMenuCommands() {
        GM_registerMenuCommand('打开设置', toggleSettingsPanel);
        GM_registerMenuCommand(isEnabled ? '禁用验证码识别' : '启用验证码识别', toggleEnabled);
        GM_registerMenuCommand('强制扫描验证码', () => {
            if (isEnabled) {
                checkForCaptcha(true);
                if (config.captchaTypes.slider) {
                    checkForSliderCaptcha(true);
                }
                showNotification('扫描', '已强制扫描验证码', 'info');
            } else {
                showNotification('错误', '验证码识别服务已禁用', 'error');
            }
        });
    }

    // 绑定键盘快捷键
    function bindKeyboardShortcuts() {
        if (!config.enableKeyboardShortcuts) return;
        
        document.addEventListener('keydown', handleKeyboardShortcut);
    }

    // 解绑键盘快捷键
    function unbindKeyboardShortcuts() {
        document.removeEventListener('keydown', handleKeyboardShortcut);
    }

    // 处理键盘快捷键
    function handleKeyboardShortcut(e) {
        // Alt+C: 切换启用/禁用状态
        if (e.altKey && e.key === 'c') {
            toggleEnabled();
        }
        
        // Alt+S: 强制扫描验证码
        if (e.altKey && e.key === 's') {
            if (isEnabled) {
                checkForCaptcha(true);
                if (config.captchaTypes.slider) {
                    checkForSliderCaptcha(true);
                }
                showNotification('扫描', '已强制扫描验证码', 'info');
            } else {
                showNotification('错误', '验证码识别服务已禁用', 'error');
            }
        }
        
        // Alt+O: 打开设置
        if (e.altKey && e.key === 'o') {
            toggleSettingsPanel();
        }
        
        // Alt+I: 切换图标显示
        if (e.altKey && e.key === 'i') {
            config.showIcon = !config.showIcon;
            saveConfig();
            updateUI();
        }
    }

    // 监听DOM变化
    function observeDOMChanges() {
        // 使用MutationObserver监听DOM变化
        const observer = new MutationObserver(
            // 使用节流函数减少频繁调用
            throttle((mutations) => {
                // 检查是否有相关元素变化
                let shouldCheckCaptcha = false;
                let shouldCheckSlider = false;
                let shouldCheckClickCaptcha = false;
                
                for (const mutation of mutations) {
                    // 如果是属性变化且是src属性，可能是验证码图片更新
                    if (mutation.type === 'attributes' && 
                        mutation.attributeName === 'src' && 
                        mutation.target.tagName === 'IMG') {
                        shouldCheckCaptcha = true;
                    }
                    
                    // 如果是节点添加，检查是否与验证码相关
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // 检查是否与验证码相关
                                if (node.tagName === 'IMG' || 
                                    node.querySelector('img') || 
                                    node.className && /captcha|validate|verify/i.test(node.className) ||
                                    node.id && /captcha|validate|verify/i.test(node.id)) {
                                    shouldCheckCaptcha = true;
                                }
                                
                                // 检查是否与滑块验证码相关
                                if (node.className && /slider|drag|slide|puzzle/i.test(node.className) ||
                                    node.id && /slider|drag|slide|puzzle/i.test(node.id) ||
                                    node.querySelector('.slider, .drag, [class*="slider"], [class*="drag"], [id*="slider"], [id*="drag"]')) {
                                    shouldCheckSlider = true;
                                }
                                
                                // 检查是否与点选验证码相关
                                if (node.className && /click|point|select/i.test(node.className) ||
                                    node.id && /click|point|select/i.test(node.id) ||
                                    node.querySelector('.click-captcha, .point-captcha, [class*="clickCaptcha"], [class*="pointCaptcha"]')) {
                                    shouldCheckClickCaptcha = true;
                                }
                            }
                        }
                    }
                }
                
                // 如果有相关变化，延迟执行检查
                if (shouldCheckCaptcha) {
                    setTimeout(() => checkForCaptcha(), config.popupCheckDelay);
                }
                
                if (shouldCheckSlider && config.captchaTypes.slider) {
                    setTimeout(() => checkForSliderCaptcha(), config.popupCheckDelay);
                }
                
                if (shouldCheckClickCaptcha && config.captchaTypes.clickCaptcha) {
                    setTimeout(() => checkForClickCaptcha(), config.popupCheckDelay);
                }
            }, config.throttleInterval)
        );
        
        // 开始监听
        observer.observe(document.documentElement, config.mutationObserverConfig);
    }
})(); 