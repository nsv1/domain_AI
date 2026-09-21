#!/bin/bash
# update-ai-router.sh - Финальная версия
# Резолвит через чистые DNS (1.1.1.1, 8.8.8.8) напрямую через туннель

DOMAINS_FILE="/etc/ai-domains.list"
LOG_FILE="/var/log/ai-router.log"
INTERFACE="awg0"
# Используем чистые DNS напрямую (они идут через туннель awg0)
DNS_SERVERS=("1.1.1.1" "8.8.8.8" "1.0.0.1")

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE"
}

separator() {
    local sep="=================================================="
    echo "$sep"
    echo "$sep" >> "$LOG_FILE"
}

separator
log "🚀 Начало обновления маршрутов"

# Проверка файла доменов
if [ ! -f "$DOMAINS_FILE" ]; then
    log "❌ Файл доменов не найден: $DOMAINS_FILE"
    exit 1
fi

# Чтение доменов (игнорируем комментарии и пустые строки)
DOMAINS=$(grep -v '^#' "$DOMAINS_FILE" | grep -v '^---' | grep -v '^[[:space:]]*$' || true)
if [ -z "$DOMAINS" ]; then
    log "❌ Нет доменов для обработки"
    exit 1
fi

DOMAIN_COUNT=$(echo "$DOMAINS" | wc -l)
log "📋 Найдено доменов: $DOMAIN_COUNT"

# Резолвинг через чистые DNS
log "🔍 Резолвинг DNS через 1.1.1.1/8.8.8.8..."
ALL_IPS=""
RESOLVED=0
FAILED=0

while IFS= read -r domain; do
    [ -z "$domain" ] && continue
    
    # Пробуем резолвить через каждый DNS
    IPS=""
    for dns in "${DNS_SERVERS[@]}"; do
        IPS=$(dig @"$dns" +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
        [ -n "$IPS" ] && break
    done
    
    if [ -n "$IPS" ]; then
        while IFS= read -r ip; do
            [ -z "$ip" ] && continue
            if ! echo "$ALL_IPS" | grep -q "^${ip}$" 2>/dev/null; then
                ALL_IPS="${ALL_IPS}${ip}\n"
            fi
        done <<< "$IPS"
        RESOLVED=$((RESOLVED + 1))
        log "  ✅ $domain → $(echo $IPS | tr '\n' ' ')"
    else
        FAILED=$((FAILED + 1))
        log "  ❌ $domain — не удалось разрешить"
    fi
done <<< "$DOMAINS"

# Подсчёт уникальных IP
IP_COUNT=0
if [ -n "$ALL_IPS" ]; then
    IP_COUNT=$(echo -e "$ALL_IPS" | grep -c '[0-9]' 2>/dev/null || echo "0")
fi

log "📊 Resolved: $RESOLVED доменов, $IP_COUNT уникальных IP, Failed: $FAILED"

if [ "$IP_COUNT" -eq 0 ]; then
    log "❌ Не удалось получить ни одного IP-адреса"
    exit 1
fi

# Обновление маршрутов
log "🔄 Обновление маршрутов через $INTERFACE..."

echo -e "$ALL_IPS" | grep '[0-9]' 2>/dev/null | while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    ip route replace "$ip" dev "$INTERFACE" 2>/dev/null || \
    ip route add "$ip" dev "$INTERFACE" 2>/dev/null || \
    log "  ⚠️ Не удалось добавить маршрут для $ip"
done || true

log "✅ Маршруты обновлены: $IP_COUNT IP через $INTERFACE"

separator
log "✅ Обновление завершено успешно"
separator
echo ""
