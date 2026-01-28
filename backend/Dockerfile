FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .

# Use static ffmpeg build to save space (removes X11/GTK dependencies)
# However, for simplicity and stability in this iteration, we keep the apt version 
# but we can try to use a lighter base or specific flags if needed. 
# Actually, let's switch to proper static build pattern:
RUN apt-get update && apt-get install -y curl xz-utils tzdata && rm -rf /var/lib/apt/lists/*
RUN curl -O https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
    && tar -xf ffmpeg-release-amd64-static.tar.xz \
    && mv ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ \
    && mv ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ \
    && rm -rf ffmpeg-*-amd64-static*
RUN pip install --no-cache-dir -r requirements.txt

COPY frontend/package.json .
COPY backend/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]
