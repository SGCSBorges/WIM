#!/bin/bash

# WIM Deployment Script
set -e

echo "🚀 Starting WIM deployment..."

# Build and start services
echo "📦 Building containers..."
docker-compose build --no-cache

echo "🔄 Starting services..."
docker-compose up -d

# Wait for database
echo "⏳ Waiting for database..."
sleep 10

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose exec api npm run prisma:migrate

# Seed database (optional)
echo "🌱 Seeding database..."
docker-compose exec api npm run prisma:seed

echo "✅ Deployment complete!"
echo "📱 Web App: http://localhost:5173"
echo "🔧 API: http://localhost:3000"
echo "📊 Health Check: http://localhost:3000/health"

# Show container status
docker-compose ps