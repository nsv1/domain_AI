#!/bin/bash
# update-ai-router.sh v3.3 - Все функции + оптимизации
# Резолвит через 5 DNS с таймаутами, сохраняет подробные логи

DOMAINS_FILE="/etc/ai-domains.list"
LOG_FILE="/var/log/ai-router.log"
INTERFACE="awg0"
FRR_PREFIX_LIST="AI-NETWORKS"
# ВСЕ 5 DNS-серверов для максимального покрытия GeoDNS
DNS_SERVERS=("1.1.1.1" "8.8.8.8" "1.0.0.1" "9.9.9.9" "208.67.222.222")

PROTECTED_IPS=("1.1.1.1" "8.8.8.8" "1.0.0.1" "9.9.9.9" "208.67.222.222")

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
log "🚀 Начало обновления маршрутов (v3.3 полная версия)"

if [ ! -f "$DOMAINS_FILE" ]; then
    log "❌ Файл доменов не найден: $DOMAINS_FILE"
    exit 1
fi

DOMAINS=$(grep -v '^#' "$DOMAINS_FILE" | grep -v '^---' | grep -v '^[[:space:]]*$' || true)
if [ -z "$DOMAINS" ]; then
    log "❌ Нет доменов для обработки"
    exit 1
fi

DOMAIN_COUNT=$(echo "$DOMAINS" | wc -l)
log "📋 Найдено доменов: $DOMAIN_COUNT"

log "🔍 Резолвинг DNS через 5 серверов (с таймаутами 2с)..."

ALL_IPS_FILE=$(mktemp)
RESOLVED=0
FAILED=0
TOTAL=$DOMAIN_COUNT
CURRENT=0

while IFS= read -r domain; do
    [ -z "$domain" ] && continue
    CURRENT=$((CURRENT + 1))
    
    DOMAIN_IPS_FILE=$(mktemp)
    DOMAIN_RESOLVED=false
    
    # Пробуем каждый из 5 DNS с таймаутом 2 секунды
    for dns in "${DNS_SERVERS[@]}"; do
        IPS=$(dig @"$dns" +short +time=2 +tries=1 "$domain" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
        
        if [ -n "$IPS" ]; then
            DOMAIN_RESOLVED=true
            echo "$IPS" >> "$DOMAIN_IPS_FILE"
            echo "$IPS" >> "$ALL_IPS_FILE"
        fi
    done
    
    if [ "$DOMAIN_RESOLVED" = true ]; then
        RESOLVED=$((RESOLVED + 1))
        UNIQUE_FOR_DOMAIN=$(sort -u "$DOMAIN_IPS_FILE" | wc -l | tr -d ' ')
        IP_LIST=$(sort -u "$DOMAIN_IPS_FILE" | tr '\n' ' ')
        log "  ✅ $domain → $UNIQUE_FOR_DOMAIN IP ($IP_LIST)"
    else
        FAILED=$((FAILED + 1))
        log "  ❌ $domain — не удалось разрешить"
    fi
    
    rm -f "$DOMAIN_IPS_FILE"
    
    # Показываем прогресс каждые 10 доменов
    [ $((CURRENT % 10)) -eq 0 ] && log "  📊 Прогресс: $CURRENT/$TOTAL доменов"
    
done <<< "$DOMAINS"

# Уникальные IP (sort -u убирает дубликаты)
UNIQUE_IPS=$(sort -u "$ALL_IPS_FILE" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
IP_COUNT=$(echo "$UNIQUE_IPS" | grep -c '[0-9]' || echo "0")

log "📊 Resolved: $RESOLVED доменов, $IP_COUNT уникальных IP, Failed: $FAILED"

rm -f "$ALL_IPS_FILE"

if [ "$IP_COUNT" -eq 0 ]; then
    log "❌ Не удалось получить ни одного IP-адреса"
    exit 1
fi

# Очистка старых маршрутов
log "🧹 Очистка старых маршрутов через $INTERFACE..."

PROTECTED_FILE=$(mktemp)
printf '%s\n' "${PROTECTED_IPS[@]}" > "$PROTECTED_FILE"

ip route show dev "$INTERFACE" 2>/dev/null | awk '{print $1}' | grep -v -F -f "$PROTECTED_FILE" > /tmp/routes_to_del.txt || true

DELETED=0
if [ -s /tmp/routes_to_del.txt ]; then
    while IFS= read -r route; do
        [ -z "$route" ] && continue
        ip route del "$route" dev "$INTERFACE" 2>/dev/null && DELETED=$((DELETED + 1))
    done < /tmp/routes_to_del.txt
fi

PROTECTED_COUNT=$(ip route show dev "$INTERFACE" 2>/dev/null | wc -l | tr -d ' ')
log "✅ Удалено: $DELETED маршрутов, защищённых осталось: $PROTECTED_COUNT"

rm -f /tmp/routes_to_del.txt "$PROTECTED_FILE"

# Добавление новых маршрутов
log "🔄 Добавление новых маршрутов через $INTERFACE..."

ADDED=0
FAILED_ADD=0
while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    if ip route replace "$ip" dev "$INTERFACE" 2>/dev/null; then
        ADDED=$((ADDED + 1))
    else
        FAILED_ADD=$((FAILED_ADD + 1))
        log "  ⚠️ Не удалось добавить: $ip"
    fi
done <<< "$UNIQUE_IPS"

log "✅ Добавлено: $ADDED, ошибок: $FAILED_ADD"

# Обновление FRR prefix-list
if command -v vtysh &> /dev/null; then
    log "🔄 Обновление FRR prefix-list $FRR_PREFIX_LIST..."
    
    TEMP_FILE=$(mktemp)
    echo "no ip prefix-list $FRR_PREFIX_LIST" >> "$TEMP_FILE"
    
    SEQ=5
    while IFS= read -r ip; do
        [ -z "$ip" ] && continue
        echo "ip prefix-list $FRR_PREFIX_LIST seq $SEQ permit $ip/32" >> "$TEMP_FILE"
        SEQ=$((SEQ + 5))
    done <<< "$UNIQUE_IPS"
    
    log "  Применяем $IP_COUNT записей в FRR..."
    vtysh -f "$TEMP_FILE" 2>&1 | grep -v "^$" >> "$LOG_FILE"
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        log "✅ FRR prefix-list обновлён ($IP_COUNT записей)"
        
        log "  Сохраняем конфигурацию..."
        vtysh -c "write memory" 2>&1 | grep -v "^$" >> "$LOG_FILE"
        
        log "🔄 BGP soft-reconfiguration..."
        vtysh -c "clear ip bgp * soft out" 2>&1 | grep -v "^$" >> "$LOG_FILE"
        log "✅ BGP анонсы обновлены"
    else
        log "❌ Ошибка применения конфига FRR"
    fi
    
    rm -f "$TEMP_FILE"
else
    log "⚠️ FRR (vtysh) не найден — пропускаем обновление prefix-list"
fi

separator
log "✅ Обновление завершено успешно"
separator
echo ""
