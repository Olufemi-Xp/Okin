FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV DATA_DIR=/data

WORKDIR /app

# Install system dependencies (curl for healthchecks, ffmpeg for audio support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create data directory for SQLite and ChromaDB persistence
RUN mkdir -p /data

# Copy application source code
COPY . .

# Expose default port
EXPOSE 8000

# Run FastAPI with uvicorn respecting dynamic PORT from Railway
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
