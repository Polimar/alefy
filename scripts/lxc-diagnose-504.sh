#!/bin/bash

# Script di diagnostica per errore 504 Gateway Time-out

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Diagnostica 504 Gateway Time-out ===${NC}\n"

# 1. Verifica servizio alefy
echo -e "${YELLOW}1. Stato servizio alefy:${NC}"
systemctl status alefy --no-pager -l || true
echo ""

# 2. Verifica porta 3000
echo -e "${YELLOW}2. Verifica porta 3000:${NC}"
if netstat -tlnp 2>/dev/null | grep -q ":3000 " || ss -tlnp 2>/dev/null | grep -q ":3000 "; then
    echo -e "${GREEN}✓ Porta 3000 in ascolto${NC}"
    netstat -tlnp 2>/dev/null | grep ":3000 " || ss -tlnp 2>/dev/null | grep ":3000 "
else
    echo -e "${RED}✗ Porta 3000 NON in ascolto${NC}"
fi
echo ""

# 3. Verifica variabili ambiente
echo -e "${YELLOW}3. Variabili ambiente servizio:${NC}"
systemctl show alefy | grep -E "(NODE_ENV|PORT|FRONTEND_STATIC_PATH)" || true
echo ""

# 4. Verifica file statici frontend
echo -e "${YELLOW}4. File statici frontend:${NC}"
FRONTEND_PATH="/var/www/alefy"
if [ -d "$FRONTEND_PATH" ]; then
    echo -e "${GREEN}✓ Directory esiste: $FRONTEND_PATH${NC}"
    ls -lah "$FRONTEND_PATH" | head -20
    if [ -f "$FRONTEND_PATH/index.html" ]; then
        echo -e "${GREEN}✓ index.html presente${NC}"
    else
        echo -e "${RED}✗ index.html NON presente${NC}"
    fi
else
    echo -e "${RED}✗ Directory NON esiste: $FRONTEND_PATH${NC}"
fi
echo ""

# 5. Verifica permessi file statici
echo -e "${YELLOW}5. Permessi file statici:${NC}"
if [ -d "$FRONTEND_PATH" ]; then
    ls -ld "$FRONTEND_PATH"
    ls -lah "$FRONTEND_PATH" | head -5
fi
echo ""

# 6. Test backend locale
echo -e "${YELLOW}6. Test backend locale:${NC}"
echo "Test /health:"
curl -s http://localhost:3000/health || echo -e "${RED}✗ Errore${NC}"
echo ""
echo "Test /api/health:"
curl -s http://localhost:3000/api/health || echo -e "${RED}✗ Errore${NC}"
echo ""
echo "Test /api:"
curl -s http://localhost:3000/api | head -5 || echo -e "${RED}✗ Errore${NC}"
echo ""

# 7. Test file statici dal backend
echo -e "${YELLOW}7. Test file statici dal backend:${NC}"
if [ -f "$FRONTEND_PATH/index.html" ]; then
    echo "Test /index.html:"
    curl -s -I http://localhost:3000/index.html | head -5 || echo -e "${RED}✗ Errore${NC}"
    echo ""
    if [ -f "$FRONTEND_PATH/assets/index-"*.css ]; then
        CSS_FILE=$(ls "$FRONTEND_PATH"/assets/index-*.css | head -1 | xargs basename)
        echo "Test /assets/$CSS_FILE:"
        curl -s -I "http://localhost:3000/assets/$CSS_FILE" | head -5 || echo -e "${RED}✗ Errore${NC}"
    fi
else
    echo -e "${RED}✗ File statici non disponibili per test${NC}"
fi
echo ""

# 8. Verifica processi nginx
echo -e "${YELLOW}8. Processi nginx in esecuzione:${NC}"
if pgrep -x nginx > /dev/null; then
    echo -e "${YELLOW}⚠ Nginx è in esecuzione (potrebbe interferire)${NC}"
    ps aux | grep nginx | grep -v grep
else
    echo -e "${GREEN}✓ Nessun processo nginx attivo${NC}"
fi
echo ""

# 9. Verifica log recenti
echo -e "${YELLOW}9. Ultimi log backend (ultimi 20):${NC}"
journalctl -u alefy -n 20 --no-pager || true
echo ""

# 10. Verifica connessioni in ascolto
echo -e "${YELLOW}10. Connessioni in ascolto:${NC}"
netstat -tlnp 2>/dev/null | grep -E ":(80|443|3000)" || ss -tlnp 2>/dev/null | grep -E ":(80|443|3000)" || true
echo ""

# 11. Verifica .env backend
echo -e "${YELLOW}11. Configurazione backend (.env):${NC}"
if [ -f "/opt/alefy/backend/.env" ]; then
    echo -e "${GREEN}✓ File .env presente${NC}"
    grep -E "(NODE_ENV|PORT|FRONTEND_STATIC_PATH)" /opt/alefy/backend/.env 2>/dev/null || echo "Variabili non trovate"
else
    echo -e "${YELLOW}⚠ File .env non trovato${NC}"
fi
echo ""

echo -e "${YELLOW}=== Riepilogo ===${NC}"
echo ""
echo "Per risolvere il 504:"
echo "1. Verifica che Nginx Proxy Manager punti a: http://192.168.1.186:3000 (NON https, NON :443)"
echo "2. Verifica che il backend serva i file statici (NODE_ENV=production o FRONTEND_STATIC_PATH impostato)"
echo "3. Verifica che i file esistano in /var/www/alefy"
echo "4. Se ci sono processi nginx attivi, fermali: systemctl stop nginx"
echo ""

