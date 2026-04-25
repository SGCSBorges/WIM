#!/usr/bin/env bash
# deploy.sh — build and start all services with Docker Compose
set -euo pipefail

echo "[deploy] Building images..."
docker compose build --no-cache

echo "[deploy] Running database migrations..."
docker compose run --rm api npx prisma migrate deploy

echo "[deploy] Starting services..."
docker compose up -d

echo "[deploy] Done. API: http://localhost:3000  Web: http://localhost"
