#!/bin/bash
set -e

# Определяем директорию скрипта (абсолютный путь)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Добавляем локальные бинарники в PATH
export PATH="$SCRIPT_DIR/node_modules/.bin:$PATH"

echo "📥 Получение изменений..."
git pull origin main

echo "📦 Установка зависимостей фронтенда..."
npm install --include=dev

# Проверяем, что vite установлен
if [ ! -f "$SCRIPT_DIR/node_modules/.bin/vite" ]; then
  echo "❌ Ошибка: vite не установлен в node_modules/.bin/"
  echo "Попытка переустановки..."
  rm -rf node_modules package-lock.json
  npm install --include=dev
fi

echo "🔨 Сборка фронтенда..."
"$SCRIPT_DIR/node_modules/.bin/vite" build

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
