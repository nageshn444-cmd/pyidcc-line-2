@echo off
TITLE PYIDCC Line 2 - Production Docker & Persistent Data Storage Setup
COLOR 0A
echo ===============================================================================
echo          PYIDCC LINE 2 CREW CONTROL - DOCKER DATA PERSISTENCE SETUP
echo ===============================================================================
echo.

echo [1/4] Checking Docker Windows Service (com.docker.service)...
powershell -Command "if ((Get-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Service com.docker.service -ErrorAction SilentlyContinue }"

echo [2/4] Ensuring Docker Desktop Application process is launched...
powershell -Command "if (-not (Get-Process -Name '*docker*' -ErrorAction SilentlyContinue)) { Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' }"

echo [3/4] Waiting for Docker Daemon Engine to become ready...
:WAIT_LOOP
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Docker engine booting up... Waiting 5 seconds...
    timeout /t 5 /nobreak >nul
    goto WAIT_LOOP
)

echo.
echo [4/4] Docker Engine Ready! Building containers and mounting persistent volumes...
docker compose up -d --build

echo.
echo ===============================================================================
echo                DOCKER CONTAINERS & DATA STORAGE ARE ACTIVE!
echo ===============================================================================
echo   - Web Application UI:        http://localhost:8080
echo   - Local Autocomplete Agent:  http://localhost:5050
echo.
echo   Persistent Volumes Mounted:
echo     * pyidcc_web_data    - Persists web app build & data storage
echo     * pyidcc_nginx_logs  - Persists web server logs
echo     * pyidcc_agent_data  - Persists local agent logs & state
echo ===============================================================================
pause
