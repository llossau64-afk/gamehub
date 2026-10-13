# VELQIN AI — web app + API in one container (AI runtimes run in their own containers).
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 1000 velqin
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY ai/ ai/
COPY --from=web /web/out frontend/out
ENV VELQIN_DATA_DIR=/data VELQIN_HOST=0.0.0.0 VELQIN_PORT=8080
RUN mkdir -p /data && chown velqin:velqin /data
USER velqin
WORKDIR /app/backend
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
CMD ["python", "run.py"]
