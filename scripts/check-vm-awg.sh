#!/bin/bash
# check-vm-awg.sh v2.2 - Полная диагностика сервера обхода DPI
# Использование: sudo ./check-vm-awg.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

PASS=0
FAIL=0
WARN=0

section() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
}

result() {
    local status=$1
    local message=$2
    if [ "$status" = "PASS" ]; then
        echo -e "  ${GREEN}✅ $message${NC}"
        PASS=$((PASS + 1))
    elif [ "$status" = "FAIL" ]; then
        echo -e "  ${RED}❌ $message${NC}"
        FAIL=$((FAIL + 1))
    elif [ "$status" = "WARN" ]; then
        echo -e "  ${YELLOW}⚠️  $message${NC}"
        WARN=$((WARN + 1))
    fi
}

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: Скрипт нужно запускать с правами root (sudo)${NC}"
    exit 1
fi

START_TIME=$(date +%s)

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ДИАГНОСТИКА СЕРВЕРА VM-AWG (v2.2)                  ║"
echo "║   Система обхода DPI для AI-сервисов                 ║"
echo "║   Дата: $(date '+%Y-%m-%d %H:%M:%S')                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ═══════════════════════════════════════════════════════
section "1. СТАТУС СЕРВИСОВ"
# ═══════════════════════════════════════════════════════

systemctl is-active --quiet dnsmasq && result "PASS" "dnsmasq активен" || result "FAIL" "dnsmasq НЕ активен"
systemctl is-active --quiet ai-router-manager && result "PASS" "ai-router-manager активен (порт 3001)" || result "FAIL" "ai-router-manager НЕ активен"
systemctl is-active --quiet cron && result "PASS" "cron активен" || result "FAIL" "cron НЕ активен"

# ═══════════════════════════════════════════════════════
section "2. BGP-СЕССИЯ С CISCO"
# ═══════════════════════════════════════════════════════

BGP_LINE=$(vtysh -c "show ip bgp summary" 2>/dev/null | grep "192.168.100.1")

if [ -n "$BGP_LINE" ]; then
    UPTIME=$(echo "$BGP_LINE" | awk '{print $9}')
    PFX_SENT=$(echo "$BGP_LINE" | awk '{print $11}')
    STATE=$(echo "$BGP_LINE" | awk '{print $10}')
    
    if [[ "$STATE" == *"("* ]] || [[ "$STATE" =~ ^[0-9]+$ ]]; then
        result "PASS" "BGP-сессия активна (uptime: $UPTIME)"
    else
        result "FAIL" "BGP-сессия в состоянии: $STATE"
    fi
    
    if [[ "$PFX_SENT" =~ ^[0-9]+$ ]] && [ "$PFX_SENT" -gt 0 ]; then
        result "PASS" "Анонсируется префиксов: $PFX_SENT"
    else
        result "FAIL" "Не удалось определить количество анонсируемых префиксов"
    fi
else
    result "FAIL" "BGP-сосед 192.168.100.1 не найден"
fi

# ═══════════════════════════════════════════════════════
section "3. ТУННЕЛЬ AWG0"
# ═══════════════════════════════════════════════════════

if ip link show awg0 &>/dev/null; then
    STATE=$(ip link show awg0 | grep -o "state [A-Z]*" | awk '{print $2}')
    if [ "$STATE" = "UNKNOWN" ] || [ "$STATE" = "UP" ]; then
        result "PASS" "Интерфейс awg0 существует (state: $STATE)"
    else
        result "FAIL" "Интерфейс awg0 в состоянии: $STATE"
    fi
else
    result "FAIL" "Интерфейс awg0 не существует"
fi

PING_RESULT=$(ping -c 2 -W 3 -I awg0 1.1.1.1 2>/dev/null)
if echo "$PING_RESULT" | grep -q "0% packet loss"; then
    AVG_TIME=$(echo "$PING_RESULT" | grep "rtt" | awk -F'/' '{print $5}')
    result "PASS" "Туннель работает (пинг 1.1.1.1: ${AVG_TIME}ms)"
else
    result "FAIL" "Туннель не работает (потеря пакетов)"
fi

# ═══════════════════════════════════════════════════════
section "4. МАРШРУТИЗАЦИЯ И СИНХРОНИЗАЦИЯ С FRR"
# ═══════════════════════════════════════════════════════

ROUTE_COUNT=$(ip route show 2>/dev/null | grep "dev awg0" | wc -l | tr -d ' ')
ROUTE_COUNT=${ROUTE_COUNT:-0}

