FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .

# Use static ffmpeg build to save space (removes X11/GTK dependencies)
# However, for simplicity and stability in this iteration, we keep the apt version 
# but we can try to use a lighter base or specific flags if needed. 
# Actually, let's switch to proper static build pattern:
# Switch to apt-get for ffmpeg to avoid download failures from third-party sites
RUN apt-get update && apt-get upgrade -y && apt-get install -y curl xz-utils tzdata ffmpeg libmagic1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --upgrade pip wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY frontend/package.json .
COPY backend/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]
