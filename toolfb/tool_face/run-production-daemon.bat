@echo off
REM ============================================================
REM ToolFace Production Daemon Auto-Start (Persistent 24/7)
REM ============================================================
cd /d "C:\Users\quang\OneDrive\Desktop\Code\toolfb\toolfb\tool_face"

echo [%date% %time%] Khoi dong ToolFace Daemon Services... >> server\logs\daemon-startup.log

REM 1. Khoi dong Backend API (Port 5000)
start "ToolFace_Backend" /min cmd /c "cd server && node src/app.js >> logs/backend.log 2>&1"

REM 2. Khoi dong Standalone Poller Scheduler
start "ToolFace_Poller" /min cmd /c "cd server && node src/utils/StandaloneScheduler.js >> logs/poller.log 2>&1"

REM 3. Khoi dong Scheduler Watchdog
start "ToolFace_Watchdog" /min cmd /c "cd server && node src/utils/SchedulerWatchdog.js >> logs/watchdog.log 2>&1"

REM 4. Khoi dong Frontend Next.js (Port 3000)
start "ToolFace_Frontend" /min cmd /c "cd client && npm run dev >> ../server/logs/frontend.log 2>&1"

echo [%date% %time%] Da khoi dong toan bo 4 tien trinh ngam thanh cong. >> server\logs\daemon-startup.log

