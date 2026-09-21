#!/bin/bash
set -e
cd /opt/ai-router-manager

echo "📥 Получение изменений..."
git pull origin main

echo "📦 Установка зависимостей фронтенда..."
npm install

echo "🔨 Сборка фронтенда..."
npm run build

echo "📦 Установка зависимостей бэкенда..."
cd server
npm install
cd ..

echo "🔄 Перезапуск сервиса..."
sudo systemctl restart ai-router-manager

echo "✅ Готово!"
sudo systemctl status ai-router-manager --no-pager
