@echo off
title Boutyflameet Launcher
color 0A
echo.
echo  ============================================
echo   BOUTYFLAMEET - Starting App...
echo  ============================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed!
    echo  Download from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  [1/4] Node.js found: OK
echo.

REM Install backend deps if needed
if not exist "backend\node_modules" (
    echo  [2/4] Installing backend packages (first time only)...
    cd backend
    call npm install
    cd ..
) else (
    echo  [2/4] Backend packages: already installed
)

REM Install frontend deps if needed
if not exist "frontend\node_modules" (
    echo  [3/4] Installing frontend packages (first time only)...
    cd frontend
    call npm install
    cd ..
) else (
    echo  [3/4] Frontend packages: already installed
)

echo.
echo  [4/4] Starting both servers...
echo.
echo  Backend  --^>  http://localhost:3001
echo  Frontend --^>  http://localhost:5173
echo.
echo  Your browser will open automatically!
echo  Press Ctrl+C in either window to stop.
echo.

REM Start backend in new window
start "Boutyflameet Backend" cmd /k "cd backend && node server.js"

REM Wait 2 seconds for backend to start
timeout /t 2 /nobreak >nul

REM Start frontend (opens browser automatically)
cd frontend
call npm run dev
