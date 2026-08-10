@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%\templates" >nul 2>&1
if errorlevel 1 (
  echo Cannot enter the templates directory.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Missing templates\.venv. Run: python -m venv templates\.venv
  popd
  exit /b 1
)

if not exist ".env" (
  echo Missing templates\.env. Copy templates\.env.example and set real keys first.
  popd
  exit /b 1
)

".venv\Scripts\python.exe" server.py
set "APP_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %APP_EXIT_CODE%
