@echo off 
title OCR Server 
echo Starting OCR Server... 
cd /d "D:\Subline\Project\captcha_" 
call "D:\Subline\Project\captcha_\venv\Scripts\activate.bat" 
python "D:\Subline\Project\captcha_\simple_ocr_server.py" 
pause 
