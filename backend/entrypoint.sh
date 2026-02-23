#!/bin/bash
# VibeBackend Entrypoint
# This script ensures signal propagation (SIGTERM) to the Uvicorn process

# 1. Setup logs directory and file
LOG_FILE="/data/logs/backend.log"
mkdir -p "$(dirname "$LOG_FILE")"
chmod 777 "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# 1b. Basic Log Rotation (Truncate if > 10MB)
MAX_SIZE=10485760 # 10MB
if [ -f "$LOG_FILE" ]; then
    FILE_SIZE=$(stat -c%s "$LOG_FILE")
    if [ "$FILE_SIZE" -gt "$MAX_SIZE" ]; then
        echo "Log file $LOG_FILE is too large ($FILE_SIZE bytes). Truncating..."
        tail -c "$MAX_SIZE" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
fi

# 2. Start the backend in the background and pipe to tee
# We use a trap to ensure SIGTERM/SIGINT are passed to the uvicorn process
uvicorn main:app --host 0.0.0.0 --port 5000 2>&1 | tee -a /data/logs/backend.log &
MAIN_PID=$!

# Trap signals and forward them to the process
trap "echo 'Terminating VibeBackend...'; kill -TERM $MAIN_PID" INT TERM

# Wait for the process to exit
wait $MAIN_PID
