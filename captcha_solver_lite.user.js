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
    const DEFAULT_OCR_SERVER = 'http://127.0.0.1:9898/ocr';
    const DEFAULT_SLIDE_SERVER = 'http://127.0.0.1:9898/slide';
    
    // 从存储中获取服务器地址
    const OCR_SERVER = GM_getValue('ocr_server', DEFAULT_OCR_SERVER);
    const SLIDE_SERVER = GM_getValue('slide_server', DEFAULT_SLIDE_SERVER);
    
    // 配置
    const defaultConfig = {
        autoMode: true,  // 自动识别验证码
        checkInterval: 2000,  // 自动检查间隔(毫秒)，减少频率以降低CPU使用率
        debug: true,  // 打开调试信息，方便排查问题
        consoleLogLevel: 'info',  // 控制台日志级别: debug, info, warn, error, none
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
    
    // 缓存系统
    const captchaCache = {
        _memoryCache: new Map(),
        
        // 获取缓存
        get(key) {
            console.log('[验证码调试] 尝试获取缓存, key:', key.slice(0, 20) + '...');
            
            // 检查内存缓存
            if (this._memoryCache.has(key)) {
                console.log('[验证码调试] 内存缓存命中');
                return this._memoryCache.get(key);
            }
            
            // 检查持久化缓存
            if (config.persistentCache) {
                try {
                    const persistentKey = 'captcha_cache_' + hashString(key);
                    const cachedItem = GM_getValue(persistentKey);
                    
                    if (cachedItem) {
                        const {value, timestamp} = cachedItem;
                        
                        // 检查缓存是否过期
                        if (Date.now() - timestamp < config.cacheTTL) {
                            console.log('[验证码调试] 持久化缓存命中');
                            
                            // 同时存入内存缓存
                            this._memoryCache.set(key, value);
                            
                            return value;
                        } else {
                            // 缓存过期，删除
                            GM_deleteValue(persistentKey);
                        }
                    }
                } catch (e) {
                    console.error('[验证码调试] 获取持久化缓存出错:', e);
                }
            }
            
            console.log('[验证码调试] 缓存未命中');
            return null;
        },
        
        // 设置缓存
        set(key, value) {
            console.log('[验证码调试] 设置缓存, key:', key.slice(0, 20) + '...');
            
            try {
                // 存入内存缓存
                this._memoryCache.set(key, value);
                
                // 控制内存缓存大小
                if (this._memoryCache.size > config.cacheSize) {
                    // 删除最早加入的条目
                    const keysIterator = this._memoryCache.keys();
                    this._memoryCache.delete(keysIterator.next().value);
                }
                
                // 存入持久化缓存
                if (config.persistentCache) {
                    try {
                        const persistentKey = 'captcha_cache_' + hashString(key);
                        GM_setValue(persistentKey, {
                            value: value,
                            timestamp: Date.now()
                        });
                    } catch (e) {
                        console.error('[验证码调试] 设置持久化缓存出错:', e);
                    }
                }
            } catch (e) {
                console.error('[验证码调试] 设置缓存出错:', e);
            }
        },
        
        // 清理过期缓存
        cleanup() {
            console.log('[验证码调试] 清理过期缓存');
            
            try {
                // 清理持久化缓存
                if (config.persistentCache) {
                    const allKeys = GM_listValues();
                    const cacheKeys = allKeys.filter(key => key.startsWith('captcha_cache_'));
                    
                    console.log('[验证码调试] 找到', cacheKeys.length, '个缓存项');
                    
                    let deletedCount = 0;
                    const now = Date.now();
                    
                    // 删除过期缓存
                    for (const key of cacheKeys) {
                        try {
                            const cachedItem = GM_getValue(key);
                            if (cachedItem && now - cachedItem.timestamp > config.cacheTTL) {
                                GM_deleteValue(key);
                                deletedCount++;
                            }
                        } catch (e) {
                            // 忽略单个缓存项的错误
                        }
                    }
                    
                    console.log('[验证码调试] 已清理', deletedCount, '个过期缓存项');
                    
                    // 限制持久化缓存大小
                    if (cacheKeys.length - deletedCount > config.maxPersistentCacheSize) {
                        // 按时间排序
                        const remainingKeys = cacheKeys.filter(key => {
                            try {
                                return GM_getValue(key) !== undefined;
                            } catch (e) {
                                return false;
                            }
                        }).sort((a, b) => {
                            try {
                                const itemA = GM_getValue(a);
                                const itemB = GM_getValue(b);
                                return (itemA?.timestamp || 0) - (itemB?.timestamp || 0);
                            } catch (e) {
                                return 0;
                            }
                        });
                        
                        // 删除最旧的缓存项
                        const deleteCount = cacheKeys.length - config.maxPersistentCacheSize;
                        if (deleteCount > 0) {
                            for (let i = 0; i < deleteCount && i < remainingKeys.length; i++) {
                                try {
                                    GM_deleteValue(remainingKeys[i]);
                                } catch (e) {
                                    // 忽略单个删除错误
                                }
                            }
                            console.log('[验证码调试] 已清理', deleteCount, '个旧缓存项以控制缓存大小');
                        }
                    }
                    
                    // 记录最后清理时间
                    GM_setValue('lastCleanupTime', now);
                    lastCleanupTime = now;
                }
                
                // 清理内存缓存
                if (this._memoryCache.size > config.cacheSize) {
                    // 只保留最新的条目
                    const entries = Array.from(this._memoryCache.entries());
                    const toKeep = entries.slice(-config.cacheSize);
                    
                    this._memoryCache.clear();
                    for (const [k, v] of toKeep) {
                        this._memoryCache.set(k, v);
                    }
                    
                    console.log('[验证码调试] 已清理内存缓存至', this._memoryCache.size, '个条目');
                }
            } catch (e) {
                console.error('[验证码调试] 清理缓存过程出错:', e);
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
        console.log('=== 验证码识别助手(精简版) v1.2 已启动 ===');
        console.log('[验证码调试] 调试模式已开启，所有日志将输出到控制台');
        console.log('[验证码调试] OCR服务器地址:', OCR_SERVER);
        
        // 立即测试服务器连接
        testServerConnection();
        
        // 清理过期缓存
        const lastCleanupTimeKey = 'lastCleanupTime';
        const now = Date.now();
        const lastCleanupTime = GM_getValue(lastCleanupTimeKey, 0);
        
        if (now - lastCleanupTime > config.autoCleanupInterval) {
            console.log('[验证码调试] 开始定期清理缓存...');
            captchaCache.cleanup();
        }
        
        // 初始化事件监听器
        document.addEventListener('DOMContentLoaded', onDOMReady);
        
        // 如果文档已经加载完成，直接调用
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            console.log('[验证码调试] 文档已加载，立即启动');
            onDOMReady();
        }
        
        // 在文档可交互时启动定时检查
        window.addEventListener('load', function() {
            console.log('[验证码调试] 页面加载完成，开始验证码检查');
            
            // 再次测试服务器连接，确保连接正常
            setTimeout(() => testServerConnection(), 1000);
            
            // 强制立即检查一次
            setTimeout(() => {
                console.log('[验证码调试] 初始检查验证码...');
                checkForCaptcha(true);
            }, 1500);
            
            if (config.autoMode) {
                // 设置定时检查
                console.log('[验证码调试] 设置定时检查，间隔:', config.checkInterval, 'ms');
                
                setInterval(() => {
                    checkForCaptcha();
                }, config.checkInterval);
            }
            
            // 注册其他验证码类型的检测
            if (config.captchaTypes.slider && config.sliderEnabled) {
                // 初始滑块检查
                setTimeout(() => {
                    console.log('[验证码调试] 初始检查滑块验证码...');
                    checkForSliderCaptcha(true);
                }, config.initialSliderCheckDelay);
                
                // 定时检查滑块验证码
                if (config.forceSliderCheck) {
                    console.log('[验证码调试] 设置滑块验证码定时检查');
                    setInterval(() => {
                        checkForSliderCaptcha();
                    }, 5000);  // 降低频率，减少资源占用
                }
            }
            
            if (config.captchaTypes.clickCaptcha) {
                // 初始点选验证码检查
                setTimeout(() => {
                    console.log('[验证码调试] 初始检查点选验证码...');
                    checkForClickCaptcha(true);
                }, 2000);
            }
            
            console.log('[验证码调试] 开始观察页面变化');
            
            // 观察页面变化
            observePageChanges();
            
            // 监听弹窗
            observePopups();
            
            // 监听登录按钮的点击
            listenForLoginButtonClicks();
            
            // 监听验证码图片的点击，有些网站会在点击验证码后刷新
            listenForCaptchaClicks();
            
            // 初始化UI
            if (config.showIcon) {
                console.log('[验证码调试] 初始化UI');
                setTimeout(initUI, 1500);
            } else {
                console.log('[验证码调试] UI已禁用，跳过初始化');
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
    
    // 测试服务器连接
    function testServerConnection() {
        console.log('[验证码调试] 测试服务器连接...');
        console.log('[验证码调试] 测试地址:', OCR_SERVER);
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: OCR_SERVER.replace('/ocr', '/'),
            timeout: 5000,
            onload: function(response) {
                try {
                    console.log('[验证码调试] 服务器响应状态码:', response.status);
                    if (response.status !== 200) {
                        console.error('[验证码调试] 服务器返回错误状态码:', response.status);
                        console.error('[验证码调试] 响应内容:', response.responseText);
                        return;
                    }
                    
                    const result = JSON.parse(response.responseText);
                    console.log('[验证码调试] 服务器连接成功:', result);
                } catch (e) {
                    console.error('[验证码调试] 服务器响应解析错误:', e);
                    console.error('[验证码调试] 原始响应:', response.responseText);
                }
            },
            onerror: function(error) {
                console.error('[验证码调试] 服务器连接失败:', error);
                console.error('[验证码调试] 请检查服务器地址是否正确，并确认服务器是否已启动');
                console.error('[验证码调试] 本地服务器需要启动 simple_ocr_server.py');
            },
            ontimeout: function() {
                console.error('[验证码调试] 服务器连接超时');
                console.error('[验证码调试] 请检查服务器地址是否正确，并确认服务器是否已启动');
                console.error('[验证码调试] 本地服务器需要启动 simple_ocr_server.py');
            }
        });
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
        const captchaKeywords = [
            'captcha', 'verify', 'vcode', 'yzm', 'yanzheng', 'code', 'check', 
            'authcode', 'seccode', 'validate', 'verification', '验证码', '验证', '校验码',
            'security', 'rand', 'refresh', '刷新码', 'verifycode'
        ];
        
        // 检查父元素和祖先元素的类名和ID是否包含关键词
        let parent = img.parentElement;
        let parentChecked = false;
        let depth = 0; // 设置最大深度为3
        while (parent && depth < 3 && !parentChecked) {
            const parentClass = (parent.className || '').toLowerCase();
            const parentId = (parent.id || '').toLowerCase();
            
            for (const keyword of captchaKeywords) {
                if (parentClass.includes(keyword) || parentId.includes(keyword)) {
                    parentChecked = true;
                    break;
                }
            }
            parent = parent.parentElement;
            depth++;
        }
        
        // 检查图片各种属性
        for (const keyword of captchaKeywords) {
            if (src.includes(keyword) || alt.includes(keyword) || title.includes(keyword) || 
                className.includes(keyword) || id.includes(keyword) || parentChecked) {
                
                // 额外排除已知的非验证码图片
                if (
                    src.includes('logo') || 
                    src.includes('icon') || 
                    src.includes('avatar')
                ) {
                    return false;
                }
                
                if (config.debug) logger.info('[验证码] 通过关键词匹配识别到验证码图片:', src);
                return true;
            }
        }
        
        // 基于图片尺寸判断
        if (img.complete && img.naturalWidth > 0) {
            // 验证码图片通常较小，但不会太小
            if (img.naturalWidth >= 30 && img.naturalWidth <= 200 &&
                img.naturalHeight >= 18 && img.naturalHeight <= 100) {
                
                // 排除明显不是验证码的图片
                if (src.includes('logo') || src.includes('icon')) return false;
                
                // 验证码宽高比通常在1:1到5:1之间
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio >= 0.8 && ratio <= 6) {
                    // 尝试通过尺寸和周围环境判断
                    let hasNearbyInput = false;
                    let currentNode = img.parentElement;
                    let searchDepth = 0;
                    
                    while (currentNode && searchDepth < 3) {
                        const inputs = currentNode.querySelectorAll('input[type="text"], input:not([type])');
                        if (inputs.length > 0) {
                            hasNearbyInput = true;
                            break;
                        }
                        currentNode = currentNode.parentElement;
                        searchDepth++;
                    }
                    
                    // 放宽判断条件：如果尺寸合适或者有附近的输入框，更可能是验证码
                    if (hasNearbyInput || (ratio >= 1.5 && ratio <= 4)) {
                        if (config.debug) logger.info('[验证码] 通过尺寸和环境判断识别到验证码图片:', src, 
                            '尺寸:', img.naturalWidth, 'x', img.naturalHeight, 
                            '比例:', ratio.toFixed(2), 
                            '附近有输入框:', hasNearbyInput);
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    // 主函数：检查验证码
    function checkForCaptcha(isForceCheck = false, isPopupCheck = false) {
        console.log('[验证码调试] 开始检查验证码, 强制检查:', isForceCheck, '弹窗检查:', isPopupCheck);
        
        if (isForceCheck) {
            if (config.debug) {
                if (isPopupCheck) {
                    logger.info('[验证码] 检查弹窗中的验证码...');
                } else {
                    logger.info('[验证码] 强制检查验证码...');
                }
            }
            console.log('[验证码调试] 强制检查，清空处理缓存');
            processedCaptchas.clear();
        }
        
        // 查找验证码图片
        const captchaImg = findCaptchaImage(isPopupCheck);
        
        // 如果没找到验证码图片，直接返回
        if (!captchaImg) {
            console.log('[验证码调试] 未找到验证码图片');
            return;
        }
        
        console.log('[验证码调试] 找到验证码图片:', captchaImg.src || captchaImg.id || '(无src)');
        
        // 检查是否已经处理过该验证码
        const imageKey = captchaImg.src || captchaImg.id || captchaImg.className || Date.now().toString();
        if (!isForceCheck && processedCaptchas.has(imageKey)) {
            console.log('[验证码调试] 该验证码已经处理过，跳过');
            return;
        }
        
        console.log('[验证码调试] 查找验证码输入框');
        
        // 查找输入框
        const captchaInput = findCaptchaInput(captchaImg, isPopupCheck);
        
        // 如果没找到输入框，直接返回
        if (!captchaInput) {
            console.log('[验证码调试] 未找到对应的输入框，无法处理验证码');
            return;
        }
        
        console.log('[验证码调试] 找到验证码输入框:', captchaInput.id || captchaInput.name || '(无id/name)');
        
        // 保存当前验证码和输入框引用
        currentCaptchaImg = captchaImg;
        currentCaptchaInput = captchaInput;
        
        // 标记为已处理
        processedCaptchas.add(imageKey);
        
        // 即使输入框已有值，也继续处理，会在填写前清空
        if (captchaInput.value && captchaInput.value.trim() !== '') {
            console.log('[验证码调试] 输入框已有值:', captchaInput.value, '，将清空并重新识别');
        }
        
        console.log('[验证码调试] 开始获取图片数据');
        
        // 获取验证码图片数据
        getImageBase64(captchaImg)
            .then(base64 => {
                if (!base64) {
                    console.error('[验证码调试] 获取图片数据失败');
                    return;
                }
                
                console.log('[验证码调试] 成功获取图片数据，长度:', base64.length);
                
                // 发送到OCR服务器识别
                recognizeCaptcha(base64, captchaInput);
            })
            .catch(err => {
                console.error('[验证码调试] 处理图片时出错:', err);
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
            console.log('[验证码调试] 尝试获取图片数据:', img.src || img.id || 'Canvas元素');
            
            // 检查缓存
            const imgSrc = img.src || '';
            const cacheKey = imgSrc;
            
            // 如果有缓存，直接返回
            const cachedData = captchaCache.get(cacheKey);
            if (cachedData) {
                console.log('[验证码调试] 使用缓存的图片数据');
                return cachedData;
            }
            
            // 对于Canvas元素
            if (img.tagName.toLowerCase() === 'canvas') {
                try {
                    console.log('[验证码调试] 尝试获取Canvas数据');
                    const base64Data = img.toDataURL('image/png').split(',')[1];
                    captchaCache.set(cacheKey, base64Data);
                    return base64Data;
                } catch (e) {
                    console.error('[验证码调试] 获取Canvas数据失败:', e);
                }
            }
            
            // 简化图片获取过程，直接使用最可靠的方法
            if (img.tagName.toLowerCase() === 'img') {
                try {
                    // 简单的直接获取方法
                    if (img.src && img.src.startsWith('data:image')) {
                        console.log('[验证码调试] 直接从data URL获取图片数据');
                        const directData = img.src.split(',')[1];
                        captchaCache.set(cacheKey, directData);
                        return directData;
                    }
                    
                    // 尝试创建新图片并加载
                    console.log('[验证码调试] 尝试创建新图片并获取数据');
                    const result = await new Promise((resolve) => {
                        const newImg = new Image();
                        newImg.crossOrigin = 'Anonymous';
                        
                        newImg.onload = function() {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = newImg.width;
                                canvas.height = newImg.height;
                                
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(newImg, 0, 0);
                                
                                const dataURL = canvas.toDataURL('image/png');
                                const base64Data = dataURL.split(',')[1];
                                resolve(base64Data);
                            } catch (e) {
                                console.error('[验证码调试] 绘制新图片失败:', e);
                                resolve(null);
                            }
                        };
                        
                        newImg.onerror = function() {
                            console.error('[验证码调试] 加载新图片失败');
                            resolve(null);
                        };
                        
                        // 添加随机参数避免缓存
                        const srcWithNocache = img.src + (img.src.includes('?') ? '&' : '?') + 'nocache=' + Date.now();
                        newImg.src = srcWithNocache;
                        
                        // 设置超时
                        setTimeout(() => resolve(null), 3000);
                    });
                    
                    if (result) {
                        captchaCache.set(cacheKey, result);
                        return result;
                    }
                    
                    // 尝试使用GM_xmlhttpRequest获取
                    console.log('[验证码调试] 尝试通过GM_xmlhttpRequest获取图片');
                    const fetchedData = await fetchImage(img.src);
                    if (fetchedData) {
                        captchaCache.set(cacheKey, fetchedData);
                        return fetchedData;
                    }
                } catch (e) {
                    console.error('[验证码调试] 处理图片过程出错:', e);
                }
            }
            
            console.error('[验证码调试] 无法获取图片数据');
            return null;
        } catch (e) {
            console.error('[验证码调试] 获取图片base64出现严重错误:', e);
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
        console.log('[验证码调试] 准备发送图片到OCR服务器识别');
        
        // 检查缓存
        const cacheKey = imageBase64.slice(0, 100); // 使用图片数据的前100个字符作为缓存键
        const cachedResult = captchaCache.get('ocr_' + cacheKey);
        
        if (cachedResult) {
            console.log('[验证码调试] 使用缓存的识别结果:', cachedResult);
            
            // 填写验证码
            inputElement.value = cachedResult;
            
            // 触发事件
            triggerInputEvents(inputElement);
            
            console.log('[验证码调试] 已自动填写(缓存):', cachedResult);
            
            // 清除当前处理的验证码
            currentCaptchaImg = null;
            currentCaptchaInput = null;
            
            return;
        }
        
        console.log('[验证码调试] 发送到OCR服务器识别...');
        console.log('[验证码调试] 使用服务器:', OCR_SERVER);
        
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
                    console.log('[验证码调试] 收到服务器响应，状态码:', response.status);
                    
                    if (response.status !== 200) {
                        console.error('[验证码调试] 服务器返回错误状态码:', response.status);
                        console.error('[验证码调试] 响应内容:', response.responseText);
                        return;
                    }
                    
                    const result = JSON.parse(response.responseText);
                    console.log('[验证码调试] 解析响应:', result);
                    
                    if (result.code === 0 && result.data) {
                        const captchaText = result.data.trim();
                        
                        if (captchaText) {
                            // 存入缓存
                            captchaCache.set('ocr_' + cacheKey, captchaText);
                            
                            console.log('[验证码调试] 识别成功:', captchaText);
                            
                            // 填写验证码
                            inputElement.value = captchaText;
                            
                            // 触发事件
                            triggerInputEvents(inputElement);
                            
                            console.log('[验证码调试] 已自动填写:', captchaText);
                            
                            // 尝试查找并点击提交按钮
                            if (config.autoSubmit) {
                                tryFindAndClickSubmitButton(inputElement);
                            } else {
                                console.log('[验证码调试] 自动提交已禁用，不点击提交按钮');
                            }
                        } else {
                            console.log('[验证码调试] 识别结果为空');
                        }
                    } else {
                        console.error('[验证码调试] 识别失败:', result.message || '未知错误');
                    }
                } catch (e) {
                    console.error('[验证码调试] 解析OCR结果时出错:', e);
                    console.error('[验证码调试] 原始响应:', response.responseText);
                } finally {
                    // 清除当前处理的验证码
                    currentCaptchaImg = null;
                    currentCaptchaInput = null;
                }
            },
            onerror: function(error) {
                console.error('[验证码调试] OCR请求失败:', error);
                console.error('[验证码调试] 请检查服务器地址是否正确，以及服务器是否已启动');
                
                // 清除当前处理的验证码
                currentCaptchaImg = null;
                currentCaptchaInput = null;
            },
            ontimeout: function() {
                console.error('[验证码调试] OCR请求超时，10秒内未收到响应');
                console.error('[验证码调试] 请检查服务器是否已启动，网络连接是否正常');
                
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

    // 确保DOMContentLoaded后执行onDOMReady
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDOMReady);
                    } else {
        // 如果DOMContentLoaded已触发，直接执行
        onDOMReady();
    }

    // UI样式定义
    const uiStyles = `
    .captcha-solver-ui {
        font-family: Arial, sans-serif;
        font-size: 14px;
        color: #333;
    }

    .captcha-solver-icon {
        position: fixed;
        width: 32px;
        height: 32px;
        background-color: rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 9999;
        transition: all 0.3s ease;
    }

    .captcha-solver-icon:hover {
        transform: scale(1.1);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    }

    .captcha-solver-icon.top-right {
        top: 20px;
        right: 20px;
    }

    .captcha-solver-icon.top-left {
        top: 20px;
        left: 20px;
    }

    .captcha-solver-icon.bottom-right {
        bottom: 20px;
        right: 20px;
    }

    .captcha-solver-icon.bottom-left {
        bottom: 20px;
        left: 20px;
    }

    .captcha-solver-icon svg {
        width: 20px;
        height: 20px;
        stroke: #4a6cf7;
    }

    .captcha-solver-icon.disabled svg {
        stroke: #888;
    }

    .captcha-solver-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        width: 500px;
        max-width: 90%;
        max-height: 85vh;
        background-color: #fff;
        border-radius: 8px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .captcha-solver-panel.active {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, -50%) scale(1);
    }

    .captcha-solver-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
    }

    .captcha-solver-panel-title {
        margin: 0;
        font-size: 18px;
        font-weight: bold;
        color: #333;
    }

    .captcha-solver-panel-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #888;
        cursor: pointer;
        padding: 0;
        margin: 0;
    }

    .captcha-solver-panel-content {
        padding: 20px;
        overflow-y: auto;
        max-height: calc(85vh - 60px);
    }

    .captcha-solver-form-group {
        margin-bottom: 15px;
    }

    .captcha-solver-form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
    }

    .captcha-solver-form-group input[type="text"],
    .captcha-solver-form-group input[type="number"],
    .captcha-solver-form-group select,
    .captcha-solver-form-group textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
    }

    .captcha-solver-form-group textarea {
        resize: vertical;
        min-height: 80px;
    }

    .captcha-solver-tabs {
        display: flex;
        border-bottom: 1px solid #eee;
        margin-bottom: 20px;
    }

    .captcha-solver-tab {
        padding: 10px 15px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
    }

    .captcha-solver-tab:hover {
        background-color: #f5f5f5;
    }

    .captcha-solver-tab.active {
        border-bottom-color: #4a6cf7;
        color: #4a6cf7;
    }

    .captcha-solver-tab-content {
        display: none;
    }

    .captcha-solver-tab-content.active {
        display: block;
    }

    .captcha-solver-button-group {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
    }

    .captcha-solver-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .captcha-solver-button.primary {
        background-color: #4a6cf7;
        color: white;
    }

    .captcha-solver-button.secondary {
        background-color: #f5f5f5;
        color: #333;
    }

    .captcha-solver-button.danger {
        background-color: #f44336;
        color: white;
    }

    .captcha-solver-button:hover {
        opacity: 0.9;
        transform: translateY(-1px);
    }

    .captcha-solver-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
    }

    .captcha-solver-overlay.active {
        opacity: 1;
        visibility: visible;
    }

    .captcha-solver-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
        padding: 15px;
        z-index: 10001;
        transform: translateY(20px);
        opacity: 0;
        transition: all 0.3s ease;
        display: none;
    }

    .captcha-solver-notification.info {
        border-left: 4px solid #2196f3;
    }

    .captcha-solver-notification.success {
        border-left: 4px solid #4caf50;
    }

    .captcha-solver-notification.warning {
        border-left: 4px solid #ff9800;
    }

    .captcha-solver-notification.error {
        border-left: 4px solid #f44336;
    }

    .captcha-solver-notification-title {
        font-weight: bold;
        margin-bottom: 5px;
        color: #333;
    }

    .captcha-solver-notification-content {
        color: #666;
        font-size: 13px;
    }

    /* 暗黑模式 */
    .captcha-solver-dark-mode {
        background-color: #222;
        color: #eee;
    }

    .captcha-solver-dark-mode .captcha-solver-panel-header {
        border-bottom-color: #444;
    }

    .captcha-solver-dark-mode .captcha-solver-panel-title {
        color: #eee;
    }

    .captcha-solver-dark-mode .captcha-solver-form-group input[type="text"],
    .captcha-solver-dark-mode .captcha-solver-form-group input[type="number"],
    .captcha-solver-dark-mode .captcha-solver-form-group select,
    .captcha-solver-dark-mode .captcha-solver-form-group textarea {
        background-color: #333;
        border-color: #555;
        color: #eee;
    }

    .captcha-solver-dark-mode .captcha-solver-tab:hover {
        background-color: #333;
    }

    .captcha-solver-dark-mode .captcha-solver-button.secondary {
        background-color: #444;
        color: #eee;
    }
    
    /* 数据统计表格 */
    .captcha-solver-stats-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }
    
    .captcha-solver-stats-table td,
    .captcha-solver-stats-table th {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #eee;
    }
    
    .captcha-solver-dark-mode .captcha-solver-stats-table td,
    .captcha-solver-dark-mode .captcha-solver-stats-table th {
        border-bottom-color: #444;
    }
    `;
    
    // 初始化UI
    function initUI() {
        if (uiInitialized) return;
        
        console.log('开始初始化UI');
        
        try {
            // 添加样式
            GM_addStyle(uiStyles);
            console.log('样式已添加');
            
            // 创建图标
            if (config.showIcon) {
                createStatusIcon();
                console.log('状态图标已创建');
            }
            
            // 创建设置面板
            createSettingsPanel();
            console.log('设置面板已创建');
            
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.className = 'captcha-solver-overlay';
            document.body.appendChild(overlay);
            console.log('遮罩层已创建');
            
            // 添加菜单命令
            registerMenuCommands();
            console.log('菜单命令已注册');
            
            // 绑定快捷键
            if (config.enableKeyboardShortcuts) {
                bindKeyboardShortcuts();
                console.log('键盘快捷键已绑定');
            }
            
            // 绑定设置面板事件
            bindSettingsPanelEvents();
            console.log('设置面板事件已绑定');
            
            uiInitialized = true;
            console.log('UI初始化完成');
            
            alert('验证码识别工具UI已加载');
        } catch (error) {
            console.error('UI初始化出错:', error);
            alert('验证码识别工具UI加载失败: ' + error.message);
        }
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
                </div>
                
                <div class="captcha-solver-tab-content" data-tab="stats">
                    <h4>统计信息</h4>
                    <table class="captcha-solver-stats-table">
                        <tr>
                            <td>总处理验证码:</td>
                            <td id="captcha-solver-stats-total">${stats.totalCaptchas}</td>
                        </tr>
                        <tr>
                            <td>成功识别:</td>
                            <td id="captcha-solver-stats-success">${stats.successCount}</td>
                        </tr>
                        <tr>
                            <td>识别失败:</td>
                            <td id="captcha-solver-stats-fail">${stats.failCount}</td>
                        </tr>
                        <tr>
                            <td>平均识别时间:</td>
                            <td id="captcha-solver-stats-avg-time">${stats.avgTime.toFixed(2)} ms</td>
                        </tr>
                        <tr>
                            <td>上次重置:</td>
                            <td id="captcha-solver-stats-last-reset">${new Date(stats.lastReset).toLocaleString()}</td>
                        </tr>
                    </table>
                    <div class="captcha-solver-button-group">
                        <button class="captcha-solver-button danger" id="captcha-solver-reset-stats">重置统计</button>
                    </div>
                </div>
                
                <div class="captcha-solver-button-group">
                    <button class="captcha-solver-button secondary" id="captcha-solver-cancel">取消</button>
                    <button class="captcha-solver-button danger" id="captcha-solver-reset">重置设置</button>
                    <button class="captcha-solver-button primary" id="captcha-solver-save">保存设置</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        return panel;
    }
    
    // 绑定设置面板事件
    function bindSettingsPanelEvents() {
        // 绑定标签页切换
        const tabs = document.querySelectorAll('.captcha-solver-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                
                // 移除所有激活状态
                document.querySelectorAll('.captcha-solver-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.captcha-solver-tab-content').forEach(c => c.classList.remove('active'));
                
                // 激活当前标签
                tab.classList.add('active');
                document.querySelector(`.captcha-solver-tab-content[data-tab="${tabName}"]`).classList.add('active');
            });
        });
        
        // 绑定关闭按钮
        const closeButton = document.querySelector('.captcha-solver-panel-close');
        if (closeButton) {
            closeButton.addEventListener('click', toggleSettingsPanel);
        }
        
        // 绑定取消按钮
        const cancelButton = document.getElementById('captcha-solver-cancel');
        if (cancelButton) {
            cancelButton.addEventListener('click', toggleSettingsPanel);
        }
        
        // 绑定保存按钮
        const saveButton = document.getElementById('captcha-solver-save');
        if (saveButton) {
            saveButton.addEventListener('click', saveSettings);
        }
        
        // 绑定重置按钮
        const resetButton = document.getElementById('captcha-solver-reset');
        if (resetButton) {
            resetButton.addEventListener('click', resetSettings);
        }
        
        // 绑定重置统计按钮
        const resetStatsButton = document.getElementById('captcha-solver-reset-stats');
        if (resetStatsButton) {
            resetStatsButton.addEventListener('click', () => {
                resetStats();
                updateStatsDisplay();
            });
        }
        
        // 绑定遮罩层点击事件
        const overlay = document.querySelector('.captcha-solver-overlay');
        if (overlay) {
            overlay.addEventListener('click', toggleSettingsPanel);
        }
    }
    
    // 保存设置
    function saveSettings() {
        // 从表单获取值
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
        config.captchaTypes.normal = document.getElementById('captcha-solver-normal-captcha').checked;
        config.captchaTypes.slider = document.getElementById('captcha-solver-slider-captcha').checked;
        config.captchaTypes.clickCaptcha = document.getElementById('captcha-solver-click-captcha').checked;
        
        // 获取服务器地址
        const newOcrServer = document.getElementById('captcha-solver-server').value;
        const newSlideServer = document.getElementById('captcha-solver-slide-server').value;
        
        // 更新服务器地址
        if (newOcrServer !== OCR_SERVER) {
            GM_setValue('ocr_server', newOcrServer);
        }
        
        if (newSlideServer !== SLIDE_SERVER) {
            GM_setValue('slide_server', newSlideServer);
        }
        
        // 保存配置
        saveConfig();
        
        // 更新UI
        updateUI();
        
        // 关闭设置面板
        toggleSettingsPanel();
        
        // 显示通知
        showNotification('设置已保存', '验证码识别工具设置已更新', 'success');
    }
    
    // 重置设置
    function resetSettings() {
        if (confirm('确定要重置所有设置到默认值吗？')) {
            config = Object.assign({}, defaultConfig);
            saveConfig();
            updateUI();
            toggleSettingsPanel();
            showNotification('设置已重置', '验证码识别工具设置已重置为默认值', 'info');
        }
    }
    
    // 更新UI
    function updateUI() {
        // 更新图标
        const iconElement = document.querySelector('.captcha-solver-icon');
        if (iconElement) {
            document.body.removeChild(iconElement);
        }
        
        if (config.showIcon) {
            createStatusIcon();
        }
        
        // 更新设置面板
        const panel = document.querySelector('.captcha-solver-panel');
        if (panel) {
            panel.className = 'captcha-solver-panel';
            if (config.darkMode) {
                panel.classList.add('captcha-solver-dark-mode');
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
        return iconContainer;
    }
})(); 