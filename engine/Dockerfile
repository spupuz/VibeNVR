# Revert to Python 3.9 Slim Bookworm for stability & HW accel support
FROM python:3.9-slim-bookworm



# Enable contrib/non-free for drivers (Intel non-free, Nvidia, etc)
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list

# Install system dependencies
# We use --no-install-recommends to keep image small
# Drivers for Intel/AMD HW acceleration
RUN apt-get update && apt-get install -y --no-install-recommends \
    mesa-va-drivers \
    intel-media-va-driver-non-free \
    libglib2.0-0 \
    libxcb1 \
    libx11-6 \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Download and Install Jellyfin FFmpeg (Optimized for HW Accel + Small Size)
# Version: 7.1.3-1 (Bookworm AMD64) from GitHub Releases
RUN curl -L -o jellyfin-ffmpeg.deb https://github.com/jellyfin/jellyfin-ffmpeg/releases/download/v7.1.3-1/jellyfin-ffmpeg7_7.1.3-1-bookworm_amd64.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends ./jellyfin-ffmpeg.deb \
    && rm jellyfin-ffmpeg.deb \
    && rm -rf /var/lib/apt/lists/*

# Symlink Jellyfin FFmpeg to standard paths
RUN ln -s /usr/lib/jellyfin-ffmpeg/ffmpeg /usr/local/bin/ffmpeg && \
    ln -s /usr/lib/jellyfin-ffmpeg/ffprobe /usr/local/bin/ffprobe

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
