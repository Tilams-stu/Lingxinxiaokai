@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "ENV_FILE=%PROJECT_ROOT%\templates\.env"
if not exist "%ENV_FILE%" (
  echo Missing templates\.env. Copy templates\.env.example and set DEEPSEEK_API_KEY first.
  exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  if not "%%A"=="" set "%%A=%%B"
)

pushd "%PROJECT_ROOT%\agent-service" >nul 2>&1
if errorlevel 1 (
  echo Cannot enter agent-service.
  exit /b 1
)
if not exist "node_modules" (
  echo Missing agent-service\node_modules. Run: npm.cmd ci --prefix agent-service
  popd
  exit /b 1
)

npm.cmd start
set "APP_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %APP_EXIT_CODE%
