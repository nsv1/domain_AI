#!/bin/bash
set -e
cd /opt/ai-router-manager

# Добавляем локальные бинарники в PATH
export PATH="$PWD/node_modules/.bin:$PATH"

echo "📥 Получение изменений..."
git pull origin main

echo "📦 Установка зависимостей фронтенда..."
if [ ! -d "node_modules" ]; then
  npm install
else
  npm ci
fi

echo "🔨 Сборка фронтенда..."
npm run build

echo "📦 Установка зависимостей бэкенда..."
cd server
if [ ! -d "node_modules" ]; then
  npm install
else
  npm ci
fi
cd ..

echo "📋 Обновление скрипта маршрутизации..."
sudo cp scripts/update-ai-router.sh /usr/local/bin/update-ai-router.sh
sudo chmod +x /usr/local/bin/update-ai-router.sh

echo "📋 Обновление скрипта диагностики..."
sudo cp scripts/check-vm-awg.sh /usr/local/bin/check-vm-awg.sh
sudo chmod +x /usr/local/bin/check-vm-awg.sh

echo "🔄 Перезапуск сервиса..."
sudo systemctl restart ai-router-manager

echo "✅ Готово!"
sudo systemctl status ai-router-manager --no-pager
