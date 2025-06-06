// ==UserScript==
// @name         验证码识别助手(精简版)
// @namespace    https://github.com/zjy2931/captcha_solver_lite
// @version      0.1.7
// @description  自动识别网页中的图形验证码，支持绝大多数网站的常见验证码类型。精简版本，修复了图片获取和识别问题。
// @author       zjy2931
// @match        *://*/*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSJub25lIiBkPSJNMCAwaDI0djI0SDB6Ii8+PHBhdGggZD0iTTEwIDdjLS41MjcgMC0uOTk0LjIyNi0xLjMzLjU2MnMtLjU2Mi44MDMtLjU2MiAxLjMzLjIyNi45OTQuNTYyIDEuMzMuODAzLjU2MiAxLjMzLjU2Mi45OTQtLjIyNiAxLjMzLS41NjIuNTYyLS44MDMuNTYyLTEuMzMtLjIyNi0uOTk0LS41NjItMS4zM1MxMC41MjcgNyAxMCA3em0xLjYwNiA0LjA2OGMtLjAwOS0uMDEtLjAxOC0uMDItLjAyNy0uMDI5YTIuOTgzIDIuOTgzIDAgMCAxLTEuNTc5LjQ1M2MtLjgyMiAwLTEuNTU2LS4zMzctMi4wOS0uODdsLS4wMDEuMDAzYy0uNTYzLjU3Ni0xLjEwNSAxLjE4LTEuNTk2IDEuODFhOC4yMzMgOC4yMzMgMCAwIDAgLjQ1Ni42MTJDOCAxNC4zMzEgOS4yODEgMTQuOCA5Ljk4MSAxNS4yYy4zNS4yLjU5NS4zNjcuNjI1LjM5MS4wOS4wNzUuMjIuMTI1LjM2NC4xMjUuMTQ0IDAgLjI3My0uMDUuMzY0LS4xMjUuMDUtLjA0LjI4Mi0uMTk1LjYyNC0uMzkxLjcwMS0uNC45ODMtLjg2OSAxLjIwOC0xLjE1My4xNjYtLjIxLjMxNS0uNDEuNDQ0LS42MTJhMjAuOTQ1IDIwLjk0NSAwIDAgMS0yLjAwNC0yLjA5NnoiIGZpbGw9InJnYmEoMCwwLDAsMSkiLz48cGF0aCBkPSJNMTkuNDI4IDkuMDE1YTcuOTY0IDcuOTY0IDAgMCAwLTEuNjM5LTIuNDA5IDguMDQyIDguMDQyIDAgMCAwLTEwLjU5LTEuNDY0QTcuOTYzIDcuOTYzIDAgMCAwIDQuNTcyIDkuMDE1Yy4xNDguMjgzLjI3Ny41Ny4zODcuODYuNTM0IDEuNDMyLjYyNyAyLjkyLjYyNSA0LjE0NGEuNTc3LjU3NyAwIDAgMCAuMTg3LjQzYy4zMTQuMjkuNjQ2LjU2IDEuMjA1LjkzNXEuMzIzLjIxNi42OTYuNDM2LjYwOC4zNTggMS4yNjUuNjhjLjU5My4yOSAxLjI3Mi41NTMgMi4wNTIuNTU2LjE3LjAwMS4zNC0uMDIuNTEtLjA2Mi43OTcuMDQxLjk1OS4wNi45OTguMDYyLjc4LS4wMDMgMS40Ni0uMjY1IDIuMDUyLS41NTYuNDMtLjIxLjg0Mi0uNDM4IDEuMjY1LS42OC4yNS0uMTQ2LjQ2OS0uMjg3LjY5Ni0uNDM1LjU2LS4zNzQuODkxLS42NDUgMS4yMDUtLjkzNWEuNTc3LjU3NyAwIDAgMCAuMTg3LS40M2MtLjAwMi0xLjIyNS4wOS0yLjcxMi42MjUtNC4xNDMuMTEtLjI5MS4yNC0uNTc4LjM4OC0uODZ6bS0zLjQyNyA0LjkzbC0uMDM5LS4wNDctLjA1Ni4wMzdjLS41MjYuNTctMS4wOTMgMS4xNS0yLjAzOCAxLjY5My0uMzgxLjIxOS0uNjYxLjM5NS0uODQuNDg4YTIuMzI1IDIuMzI1IDAgMCAxLTEuMDU2LS4wMDVjLS4xNzctLjA5Mi0uNDU1LS4yNjctLjgzNC0uNDgzLS45NDUtLjU0NC0xLjUxMS0xLjEyNC0yLjAzOC0xLjY5NGwtLjA1Ni0uMDM2LS4wMzguMDQ4YTEyLjA1MiAxMi4wNTIgMCAwIDEtLjc5OSAxLjAyMmMuMTg4LjE0NS4zNy4yODEuNTUyLjQwOCAxIC42OTggMS45MzcgMS4xOTkgMy4yODggMS4xOTlsLjMwMy4wMDIuMDAxLS4wMDIuMDAxLjAwMi4zMDMtLjAwMmMxLjM1MSAwIDIuMjg4LS41MDEgMy4yODgtMS4xOTlhMTkuMzIyIDE5LjMyMiAwIDAgMCAuNTUyLS40MDhjLS4yNjUtLjMyOS0uNTI1LS42NzMtLjgtMS4wMjJ6bTIuMTM1LTEuODA0YTkuNzk4IDkuNzk4IDAgMCAxLS4xNTYgMS40MWMtLjQ1MS0uMzY0LS43OTQtLjY4LTEuMTgtLjk3M2ExOS43MyAxOS43MyAwIDAgMC0xLjYyMy0xLjE3IDYuODc2IDYuODc2IDAgMCAwIC41MjktLjcgNy44MDggNy44MDggMCAwIDAgMS42ODQtMy44NCA2LjA3NiA2LjA3NiAwIDAgMSAxLjAzIDEuODgzYy40MzQgMS4xNjUuNzE1IDIuMzIyLjcxNiAzLjM5em0tMS4yMy01LjA1M2E3LjQyIDcuNDIgMCAwIDAtMS41My0xLjMwNCA3LjAwNyA3LjAwNyAwIDAgMC0yLjg0NS0xLjA4MyAyLjMyNCAyLjMyNCAwIDAgMSAyLjE5NCAxLjc2Yy4xOTkuNTkxLjM3IDEuMjg0LjM3IDIuMDQ4YTcuNjEgNy42MSAwIDAgMS0uNDQxIDIuNjJBNi44MjcgNi44MjcgMCAwIDAgMTIuOTggOS40MWE1LjAwNCA1LjAwNCAwIDEgMC04LjU2NyA0LjE5QTYuODI4IDYuODI4IDAgMCAwIDIuMTEgMTEuOTJhNy42MDcgNy42MDcgMCAwIDEtLjQ0MS0yLjYxOWMwLS43NjMuMTcxLTEuNDU3LjM3LTIuMDQ3YTIuMzE4IDIuMzE4IDAgMCAxIDIuMTktMS43NjIgNy4wMiA3LjAyIDAgMCAwLTIuODQ1IDEuMDgzQTcuNDIgNy40MiAwIDAgMCAuMDQ0IDcuMDhhNS4zMTQgNS4zMTQgMCAwIDAgLjA1IDQuNzM2Yy0uMDU1IDEuMTY1LS4wNSAyLjI2LS4wNSAyLjM3OCAwIDEuNDM2LjY1MyAyLjU0NyAxLjgtMy41MTdhMTcuNTUxIDE3LjU1MSAwIDAgMCAzLjE3NSAxLjkzYy42MzIuMzA3IDEuNDM0LjYxIDIuMzYuNjFsLjQyLS4wMDVoLjA0di4wMDVsLjQyLjAwNWMuOTI3IDAgMS43MjktLjMwMyAyLjM2LS42MS45MDYtLjQ0IDIuMDc2LTEuMTI0IDMuMTc3LTEuOTNDMTQuOTc1IDE3LjA4MSAxNiAxNi44IDE2IDE1LjE5M2MwLS4xMTguMDA1LTEuMjEyLS4wNS0yLjM3OGE1LjMxMyA1LjMxMyAwIDAgMCAuMDUxLTQuNzI3eiIgZmlsbD0icmdiYSgwLDAsMCwxKSIvPjwvc3ZnPg==
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/js-md5@0.7.3/src/md5.min.js
// @connect      *
// ==/UserScript==

