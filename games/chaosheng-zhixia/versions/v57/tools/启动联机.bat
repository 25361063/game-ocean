@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto check
where py >nul 2>nul
if errorlevel 1 goto python
py -3 -m venv .venv
goto created
:python
python -m venv .venv
:created
if not exist ".venv\Scripts\python.exe" goto failed
:check
".venv\Scripts\python.exe" -c "import aiohttp; assert aiohttp.__version__ == '3.13.3'" >nul 2>nul
if not errorlevel 1 goto run
".venv\Scripts\python.exe" -m pip install --index-url https://pypi.org/simple -r requirements.txt
if errorlevel 1 goto failed
:run
".venv\Scripts\python.exe" "联机服务器.py" %*
goto end
:failed
echo 启动或安装失败。需要 Python 3.10+，首次安装需要联网。请保留上方错误信息。
:end
pause
