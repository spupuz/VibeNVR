# Use Debian Bullseye Slim (Python 3.9) for full compatibility with Coral EdgeTPU
FROM debian:bullseye-slim

# Enable contrib/non-free for drivers (Intel non-free, Nvidia, etc)
RUN echo "deb http://deb.debian.org/debian bullseye main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian-security bullseye-security main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bullseye-updates main contrib non-free" >> /etc/apt/sources.list

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
    gnupg

RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/coral-edgetpu.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/coral-edgetpu.gpg] https://packages.cloud.google.com/apt coral-edgetpu-stable main" | tee /etc/apt/sources.list.d/coral-edgetpu.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends libedgetpu1-std && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip wheel && \
    pip3 install --no-cache-dir "numpy<2.0.0" && \
    pip3 install --no-cache-dir --extra-index-url https://google-coral.github.io/py-repo/ -r requirements.txt

# Suppress annoying FFmpeg/OpenCV logs
ENV OPENCV_LOG_LEVEL=ERROR
ENV OPENCV_FFMPEG_DEBUG=0
# Enforce TCP for RTSP (more stable)
ENV OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"
# Force Python 3 unbuffered output
ENV PYTHONUNBUFFERED=1

# Copy source code
COPY . .

# AI Models are now partially included in the repo. 
# This script only downloads missing fallback models.
RUN python3 download_models.py && rm download_models.py

# Expose API port
EXPOSE 8000

CMD ["python3", "main.py"]
