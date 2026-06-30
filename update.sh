#!/bin/bash
cd ~/leanboard
git pull origin claude/great-tesla-1i04uq
npm run build
pkill -f "next start" 2>/dev/null || true
sleep 1
nohup npm start > ~/leanboard/app.log 2>&1 &
echo "LeanBoard corriendo en puerto 4000"
