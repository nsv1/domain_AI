# AI Router Manager (domain_AI)

Веб-интерфейс для управления маршрутизацией AI-сервисов (OpenAI, ChatGPT, Claude и др.) через AmneziaWG туннель с интеграцией FRR/BGP.

Позволяет редактировать список доменов, запускать их резолвинг через несколько DNS-серверов, добавлять полученные IP-маршруты в таблицу маршрутизации через туннель `awg0` и публиковать их по BGP (FRR), а также просматривать статус системы и логи в реальном времени.

## Возможности

- 🌐 **Веб-интерфейс** — редактор списка доменов с пошаговым визуальным прогрессом применения
- 🔍 **Мульти-DNS резолвинг** — запросы к 5 DNS-серверам (Cloudflare, Google, Quad9, OpenDNS) с таймаутами для обхода GeoDNS
- 🔀 **Маршрутизация через AmneziaWG** — добавление IP-доменов в маршрутную таблицу через интерфейс `awg0`
- 📡 **FRR/BGP интеграция** — публикация префиксов через prefix-list `AI-NETWORKS`
- 📋 **Мониторинг** — статус системы, количество доменов, просмотр логов (`/var/log/ai-router.log`)
- 🩺 **Диагностика** — скрипт полной проверки конфигурации сервера обхода DPI
- 🔄 **Самообновление** — обновление проекта из git-репозитория прямо из интерфейса

## Архитектура

```
┌──────────────┐      HTTP       ┌──────────────────┐     sudo      ┌─────────────────────┐
│  Фронтенд    │ ──────────────► │  Express API     │ ────────────► │ update-ai-router.sh │
│  React +     │ /api/*          │  server/server.js│               │  (bash, root)       │
│  Vite +      │ ◄────────────── │  порт 3001       │ ◄──────────── │  DNS → routes →     │
│  Tailwind    │   статус/логи   └──────────────────┘   вывод       │  FRR/BGP            │
└──────────────┘                                                     └─────────────────────┘
```

### Структура проекта

```
.
├── src/                      # Фронтенд (React + TypeScript)
│   ├── App.tsx               # Основной компонент интерфейса
│   ├── main.tsx              # Точка входа
│   └── index.css             # Стили (Tailwind CSS 4)
├── server/                   # Бэкенд (Node.js + Express)
│   └── server.js             # REST API и раздача собранного фронтенда
├── scripts/
│   ├── update-ai-router.sh   # Резолвинг доменов и настройка маршрутов (v3.3)
│   └── check-vm-awg.sh       # Диагностика сервера (v2.2)
├── public/                   # Статические файлы
├── index.html                # HTML-шаблон Vite
├── vite.config.js            # Конфигурация сборки/dev-сервера
├── update.md                 # Полная инструкция по развертыванию
└── INSTALL_DEBIAN.md         # Быстрая установка на Debian/Ubuntu
```

## Системные требования

- **ОС**: Debian 12+ / Ubuntu 22.04+
- **Node.js**: 18+ (рекомендуется 20.x)
- **npm**: 9+
- **Git**: 2.30+
- **Права**: root или sudo
- **Предварительная настройка**:
  - AmneziaWG (интерфейс `awg0`)
  - dnsmasq
  - FRR (BGP)

## Установка

Подробная инструкция — в [update.md](update.md) и [INSTALL_DEBIAN.md](INSTALL_DEBIAN.md). Кратко:

```bash
# 1. Клонирование
cd /opt
sudo git clone https://github.com/nsv1/domain_AI.git ai-router-manager
cd ai-router-manager

# 2. Зависимости и сборка фронтенда
npm install
npm run build

# 3. Зависимости бэкенда
cd server && npm install && cd ..

# 4. Установка скриптов
sudo cp scripts/update-ai-router.sh /usr/local/bin/
sudo cp scripts/check-vm-awg.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/update-ai-router.sh /usr/local/bin/check-vm-awg.sh

# 5. Файл доменов
sudo touch /etc/ai-domains.list
sudo chown $USER:$USER /etc/ai-domains.list

# 6. Запуск
node server/server.js
```

Не забудьте настроить sudo без пароля для скриптов (`visudo`) и создать systemd-сервис — см. `update.md`.

## Запуск в режиме разработки

```bash
# Терминал 1 — dev-сервер Vite (порт 3000)
npm run dev

# Терминал 2 — API-сервер (порт 3001)
cd server && npm start
```

## Конфигурация

Переменные окружения для `server/server.js`:

| Переменная     | По умолчанию                          | Описание                        |
|----------------|---------------------------------------|---------------------------------|
| `PORT`         | `3001`                                | Порт API/веб-сервера            |
| `DOMAINS_FILE` | `/etc/ai-domains.list`                | Файл со списком доменов         |
| `LOG_FILE`     | `/var/log/ai-router.log`              | Файл журнала                    |
| `SCRIPT_PATH`  | `/usr/local/bin/update-ai-router.sh`  | Путь к скрипту обновления       |

## API

| Метод | Путь             | Описание                                        |
|-------|------------------|-------------------------------------------------|
| POST  | `/api/process`   | Сохранить домены и запустить обновление маршрутов |
| GET   | `/api/domains`   | Получить текущий список доменов                 |
| GET   | `/api/status`    | Статус системы (файлы, кол-во доменов)          |
| GET   | `/api/diagnose`  | Запустить диагностику (`check-vm-awg.sh`)       |
| GET   | `/api/update`    | Самообновление из git-репозитория               |

## Формат файла доменов

`/etc/ai-domains.list` — по одному домену на строку. Строки, начинающиеся с `#`, игнорируются; `---` используется как разделитель групп:

```
# OpenAI (ChatGPT, DALL-E, GPT API)
openai.com
chat.openai.com
chatgpt.com
api.openai.com
---
# Anthropic (Claude)
claude.ai
api.anthropic.com
```

## Основные команды

```bash
npm run dev        # Dev-сервер Vite (порт 3000)
npm run build      # Сборка фронтенда в dist/
npm run typecheck  # Проверка типов TypeScript
cd server && npm start   # Запуск API-сервера (порт 3001)
sudo check-vm-awg.sh     # Диагностика сервера
```

## Технологии

- **Фронтенд**: React 18, TypeScript, Vite 6, Tailwind CSS 4
- **Бэкенд**: Node.js, Express 5, CORS
- **Система**: Bash, AmneziaWG, dnsmasq, FRR/BGP, iproute2

## Лицензия

Private repository — все права защищены.
