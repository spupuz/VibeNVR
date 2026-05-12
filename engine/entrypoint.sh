#!/bin/bash
# VibeEngine Entrypoint
# This script ensures signal propagation (SIGTERM) to the Python process

# Function to log with timestamp
log() {
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$ts - INFO - $1"
}

# 1. Setup logs directory and file
LOG_FILE="/var/lib/vibe/recordings/logs/engine.log"
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# 1b. Basic Log Rotation (Truncate if > 10MB)
MAX_SIZE=10485760 # 10MB
if [ -f "$LOG_FILE" ]; then
    FILE_SIZE=$(stat -c%s "$LOG_FILE")
    if [ "$FILE_SIZE" -gt "$MAX_SIZE" ]; then
        log "Log file $LOG_FILE is too large ($FILE_SIZE bytes). Truncating..."
        tail -c "$MAX_SIZE" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
fi

# 1c. Ensure AI Models are downloaded (useful if volume is fresh)
log "Checking AI models..."
if [ -f "download_models.py" ]; then
    python3 download_models.py
else
    log "Warning: download_models.py not found in current directory."
fi

# 2. Start the engine and pipe through a sanitizing filter.
# We use a named pipe (FIFO) to allow capturing the Python PID for signal trapping
# while still filtering the output before it hits stdout/tee.
FIFO="/tmp/engine_logs_fifo"
rm -f "$FIFO"
mkfifo "$FIFO"

# Start the log consumer in the background
# It reads from the FIFO, filters binary junk, and writes to tee
cat "$FIFO" | grep --line-buffered -v 'SEI type 764' | python3 -u -c "
import sys
for line in sys.stdin:
    stripped = line.strip()
    if not stripped:
        continue
    # Only allow lines that are mostly alphanumeric or common punctuation
    # This filters out binary junk (long runs of backslashes/slashes)
    allowed_chars = sum(1 for c in stripped if c.isalnum() or c in (' ', '-', '_', '.', ':', '[', ']', '{', '}', '\"', '\'', ','))
    if len(stripped) > 20:
        if (allowed_chars / len(stripped)) >= 0.15:
            sys.stdout.write(line)
            sys.stdout.flush()
    elif len(stripped) > 0:
        sys.stdout.write(line)
        sys.stdout.flush()
" | tee -a "$LOG_FILE" &
LOG_CONSUMER_PID=$!

# Start the main process, redirecting its output to the FIFO
python3 -u main.py > "$FIFO" 2>&1 &
MAIN_PID=$!

# Trap signals and forward them to the main Python process
trap "log 'Terminating VibeEngine...'; kill -TERM $MAIN_PID 2>/dev/null; rm -f $FIFO" INT TERM

# Wait for the main process to exit
wait $MAIN_PID

# Cleanup
kill $LOG_CONSUMER_PID 2>/dev/null
rm -f "$FIFO"


