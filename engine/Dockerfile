FROM python:3.9-slim

# Install system dependencies (FFmpeg for recording, libgl for OpenCV)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Suppress annoying FFmpeg/OpenCV logs
ENV OPENCV_LOG_LEVEL=ERROR
ENV OPENCV_FFMPEG_DEBUG=0
# Enforce TCP for RTSP (more stable)
ENV OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"

# Copy source code
COPY . .

# Expose API port
EXPOSE 8000
# Expose Stream ports (range can be defined, or we can multiplex on 8000)
# For simplicity, we'll try to serve streams via HTTP on the API port first

CMD ["python", "main.py"]