if [[ "$ROUTE_COUNT" =~ ^[0-9]+$ ]] && [ "$ROUTE_COUNT" -gt 100 ]; then
    result "PASS" "Маршрутов через awg0: $ROUTE_COUNT"
elif [[ "$ROUTE_COUNT" =~ ^[0-9]+$ ]] && [ "$ROUTE_COUNT" -gt 0 ]; then
    result "WARN" "Маршрутов через awg0 мало: $ROUTE_COUNT"
else
    result "FAIL" "Нет маршрутов через awg0"
fi

PREFIX_COUNT=$(vtysh -c "show running-config" 2>/dev/null | grep "ip prefix-list AI-NETWORKS" | wc -l | tr -d ' ')
PREFIX_COUNT=${PREFIX_COUNT:-0}

if [[ "$PREFIX_COUNT" =~ ^[0-9]+$ ]] && [ "$PREFIX_COUNT" -gt 100 ]; then
    result "PASS" "Записей в prefix-list AI-NETWORKS: $PREFIX_COUNT"
elif [[ "$PREFIX_COUNT" =~ ^[0-9]+$ ]] && [ "$PREFIX_COUNT" -gt 0 ]; then
    result "WARN" "Записей в prefix-list мало: $PREFIX_COUNT"
else
    result "FAIL" "Prefix-list AI-NETWORKS пуст"
fi

BGP_SENT=$(vtysh -c "show ip bgp summary" 2>/dev/null | grep "192.168.100.1" | awk '{print $11}')
BGP_SENT=${BGP_SENT:-0}

if [[ "$BGP_SENT" =~ ^[0-9]+$ ]] && [ "$BGP_SENT" -gt 100 ]; then
    result "PASS" "BGP анонсирует префиксов: $BGP_SENT"
elif [[ "$BGP_SENT" =~ ^[0-9]+$ ]] && [ "$BGP_SENT" -gt 0 ]; then
    result "WARN" "BGP анонсирует мало префиксов: $BGP_SENT"
else
    result "FAIL" "BGP не анонсирует префиксы"
fi

if [[ "$ROUTE_COUNT" =~ ^[0-9]+$ ]] && [[ "$BGP_SENT" =~ ^[0-9]+$ ]] && [ "$ROUTE_COUNT" -gt 0 ]; then
    SYNC_PERCENT=$((BGP_SENT * 100 / ROUTE_COUNT))
    
    if [ "$SYNC_PERCENT" -ge 90 ]; then
        result "PASS" "Синхронизация ядро↔BGP: ${SYNC_PERCENT}% ($BGP_SENT из $ROUTE_COUNT)"
    elif [ "$SYNC_PERCENT" -ge 70 ]; then
        result "WARN" "Синхронизация ядро↔BGP: ${SYNC_PERCENT}% ($BGP_SENT из $ROUTE_COUNT)"
    else
        result "FAIL" "Низкая синхронизация ядро↔BGP: ${SYNC_PERCENT}% ($BGP_SENT из $ROUTE_COUNT)"
    fi
else
    result "WARN" "Не удалось проверить синхронизацию"
fi

# ═══════════════════════════════════════════════════════
section "5. DNS РЕЗОЛВИНГ"
# ═══════════════════════════════════════════════════════

