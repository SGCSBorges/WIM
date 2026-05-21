# deploy.ps1 — build and start all services with Docker Compose (Windows)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[deploy] Building images..."
docker compose build --no-cache

Write-Host "[deploy] Running database migrations..."
docker compose run --rm api npx prisma migrate deploy

Write-Host "[deploy] Starting services..."
docker compose up -d

Write-Host "[deploy] Done. API: http://localhost:3000  Web: http://localhost"
