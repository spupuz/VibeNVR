#!/bin/sh

# Webhook wrapper script for Motion
# Usage: ./webhook.sh <camera_id> <type> <file_path> <timestamp>

CAMERA_ID=$1
TYPE=$2
FILE_PATH=$3
TIMESTAMP=$4

echo "[WEBHOOK SCRIPT] Camera $CAMERA_ID, Type $TYPE, File $FILE_PATH, Time $TIMESTAMP" >> /tmp/webhook.log

curl --max-time 10 -s -X POST http://vibenvr-backend:5000/events/webhook \
  -H "Content-Type: application/json" \
  -d "{\"camera_id\": $CAMERA_ID, \"type\": \"$TYPE\", \"file_path\": \"$FILE_PATH\", \"timestamp\": \"$TIMESTAMP\"}" >> /tmp/webhook.log 2>&1

echo "[WEBHOOK SCRIPT] Done" >> /tmp/webhook.log
