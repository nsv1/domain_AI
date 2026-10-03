# AI Router Manager - Инструкция по развертыванию

## Описание

Веб-интерфейс для управления маршрутизацией AI-сервисов через AmneziaWG туннель с интеграцией FRR/BGP.

## Системные требования

- **ОС**: Debian 12+ / Ubuntu 22.04+
- **Node.js**: 18+
- **npm**: 9+
- **Git**: 2.30+
- **Права**: root или sudo

## Зависимости системы

```bash
sudo apt update
sudo apt install -y nodejs npm git curl dnsutils iproute2
```

## Установка

### 1. Клонирование репозитория

```bash
cd /opt
sudo git clone https://github.com/nsv1/domain_AI.git ai-router-manager
cd ai-router-manager
```

### 2. Установка зависимостей

```bash
# Фронтенд
npm install

# Бэкенд
cd server
npm install
cd ..
```

### 3. Сборка фронтенда

```bash
npm run build
```

### 4. Установка скриптов

```bash
# Скрипт обновления маршрутов
sudo cp scripts/update-ai-router.sh /usr/local/bin/update-ai-router.sh
sudo chmod +x /usr/local/bin/update-ai-router.sh

# Скрипт диагностики
sudo cp scripts/check-vm-awg.sh /usr/local/bin/check-vm-awg.sh
sudo chmod +x /usr/local/bin/check-vm-awg.sh
```

### 5. Создание файла доменов

```bash
sudo touch /etc/ai-domains.list
sudo chown $USER:$USER /etc/ai-domains.list
```

### 6. Настройка sudo без пароля

```bash
sudo visudo
```

Добавьте строку:
```
your_username ALL=(ALL) NOPASSWD: /usr/local/bin/update-ai-router.sh, /usr/local/bin/check-vm-awg.sh, /bin/systemctl restart ai-router-manager
```

Замените `your_username` на ваше имя пользователя.

### 7. Создание systemd сервиса

```bash
sudo nano /etc/systemd/system/ai-router-manager.service
```

Содержимое:
```ini
[Unit]
Description=AI Router Manager - Web Interface
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/opt/ai-router-manager
ExecStart=/usr/bin/node server/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Замените `your_username` на ваше имя пользователя.

### 8. Активация сервиса

```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-router-manager
sudo systemctl start ai-router-manager
```

### 9. Проверка статуса

```bash
sudo systemctl status ai-router-manager
```

## Доступ к веб-интерфейсу

Откройте браузер и перейдите по адресу:
```
http://<IP-сервера>:3001
```

## Настройка nginx (опционально)

Для доступа через порт 80:

```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/ai-router
```

Конфигурация:
```nginx
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 180s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
    }

    # API: отдельные увеличенные таймауты для долгих запросов
    # (например, /api/update запускает update.sh)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
```

Активация:
```bash
sudo ln -s /etc/nginx/sites-available/ai-router /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo ufw allow 80/tcp
```

## Обновление приложения

```bash
cd /opt/ai-router-manager
./update.sh
```

Скрипт автоматически:
- Получит изменения из git
- Установит зависимости
- Пересоберёт фронтенд
- Обновит скрипты
- Перезапустит сервис

## Диагностика системы

```bash
sudo /usr/local/bin/check-vm-awg.sh
```

Проверяет:
- Статус сервисов (dnsmasq, ai-router-manager, cron)
- BGP-сессию с Cisco
- Туннель AWG0
- Маршрутизацию и синхронизацию с FRR
- DNS резолвинг
- HTTP доступность AI-сервисов
- Конфигурацию dnsmasq
- Cron задачи и логи
- Системные ресурсы

## Структура проекта

```
/opt/ai-router-manager/
├── src/                    # Исходный код фронтенда (React)
├── dist/                   # Собранный фронтенд
├── server/                 # Бэкенд (Node.js + Express)
│   └── server.js          # API сервер
├── scripts/
│   ├── update-ai-router.sh    # Скрипт обновления маршрутов
│   └── check-vm-awg.sh        # Скрипт диагностики
├── update.sh              # Скрипт обновления приложения
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/status` - Статус системы
- `GET /api/domains` - Получить список доменов
- `POST /api/process` - Обработать домены
- `GET /api/diagnose` - Запустить диагностику

## Логи

- **Приложение**: `journalctl -u ai-router-manager -f`
- **Скрипт маршрутов**: `/var/log/ai-router.log`

## Устранение неполадок

### Сервис не запускается

```bash
sudo journalctl -u ai-router-manager -n 50 --no-pager
```

### Порт 3001 занят

```bash
sudo ss -tlnp | grep :3001
sudo kill -9 <PID>
```

### Ошибка прав доступа

```bash
sudo chown -R $USER:$USER /opt/ai-router-manager
sudo chmod +x /usr/local/bin/update-ai-router.sh
sudo chmod +x /usr/local/bin/check-vm-awg.sh
```

## Безопасность

- Веб-интерфейс не имеет аутентификации
- Рекомендуется ограничить доступ через firewall:
  ```bash
  sudo ufw allow from <ваш_IP> to any port 3001
  sudo ufw allow from <ваш_IP> to any port 80
  ```
- Или использовать nginx с базовой аутентификацией

## Лицензия

MIT

## Поддержка

Репозиторий: https://github.com/nsv1/domain_AI
