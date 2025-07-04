# WIM Deployment Script for Windows
Write-Host "🚀 Starting WIM deployment..." -ForegroundColor Green

# Build and start services
Write-Host "📦 Building containers..." -ForegroundColor Yellow
docker-compose build --no-cache

Write-Host "🔄 Starting services..." -ForegroundColor Yellow
docker-compose up -d

# Wait for database
Write-Host "⏳ Waiting for database..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Run database migrations
Write-Host "🗄️ Running database migrations..." -ForegroundColor Yellow
docker-compose exec api npm run prisma:migrate

# Seed database (optional)
Write-Host "🌱 Seeding database..." -ForegroundColor Yellow
docker-compose exec api npm run prisma:seed

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "📱 Web App: http://localhost:5173" -ForegroundColor Cyan
Write-Host "🔧 API: http://localhost:3000" -ForegroundColor Cyan
Write-Host "📊 Health Check: http://localhost:3000/health" -ForegroundColor Cyan

# Show container status
docker-compose ps