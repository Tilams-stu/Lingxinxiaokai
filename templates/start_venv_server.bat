@echo off
setlocal

REM 创建并激活虚拟环境
if not exist venv (
  python -m venv venv
)
call venv\Scripts\activate

REM 安装依赖
pip install -r requirements.txt

REM 加载 .env（由 server.py 自动读取，如存在）并启动代理服务
python server.py

endlocal