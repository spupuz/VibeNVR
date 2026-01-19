#!/bin/sh
set -e

# Wait for Backend to be technically reachable (TCP check)
# We assume backend is on port 5000 as per nginx conf
# Wait for Backend
echo "Waiting for backend..."
while ! nc -z backend 5000; do
  sleep 1
done

# Wait for Engine (required for nginx upstream resolution)
echo "Waiting for engine..."
while ! nc -z engine 8000; do
  sleep 1
done

echo "Backend reachable! Starting Nginx..."
exec nginx -g "daemon off;"