// 初始化函数
function init() {
    console.log('=== 验证码识别助手(精简版) v0.1.7 已启动 ===');
    console.log('调试模式已开启，所有日志将输出到控制台');
    
    // 清理过期缓存
    const lastCleanupTimeKey = 'lastCleanupTime';
    const now = Date.now();
    const lastCleanupTime = GM_getValue(lastCleanupTimeKey, 0);
    
    if (now - lastCleanupTime > config.autoCleanupInterval) {
        console.log('[验证码] 开始定期清理缓存...');
        captchaCache.cleanup();
    }
    
    // 测试服务器连接
    testServerConnection();
    
    // 初始化事件监听器
    document.addEventListener('DOMContentLoaded', onDOMReady);
    
    // 如果文档已经加载完成，直接调用
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log('[验证码] 文档已加载，立即启动');
        onDOMReady();
    }
    
    // 在文档可交互时启动定时检查
    window.addEventListener('load', function() {
        if (config.debug) logger.info('[验证码] 页面加载完成，开始验证码检查');
        
        // 强制立即检查一次
        setTimeout(() => {
            console.log('[验证码] 初始检查...');
            checkForCaptcha(true);
        }, 1000);
        
        if (config.autoMode) {
            // 设置定时检查
            console.log('[验证码] 设置定时检查，间隔:', config.checkInterval, 'ms');
            
            setInterval(() => {
                checkForCaptcha();
            }, config.checkInterval);
        }
        
        // 注册其他验证码类型的检测
        if (config.captchaTypes.slider && config.sliderEnabled) {
            // 初始滑块检查
            setTimeout(() => {
                checkForSliderCaptcha(true);
            }, config.initialSliderCheckDelay);
            
            // 定时检查滑块验证码
            if (config.forceSliderCheck) {
                console.log('[验证码] 设置滑块验证码定时检查');
                setInterval(() => {
                    checkForSliderCaptcha();
                }, 5000);  // 降低频率，减少资源占用
            }
        }
        
        if (config.captchaTypes.clickCaptcha) {
            // 初始点选验证码检查
            setTimeout(() => {
                checkForClickCaptcha(true);
            }, 2000);
        }
        
        console.log('[验证码] 开始观察页面变化');
        
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
            console.log('[验证码] 初始化UI');
            setTimeout(initUI, 1500);
        } else {
            console.log('[验证码] UI已禁用，跳过初始化');
        }
    });
}