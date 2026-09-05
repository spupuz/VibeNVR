# Use Ubuntu 24.04 LTS as the base for Python 3.12 and modern hardware support
FROM ubuntu:24.04

# Prevent interactive prompts during apt
ENV DEBIAN_FRONTEND=noninteractive

# Install basic tools and add python 3.9 PPA (deadsnakes)
RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common curl wget gnupg && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    python3.9 \
    python3.9-dev \
    python3.9-distutils \
    python3.9-venv \
    ffmpeg \
    libglib2.0-0 \
    ca-certificates \
    tzdata \
    procps \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libavfilter-dev \
    pkg-config \
    build-essential && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/coral-edgetpu.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/coral-edgetpu.gpg] https://packages.cloud.google.com/apt coral-edgetpu-stable main" | tee /etc/apt/sources.list.d/coral-edgetpu.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends libedgetpu1-std && \
    arch="$(dpkg --print-architecture)" && \
    if [ "$arch" = "amd64" ] || [ "$arch" = "i386" ]; then \
        apt-get install -y --no-install-recommends mesa-va-drivers intel-media-va-driver-non-free i965-va-driver-shaders; \
    fi && \
    rm -rf /var/lib/apt/lists/*

# go2rtc stream gateway
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

# Download Community libedgetpu and pycoral (Example using fermentrack/pycoral or similar community builds)
# We will create a virtual environment to avoid PEP 668 EXTERNALLY-MANAGED errors in Ubuntu 24.04
RUN python3.9 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .

# Install standard dependencies
# hadolint ignore=DL3013
RUN pip install --no-cache-dir --upgrade pip wheel setuptools && \
    pip install --no-cache-dir "numpy<2.0.0" "Cython>=3" "opencv-python-headless" && \
    pip install --no-cache-dir -r requirements.txt

RUN pip install --no-cache-dir --extra-index-url https://google-coral.github.io/py-repo/ pycoral~=2.0

# Suppress annoying FFmpeg/OpenCV logs
ENV OPENCV_LOG_LEVEL=ERROR
ENV OPENCV_FFMPEG_DEBUG=0
ENV OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"
ENV PYTHONUNBUFFERED=1
ENV TF_CPP_MIN_LOG_LEVEL=3
ENV TF_CPP_MIN_VLOG_LEVEL=0
ENV GLOG_minloglevel=3
ENV TFLITE_EXTERNAL_DELEGATE_VERBOSE=0

# Copy source code
COPY . .

RUN python3 download_models.py && rm download_models.py

EXPOSE 8000

CMD ["python3", "main.py"]
