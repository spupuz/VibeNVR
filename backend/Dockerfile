FROM ubuntu:24.04

WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive

RUN sed -i 's/archive.ubuntu.com/it.archive.ubuntu.com/g' /etc/apt/sources.list.d/ubuntu.sources || true && \
    sed -i 's/security.ubuntu.com/it.archive.ubuntu.com/g' /etc/apt/sources.list.d/ubuntu.sources || true && \
    echo "force-unsafe-io" > /etc/dpkg/dpkg.cfg.d/force-unsafe-io && \
    apt-get update && apt-get install -y --no-install-recommends nala && \
    nala fetch --auto -y || true && \
    nala upgrade -y && nala install -y --no-install-recommends \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    python-is-python3 \
    curl \
    xz-utils \
    tzdata \
    ffmpeg \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/* && \
    rm -f /etc/dpkg/dpkg.cfg.d/force-unsafe-io

RUN python3 -m venv --system-site-packages /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt .

RUN pip install --no-cache-dir --upgrade pip wheel setuptools && \
    pip install --no-cache-dir -r requirements.txt

COPY frontend/package.json .
COPY backend/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]
