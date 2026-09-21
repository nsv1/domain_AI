#!/bin/bash
# update-ai-router.sh
# Скрипт обновления маршрутов для AI-доменов через AmneziaWG

DOMAINS_FILE="/etc/ai-domains.list"
LOG_FILE="/var/log/ai-router.log"
INTERFACE="awg0"
DNS_SERVER="127.0.0.1"

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

# Проверка наличия файла доменов
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

# Резолвинг DNS для каждого домена
log "🔍 Резолвинг DNS..."
ALL_IPS=""
RESOLVED=0
FAILED=0

while IFS= read -r domain; do
    [ -z "$domain" ] && continue
    
    # Получаем IP через dig
    IPS=$(dig @"$DNS_SERVER" +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
    
    if [ -n "$IPS" ]; then
        while IFS= read -r ip; do
            [ -z "$ip" ] && continue
            # Проверяем, не добавляли ли уже этот IP
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
done

log "✅ Маршруты обновлены: $IP_COUNT IP через $INTERFACE"

# Перезагрузка dnsmasq
log "🔄 Перезагрузка dnsmasq..."
systemctl reload dnsmasq 2>/dev/null && log "✅ dnsmasq перезагружен" || log "⚠️ Не удалось перезагрузить dnsmasq"

separator
log "✅ Обновление завершено успешно"
separator
echo ""
