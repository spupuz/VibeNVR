# Use Debian Bookworm Slim for access to system python3-opencv with VAAPI support
FROM debian:bookworm-slim

# Enable contrib/non-free for drivers (Intel non-free, Nvidia, etc)
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list

# Install system dependencies including Python and OpenCV
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-opencv \
    python-is-python3 \
    ffmpeg \
    mesa-va-drivers \
    intel-media-va-driver-non-free \
    i965-va-driver-shaders \
    libglib2.0-0 \
    curl \
    ca-certificates \
    tzdata \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
# We use --break-system-packages because we are in a container and want to use the system python
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages --upgrade pip wheel && \
    pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Suppress annoying FFmpeg/OpenCV logs
ENV OPENCV_LOG_LEVEL=ERROR
ENV OPENCV_FFMPEG_DEBUG=0
# Enforce TCP for RTSP (more stable)
ENV OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"
# Force Python 3 unbuffered output
ENV PYTHONUNBUFFERED=1

# Copy source code
COPY . .

# Expose API port
EXPOSE 8000

CMD ["python3", "main.py"]
