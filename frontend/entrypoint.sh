# Function to log with timestamp
log() {
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$ts - INFO - $1"
}

# Wait for Backend to be technically reachable (TCP check)
# We assume backend is on port 5000 as per nginx conf
# Wait for Backend
log "Waiting for backend..."
while ! nc -z backend 5000; do
  sleep 1
done

# Wait for Engine (required for nginx upstream resolution)
log "Waiting for engine..."
while ! nc -z engine 8000; do
  sleep 1
done

log "Backend reachable! Starting Nginx..."
exec nginx -g "daemon off;"
