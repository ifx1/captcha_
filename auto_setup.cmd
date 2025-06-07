@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

title OCR Service Setup

echo =======================================
echo    Captcha Recognition System Setup    
echo =======================================
echo.

if "%1"=="stop" (
    echo Stopping service...
    
    taskkill /F /FI "WINDOWTITLE eq OCR Service" >nul 2>&1
    
    echo Service stopped.
    pause
    exit /b 0
)

echo Checking Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found. Please install Python first.
    pause
    exit /b 1
)

set VENV_DIR=venv
if not exist %VENV_DIR% (
    echo Creating virtual environment...
    python -m venv %VENV_DIR% >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        python -m pip install virtualenv >nul 2>&1
        python -m virtualenv %VENV_DIR% >nul 2>&1
        if %ERRORLEVEL% NEQ 0 (
            set USE_VENV=0
        ) else (
            set USE_VENV=1
        )
    ) else (
        set USE_VENV=1
    )
) else (
    set USE_VENV=1
)

if not exist logs mkdir logs
set LOG_FILE=logs\ocr_server.log

tasklist /FI "WINDOWTITLE eq OCR Service" | find "cmd.exe" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Service is already running. To restart, run: %0 stop
    pause
    exit /b 0
)

if %USE_VENV%==1 (
    call %VENV_DIR%\Scripts\activate.bat >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        set USE_VENV=0
    ) else (
        python -m pip install --upgrade pip >nul 2>&1
        echo Installing dependencies...
        pip uninstall -y opencv-python >nul 2>&1
        pip install opencv-python-headless ddddocr fastapi uvicorn numpy Pillow >nul 2>&1
    )
) else (
    python -m pip install --upgrade pip >nul 2>&1
    echo Installing dependencies...
    pip uninstall -y opencv-python >nul 2>&1
    pip install opencv-python-headless ddddocr fastapi uvicorn numpy Pillow >nul 2>&1
)

if not exist simple_ocr_server.py (
    echo ERROR: Server script file not found!
    pause
    exit /b 1
)

cd /d "%~dp0"

echo Starting service...
if %USE_VENV%==1 (
    echo @echo off > start_ocr.cmd
    echo call "%~dp0%VENV_DIR%\Scripts\activate.bat" >> start_ocr.cmd
    echo python "%~dp0simple_ocr_server.py" >> start_ocr.cmd
    start "OCR Service" /min cmd /c start_ocr.cmd > "%LOG_FILE%" 2>&1
) else (
    start "OCR Service" /min cmd /c python "%~dp0simple_ocr_server.py" > "%LOG_FILE%" 2>&1
)

timeout /t 3 > nul

tasklist /FI "WINDOWTITLE eq OCR Service" | find "cmd.exe" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Service started successfully!
) else (
    echo WARNING: Service may not have started. Check log file.
)

set IP=127.0.0.1
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    set IP=!IP:~1!
    goto :got_ip
)
:got_ip

echo.
echo Usage:
echo Check logs: type %LOG_FILE%
echo Stop service: %0 stop
echo Server address: http://%IP%:9898
echo.
echo Set server address in your Tampermonkey script to:
echo http://%IP%:9898/ocr

pause 