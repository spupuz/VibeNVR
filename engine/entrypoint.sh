#!/bin/bash
# VibeEngine Entrypoint
# This script ensures signal propagation (SIGTERM) to the Python process

# 1. Setup logs directory and file
LOG_FILE="/var/lib/vibe/recordings/logs/engine.log"
mkdir -p "$(dirname "$LOG_FILE")"
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

# 2. Start the engine in the background and pipe to tee
# We use a trap to ensure SIGTERM/SIGINT are passed to the python process
python3 -u main.py 2>&1 | grep --line-buffered -v 'SEI type 764' | tee -a /var/lib/vibe/recordings/logs/engine.log &
MAIN_PID=$!

# Trap signals and forward them to the process
trap "echo 'Terminating VibeEngine...'; kill -TERM $MAIN_PID" INT TERM

# Wait for the process to exit
wait $MAIN_PID
