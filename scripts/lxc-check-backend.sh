#!/bin/bash
# Script per diagnosticare problemi backend su LXC
# Eseguire come root

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"

echo -e "${YELLOW}=== Diagnostica Backend ===${NC}\n"

# Funzione helper per eseguire comandi come utente
run_as_user() {
    local user=$1
    shift
    if command -v runuser &> /dev/null; then
        runuser -u "$user" -- "$@"
    else
        local cmd="$*"
        su -s /bin/bash "$user" -c "$cmd"
    fi
}

# 1. Verifica servizio
echo -e "${YELLOW}1. Status servizio alefy...${NC}"
systemctl status alefy --no-pager -l || true

# 2. Ultimi log
echo -e "\n${YELLOW}2. Ultimi 50 log...${NC}"
journalctl -u alefy -n 50 --no-pager || true

# 3. Verifica dipendenze
echo -e "\n${YELLOW}3. Verifica dipendenze backend...${NC}"
cd "$ALEFY_HOME/backend"
if [ -f "package.json" ]; then
    echo -e "${YELLOW}Controllo uuid...${NC}"
    run_as_user "$ALEFY_USER" npm list uuid 2>&1 || echo -e "${RED}uuid non trovato${NC}"
    
    echo -e "\n${YELLOW}Controllo tutte le dipendenze...${NC}"
    run_as_user "$ALEFY_USER" npm list --depth=0 2>&1 | head -20
else
    echo -e "${RED}✗ package.json non trovato${NC}"
fi

# 4. Test avvio manuale
echo -e "\n${YELLOW}4. Test avvio manuale backend...${NC}"
cd "$ALEFY_HOME/backend"
echo -e "${YELLOW}Esecuzione: node src/index.js${NC}"
timeout 5 run_as_user "$ALEFY_USER" node src/index.js 2>&1 || echo -e "${YELLOW}Timeout o errore (normale se il server si avvia)${NC}"

# 5. Verifica file importanti
echo -e "\n${YELLOW}5. Verifica file importanti...${NC}"
echo -e "${YELLOW}downloadQueue.js:${NC}"
ls -la "$ALEFY_HOME/backend/src/utils/downloadQueue.js" 2>&1 || echo -e "${RED}✗ File non trovato${NC}"

echo -e "\n${YELLOW}youtubeController.js:${NC}"
ls -la "$ALEFY_HOME/backend/src/controllers/youtubeController.js" 2>&1 || echo -e "${RED}✗ File non trovato${NC}"

echo -e "\n${YELLOW}index.js:${NC}"
ls -la "$ALEFY_HOME/backend/src/index.js" 2>&1 || echo -e "${RED}✗ File non trovato${NC}"

# 6. Verifica .env
echo -e "\n${YELLOW}6. Verifica file .env...${NC}"
if [ -f "$ALEFY_HOME/backend/.env" ]; then
    echo -e "${GREEN}✓ File .env presente${NC}"
    echo -e "${YELLOW}Variabili importanti:${NC}"
    grep -E "^(PORT|DATABASE|NODE_ENV)" "$ALEFY_HOME/backend/.env" || true
else
    echo -e "${RED}✗ File .env non trovato${NC}"
fi

echo -e "\n${GREEN}=== Diagnostica completata ===${NC}"

