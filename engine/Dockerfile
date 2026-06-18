# Use Debian Bullseye Slim (Python 3.9) for full compatibility with Coral EdgeTPU
FROM debian:bullseye-slim

# Enable contrib/non-free for drivers (Intel non-free, Nvidia, etc)
RUN echo "deb http://deb.debian.org/debian bullseye main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian-security bullseye-security main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bullseye-updates main contrib non-free" >> /etc/apt/sources.list

# Install system dependencies including Python and OpenCV
# hadolint ignore=DL3008
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    python3 \
    python3-dev \
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
    gnupg \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libavfilter-dev \
    pkg-config \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

# hadolint ignore=DL4006,DL3008
RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/coral-edgetpu.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/coral-edgetpu.gpg] https://packages.cloud.google.com/apt coral-edgetpu-stable main" | tee /etc/apt/sources.list.d/coral-edgetpu.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends libedgetpu1-std && \
    rm -rf /var/lib/apt/lists/*

# go2rtc stream gateway (single static binary, runs alongside the engine).
# Listens on 1984 (API) / 8554 (RTSP) inside the container; nothing is exposed
# on the host. Used only when the "go2rtc_enabled" setting is on.
ARG GO2RTC_VERSION=1.9.14
RUN arch="$(dpkg --print-architecture)" && \
    case "$arch" in \
      amd64|arm64|i386) go2rtc_arch="$arch" ;; \
      armhf) go2rtc_arch="arm" ;; \
      *) echo "Unsupported architecture for go2rtc: $arch" && exit 1 ;; \
    esac && \
    curl -fsSL -o /usr/local/bin/go2rtc \
      "https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/go2rtc_linux_${go2rtc_arch}" && \
    chmod +x /usr/local/bin/go2rtc

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
ENV PYAV_BUILD_USE_SYSTEM_FFMPEG=1
# hadolint ignore=DL3013
RUN pip3 install --no-cache-dir --upgrade pip wheel && \
    pip3 install --no-cache-dir "numpy<2.0.0" "Cython<3" && \
    pip3 install --no-cache-dir --no-binary av --no-build-isolation "av<10.0.0" && \
    pip3 install --no-cache-dir --extra-index-url https://google-coral.github.io/py-repo/ -r requirements.txt

# Suppress annoying FFmpeg/OpenCV logs
ENV OPENCV_LOG_LEVEL=ERROR
ENV OPENCV_FFMPEG_DEBUG=0
# Enforce TCP for RTSP (more stable)
ENV OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"
# Force Python 3 unbuffered output
ENV PYTHONUNBUFFERED=1
# Suppress TFLite / TensorFlow C++ internal logging (0=DEBUG,1=INFO,2=WARN,3=FATAL)
ENV TF_CPP_MIN_LOG_LEVEL=3
ENV TF_CPP_MIN_VLOG_LEVEL=0
ENV GLOG_minloglevel=3
ENV TFLITE_EXTERNAL_DELEGATE_VERBOSE=0

# Copy source code
COPY . .

# AI Models are now partially included in the repo. 
# This script only downloads missing fallback models.
RUN python3 download_models.py && rm download_models.py

# Expose API port
EXPOSE 8000

CMD ["python3", "main.py"]
