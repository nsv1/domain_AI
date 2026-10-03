#!/bin/bash
set -e

# Определяем директорию скрипта (абсолютный путь)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Добавляем локальные бинарники в PATH
export PATH="$SCRIPT_DIR/node_modules/.bin:$PATH"

# Определяем реального пользователя (того, кто вызвал sudo), и root-команды.
# Сервис ai-router-manager работает под root и при обновлении из веб-интерфейса
# создаёт файлы dist/ и node_modules/ с владельцем root. Если затем запустить
# ./update.sh от обычного пользователя, vite/npm не смогут удалить эти файлы
# (EACCES). Решение: все операции с файлами проекта выполняет один и тот же
# пользователь (реальный вызывающий), а привилегированные шаги — через sudo.
# ВАЖНО: если скрипт запущен напрямую от root (id -u = 0, без sudo), SUDO_USER
# может содержать имя администратора, который поднял рут-шелл, — это НЕ владелец
# файлов сборки. В этом случае целевой пользователь — root.
if [ "$(id -u)" -eq 0 ]; then
  REAL_USER="root"
else
  REAL_USER="${SUDO_USER:-$(id -un)}"
fi
REAL_GROUP="$(id -gn "$REAL_USER" 2>/dev/null || echo "$REAL_USER")"

# Привилегированные команды: от root либо через sudo (для не-root вызова)
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

# Команды сборки/установки выполняются от имени $REAL_USER.
# Если мы уже этот пользователь — запускаем напрямую, иначе через sudo -u.
if [ "$(id -un)" = "$REAL_USER" ]; then
  RUN=""
else
  RUN="$SUDO -u $REAL_USER"
fi

# Исправляем владельца дерева проекта, если в нём остались root-файлы
# (например, после обновления через веб-интерфейс).
if [ -n "$(find "$SCRIPT_DIR/dist" "$SCRIPT_DIR/node_modules" "$SCRIPT_DIR/server/node_modules" \
      \( -path "$SCRIPT_DIR/dist" -o -path "$SCRIPT_DIR/node_modules" -o -path "$SCRIPT_DIR/server/node_modules" \) \
      ! -user "$REAL_USER" -print -quit 2>/dev/null)" ]; then
  echo "🔧 Исправляю владельца файлов проекта на $REAL_USER..."
  $SUDO chown -R "$REAL_USER:$REAL_GROUP" \
    "$SCRIPT_DIR/dist" "$SCRIPT_DIR/node_modules" "$SCRIPT_DIR/server/node_modules" 2>/dev/null || true
fi

echo "📥 Получение изменений..."
$RUN git pull origin main

echo "📦 Установка зависимостей фронтенда..."
$RUN npm install --include=dev

# Проверяем, что vite установлен
if [ ! -f "$SCRIPT_DIR/node_modules/.bin/vite" ]; then
  echo "❌ Ошибка: vite не установлен в node_modules/.bin/"
  echo "Попытка переустановки..."
  $RUN rm -rf node_modules package-lock.json
  $RUN npm install --include=dev
fi

echo "🔨 Сборка фронтенда..."
# vite работает от имени $REAL_USER (владелец dist/ после chown выше),
# но бинарники могут лежать в root-директории проекта — добавляем rX.
$SUDO chmod -R a+rX "$SCRIPT_DIR/node_modules/.bin" 2>/dev/null || true
$RUN env PATH="$SCRIPT_DIR/node_modules/.bin:$PATH" \
  node "$SCRIPT_DIR/node_modules/vite/bin/vite.js" build

echo "📦 Установка зависимостей бэкенда..."
cd server
if [ ! -d "node_modules" ]; then
  $RUN npm install
else
  $RUN npm ci
fi
cd ..

echo "📋 Обновление скрипта маршрутизации..."
$SUDO cp scripts/update-ai-router.sh /usr/local/bin/update-ai-router.sh
$SUDO chmod +x /usr/local/bin/update-ai-router.sh

echo "📋 Обновление скрипта диагностики..."
$SUDO cp scripts/check-vm-awg.sh /usr/local/bin/check-vm-awg.sh
$SUDO chmod +x /usr/local/bin/check-vm-awg.sh

echo "🔄 Перезапуск сервиса..."
$SUDO systemctl restart ai-router-manager

echo "✅ Готово!"
$SUDO systemctl status ai-router-manager --no-pager
