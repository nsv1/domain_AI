# Установка AI Router Manager на Debian/Ubuntu

## Предварительные требования

На VM уже должны быть установлены и настроены:
- ✅ AmneziaWG (интерфейс `awg0`)
- ✅ dnsmasq
- ✅ Скрипт `/usr/local/bin/update-ai-router.sh`

## 1. Установка Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверка:
```bash
node --version  # v20.x.x
npm --version   # 10.x.x
```

## 2. Установка проекта

```bash
# Создаём директорию
sudo mkdir -p /opt/ai-router-manager
sudo chown $USER:$USER /opt/ai-router-manager

# Копируем файлы проекта
cd /opt/ai-router-manager
# Скопируйте файлы из репозитория

# Устанавливаем зависимости фронтенда
npm install

# Собираем фронтенд
npm run build

# Устанавливаем зависимости бэкенда
cd server
npm install
```

## 3. Установка скрипта

```bash
sudo cp scripts/update-ai-router.sh /usr/local/bin/update-ai-router.sh
sudo chmod +x /usr/local/bin/update-ai-router.sh
```

## 4. Настройка sudo (без пароля для скрипта)

```bash
sudo visudo
```

Добавьте строку (замените `user` на вашего пользователя):
```
user ALL=(ALL) NOPASSWD: /usr/local/bin/update-ai-router.sh
```

## 5. Создание systemd-сервиса

```bash
sudo tee /etc/systemd/system/ai-router-manager.service > /dev/null <<'EOF'
[Unit]
Description=AI Router Manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-router-manager/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
```

## 6. Запуск сервиса

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-router-manager
```

## 7. Проверка

```bash
sudo systemctl status ai-router-manager
```

Откройте в браузере: **http://<IP-VM>:3001**

## Управление

```bash
sudo systemctl status ai-router-manager   # статус
sudo systemctl restart ai-router-manager  # перезапуск
sudo systemctl stop ai-router-manager     # остановка
sudo journalctl -u ai-router-manager -f   # логи сервиса
tail -f /var/log/ai-router.log            # лог скрипта
```

## Обновление

```bash
cd /opt/ai-router-manager
git pull
npm install
npm run build
cd server && npm install
sudo systemctl restart ai-router-manager
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3001` | Порт API сервера |
| `DOMAINS_FILE` | `/etc/ai-domains.list` | Файл списка доменов |
| `LOG_FILE` | `/var/log/ai-router.log` | Файл лога |
| `SCRIPT_PATH` | `/usr/local/bin/update-ai-router.sh` | Путь к скрипту |
