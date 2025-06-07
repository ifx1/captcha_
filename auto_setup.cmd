@echo off
title SETUP

echo ============================
echo       SETUP SCRIPT
echo ============================
echo.

REM Check if this is a start command
if "%1"=="start" (
    goto :start_server
)

REM Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found.
    pause
    exit /b 1
)

python -c "print('Python version:')" 
python --version
echo.
pause

REM Setup virtual environment
set VENV=venv
if exist %VENV% (
    echo Found existing venv, removing it to create a fresh one...
    rmdir /s /q %VENV%
)

echo Creating new virtual environment...
python -m venv %VENV%
if %ERRORLEVEL% NEQ 0 (
    echo Failed to create venv. Trying virtualenv...
    pip install virtualenv -i https://pypi.tuna.tsinghua.edu.cn/simple
    python -m virtualenv %VENV%
    
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

echo Virtual environment created.
echo.
pause

REM Activate environment
if not exist "%VENV%\Scripts\activate.bat" (
    echo ERROR: activate.bat not found
    pause
    exit /b 1
)

call "%VENV%\Scripts\activate.bat"
echo Activated virtual environment.
echo.

REM Fix broken pip in the virtual environment
echo Fixing pip in virtual environment...
python -m ensurepip --default-pip
if %ERRORLEVEL% NEQ 0 (
    echo Downloading get-pip.py...
    curl -o get-pip.py https://bootstrap.pypa.io/get-pip.py
    python get-pip.py
    
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install pip
        pause
        exit /b 1
    )
    
    if exist get-pip.py del get-pip.py
)

echo Testing pip installation...
python -m pip --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pip is still not working in the virtual environment
    pause
    exit /b 1
)

echo Pip is working correctly!
echo.
pause

REM Install dependencies
echo Installing packages from China mirror...

REM Upgrade pip first using China mirror
python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple

REM Install all dependencies using China mirror
python -m pip install ddddocr fastapi uvicorn numpy Pillow opencv-python-headless -i https://pypi.tuna.tsinghua.edu.cn/simple

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ============================
echo       SETUP COMPLETE
echo ============================
echo.

REM Check if server script exists
if not exist "simple_ocr_server.py" (
    echo ERROR: simple_ocr_server.py not found.
    echo Cannot start the server.
    pause
    exit /b 1
)

echo Starting server now...
echo.

REM Create a startup script
echo @echo off > start_server.cmd
echo title OCR Server >> start_server.cmd
echo echo Starting OCR Server... >> start_server.cmd
echo cd /d "%CD%" >> start_server.cmd
echo call "%CD%\%VENV%\Scripts\activate.bat" >> start_server.cmd
echo python "%CD%\simple_ocr_server.py" >> start_server.cmd
echo pause >> start_server.cmd

REM Start the server in a new window
start start_server.cmd

echo.
echo Server has been started in a new window.
echo Window title: "OCR Server"
echo.
echo You can also manually start the server with:
echo %~f0 start
echo.

pause
exit /b 0

:start_server
echo Starting OCR server...
cd /d "%~dp0"
if exist "%~dp0%VENV%\Scripts\activate.bat" (
    call "%~dp0%VENV%\Scripts\activate.bat"
    python simple_ocr_server.py
) else (
    echo ERROR: Virtual environment not found.
    pause
) 