CORP_IP=$(dig @192.168.100.2 enersys.ru +short 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
[ -n "$CORP_IP" ] && result "PASS" "Корпоративный домен (enersys.ru → $CORP_IP)" || result "FAIL" "Корпоративный домен не резолвится"

AI_DOMAINS=("kimi.ai" "openai.com" "claude.ai" "openrouter.ai")
for domain in "${AI_DOMAINS[@]}"; do
    AI_IP=$(dig @192.168.100.2 "$domain" +short 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
    if [ -n "$AI_IP" ]; then
        AI_ROUTE=$(ip route get "$AI_IP" 2>/dev/null | grep -o "dev awg0")
        if [ -n "$AI_ROUTE" ]; then
            result "PASS" "$domain → $AI_IP (через туннель)"
        else
            result "WARN" "$domain → $AI_IP (НЕ через туннель!)"
        fi
    else
        result "FAIL" "$domain не резолвится"
    fi
done

# ═══════════════════════════════════════════════════════
section "6. BGP АНОНСЫ ДЛЯ КЛЮЧЕВЫХ ДОМЕНОВ"
# ═══════════════════════════════════════════════════════

for domain in kimi.ai openrouter.ai claude.ai; do
    DOMAIN_IP=$(dig @192.168.100.2 "$domain" +short 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
    if [ -n "$DOMAIN_IP" ]; then
        BGP_ENTRY=$(vtysh -c "show ip bgp $DOMAIN_IP" 2>/dev/null)
        if echo "$BGP_ENTRY" | grep -q "Advertised to"; then
            result "PASS" "$domain ($DOMAIN_IP) анонсируется в BGP"
        else
            result "FAIL" "$domain ($DOMAIN_IP) НЕ анонсируется в BGP!"
        fi
    fi
done

# ═══════════════════════════════════════════════════════
section "7. HTTP ДОСТУПНОСТЬ AI-СЕРВИСОВ"
# ═══════════════════════════════════════════════════════

AI_URLS=(
    "https://www.kimi.ai"
    "https://openrouter.ai"
    "https://claude.ai"
    "https://openai.com"
)

for url in "${AI_URLS[@]}"; do
    HTTP_RESULT=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" -m 10 "$url" 2>/dev/null)
    HTTP_CODE=$(echo "$HTTP_RESULT" | awk '{print $1}')
    HTTP_TIME=$(echo "$HTTP_RESULT" | awk '{print $2}')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "308" ]; then
        result "PASS" "$url → HTTP $HTTP_CODE (${HTTP_TIME}s)"
    elif [ "$HTTP_CODE" = "000" ]; then
        result "FAIL" "$url → таймаут соединения"
    else
        result "FAIL" "$url → HTTP $HTTP_CODE (${HTTP_TIME}s)"
    fi
done

# ═══════════════════════════════════════════════════════
section "8. КОНФИГУРАЦИЯ DNSMASQ"
# ═══════════════════════════════════════════════════════

if [ -f /etc/dnsmasq.d/ai-dns.conf ]; then
    result "PASS" "Файл /etc/dnsmasq.d/ai-dns.conf существует"
    grep -q "no-resolv" /etc/dnsmasq.d/ai-dns.conf && result "PASS" "Параметр no-resolv настроен" || result "WARN" "Параметр no-resolv отсутствует"
    grep -q "server=1.1.1.1" /etc/dnsmasq.d/ai-dns.conf && result "PASS" "DNS 1.1.1.1 настроен" || result "FAIL" "DNS 1.1.1.1 не настроен"
else
    result "FAIL" "Файл /etc/dnsmasq.d/ai-dns.conf отсутствует"
fi

STATIC_RECORDS=$(grep -r "address=/" /etc/dnsmasq.d/ 2>/dev/null | wc -l | tr -d ' ')
[ "$STATIC_RECORDS" = "0" ] && result "PASS" "Статических записей в dnsmasq нет" || result "FAIL" "Найдено статических записей: $STATIC_RECORDS"

[ -f /etc/dnsmasq.d/ai-domains.conf ] && result "FAIL" "Файл ai-domains.conf существует (удалить!)" || result "PASS" "Файл ai-domains.conf отсутствует"

# ═══════════════════════════════════════════════════════
section "9. СКРИПТ ОБНОВЛЕНИЯ МАРШРУТОВ"
# ═══════════════════════════════════════════════════════

SCRIPT="/usr/local/bin/update-ai-router.sh"

if [ -f "$SCRIPT" ]; then
    result "PASS" "Скрипт $SCRIPT существует"
    
    if grep -q "prefix-list" "$SCRIPT" && grep -q "vtysh" "$SCRIPT"; then
        result "PASS" "Скрипт обновляет FRR prefix-list"
    else
        result "FAIL" "Скрипт НЕ обновляет FRR prefix-list!"
    fi
    
    grep -q "write memory" "$SCRIPT" && result "PASS" "Скрипт сохраняет конфиг FRR" || result "WARN" "Скрипт не сохраняет конфиг FRR"
    grep -q "clear ip bgp" "$SCRIPT" && result "PASS" "Скрипт делает BGP soft-reconfiguration" || result "WARN" "Скрипт не делает BGP soft-reconfiguration"
    
    if grep -q "ip route del" "$SCRIPT"; then
        result "PASS" "Скрипт очищает старые маршруты"
    else
        result "WARN" "Скрипт не очищает старые маршруты"
    fi
else
    result "FAIL" "Скрипт $SCRIPT отсутствует"
fi

# ═══════════════════════════════════════════════════════
section "10. CRON И ЛОГИ"
# ═══════════════════════════════════════════════════════

CRON_TASK=$(crontab -l 2>/dev/null | grep "update-ai-router")
[ -n "$CRON_TASK" ] && result "PASS" "Cron задача: $CRON_TASK" || result "FAIL" "Cron задача не найдена"

if [ -f /var/log/ai-router.log ]; then
    LOG_SIZE=$(du -h /var/log/ai-router.log | awk '{print $1}')
    result "PASS" "Лог существует (размер: $LOG_SIZE)"
    
    LAST_RUN=$(grep "Начало обновления" /var/log/ai-router.log | tail -1 | cut -d']' -f1 | cut -d'[' -f2)
    [ -n "$LAST_RUN" ] && result "PASS" "Последний запуск: $LAST_RUN" || result "WARN" "Не удалось определить последний запуск"
    
    LAST_PREFIX_UPDATE=$(grep "prefix-list обновлён" /var/log/ai-router.log | tail -1)
    if [ -n "$LAST_PREFIX_UPDATE" ]; then
        PREFIX_INFO=$(echo "$LAST_PREFIX_UPDATE" | grep -oE '\([0-9]+ записей\)')
        PREFIX_TIME=$(echo "$LAST_PREFIX_UPDATE" | cut -d']' -f1 | cut -d'[' -f2)
        result "PASS" "Prefix-list обновлён: $PREFIX_TIME $PREFIX_INFO"
    else
        result "FAIL" "Prefix-list НЕ обновлялся в последнем запуске!"
    fi
    
    DELETED_ROUTES=$(grep "Удалено старых маршрутов" /var/log/ai-router.log | tail -1 | grep -oE '[0-9]+' | head -1)
    if [ -n "$DELETED_ROUTES" ] && [ "$DELETED_ROUTES" -gt 0 ]; then
        result "PASS" "Очистка старых маршрутов работает (удалено: $DELETED_ROUTES)"
    else
        result "WARN" "Очистка старых маршрутов не сработала"
    fi
    
    FAILED_DOMAINS=$(grep "❌" /var/log/ai-router.log | tail -10 | wc -l | tr -d ' ')
    [ "$FAILED_DOMAINS" = "0" ] && result "PASS" "Ошибок резолвинга в последних логах нет" || result "WARN" "В последних логах есть ошибки резолвинга: $FAILED_DOMAINS"
else
    result "FAIL" "Лог /var/log/ai-router.log не найден"
fi

[ -f /etc/logrotate.d/ai-router ] && result "PASS" "Logrotate настроен для ai-router.log" || result "WARN" "Logrotate для ai-router.log не настроен"

# ═══════════════════════════════════════════════════════
section "11. СИСТЕМНЫЕ РЕСУРСЫ"
# ═══════════════════════════════════════════════════════

LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
if (( $(echo "$LOAD < 1.0" | bc -l 2>/dev/null || echo 1) )); then
    result "PASS" "Загрузка системы: $LOAD"
else
    result "WARN" "Высокая загрузка системы: $LOAD"
fi

MEM_FREE=$(free -m | awk '/^Mem:/ {print $7}')
[[ "$MEM_FREE" =~ ^[0-9]+$ ]] && [ "$MEM_FREE" -gt 100 ] && result "PASS" "Свободной памяти: ${MEM_FREE}MB" || result "WARN" "Мало свободной памяти: ${MEM_FREE}MB"

DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
DISK_PERCENT=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
[[ "$DISK_PERCENT" =~ ^[0-9]+$ ]] && [ "$DISK_PERCENT" -lt 80 ] && result "PASS" "Свободного места: $DISK_FREE (${DISK_PERCENT}% занято)" || result "WARN" "Диск заполнен на ${DISK_PERCENT}%"

# ═══════════════════════════════════════════════════════
# ИТОГОВОЕ ЗАКЛЮЧЕНИЕ
# ═══════════════════════════════════════════════════════

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
TOTAL=$((PASS + FAIL + WARN))

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   ИТОГОВОЕ ЗАКЛЮЧЕНИЕ                                ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}✅ Пройдено проверок:  $PASS${NC}"
echo -e "  ${YELLOW}⚠️  Предупреждений:    $WARN${NC}"
echo -e "  ${RED}❌ Ошибок:             $FAIL${NC}"
echo ""
echo -e "  Всего проверок: $TOTAL"
echo -e "  Время выполнения: ${DURATION} сек"
echo ""

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}🎉 СИСТЕМА РАБОТАЕТ ИДЕАЛЬНО!${NC}"
    EXIT_CODE=0
elif [ $FAIL -eq 0 ]; then
    echo -e "  ${YELLOW}${BOLD}⚠️  Система работает, но есть предупреждения${NC}"
    EXIT_CODE=0
elif [ $FAIL -le 2 ]; then
    echo -e "  ${YELLOW}${BOLD}⚠️  Есть незначительные проблемы${NC}"
    EXIT_CODE=1
else
    echo -e "  ${RED}${BOLD}❌ ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ ПРОБЛЕМЫ!${NC}"
    EXIT_CODE=2
fi

echo ""
exit $EXIT_CODE
