#!/bin/bash
set -e

# Определяем директорию скрипта (абсолютный путь)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Добавляем локальные бинарники в PATH
export PATH="$SCRIPT_DIR/node_modules/.bin:$PATH"

# Фикс прав доступа: при запуске из веб-интерфейса сервис работает от root,
# а ручной запуск — от обычного пользователя. Приводим dist и node_modules
# к владельцу текущего пользователя, чтобы vite/npm не падали с EACCES.
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_UID="$(id -u)"
if [ -d "dist" ] && [ "$(stat -c '%u' dist)" != "$RUN_UID" ]; then
  echo "🔧 Исправление прав на dist/ для пользователя $RUN_USER..."
  sudo chown -R "$RUN_USER" dist || true
fi
for d in node_modules server/node_modules; do
  if [ -d "$d" ] && [ "$(stat -c '%u' "$d")" != "$RUN_UID" ]; then
    echo "🔧 Исправление прав на $d для пользователя $RUN_USER..."
    sudo chown -R "$RUN_USER" "$d" || true
  fi
done

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

echo "✅ Готово!"

# Перезапуск сервиса выполняется ПОСЛЕДНИМ шагом: до этой строки HTTP-ответ
# /api/update уже отправлен, а лог обновления дописан в файл.
LOG_FILE="${UPDATE_LOG_FILE:-/var/log/ai-router-update.log}"
if [ -w "$LOG_FILE" ] || touch "$LOG_FILE" 2>/dev/null; then
  echo "===== Обновление завершено: код 0, $(date -u +%Y-%m-%dT%H:%M:%SZ) =====" >> "$LOG_FILE"
fi
echo "🔄 Перезапуск сервиса..."
sudo systemctl restart ai-router-manager
