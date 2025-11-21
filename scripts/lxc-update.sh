#!/bin/bash
# Script completo per aggiornare backend e frontend su LXC
# Eseguire come root
# Uso: DOMAIN=alevale.iliadboxos.it ./scripts/lxc-update.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"
DOMAIN="${DOMAIN:-alevale.iliadboxos.it}"
REPO_DIR="${REPO_DIR:-/tmp/alefy}"

echo -e "${YELLOW}=== Aggiornamento Completo Alefy ===${NC}\n"

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

# 1. Aggiorna repository
echo -e "${YELLOW}1. Aggiornamento repository...${NC}"
if [ ! -d "$REPO_DIR" ]; then
    echo -e "${YELLOW}Clone repository in $REPO_DIR...${NC}"
    mkdir -p "$(dirname "$REPO_DIR")"
    run_as_user "$ALEFY_USER" git clone https://github.com/Polimar/alefy.git "$REPO_DIR" || git clone https://github.com/Polimar/alefy.git "$REPO_DIR"
    chown -R "$ALEFY_USER:$ALEFY_USER" "$REPO_DIR"
else
    cd "$REPO_DIR"
    run_as_user "$ALEFY_USER" git pull || git pull
    echo -e "${GREEN}✓ Repository aggiornato${NC}"
fi

# 2. Aggiorna backend
echo -e "\n${YELLOW}2. Aggiornamento backend...${NC}"
if [ ! -d "$ALEFY_HOME/backend" ]; then
    echo -e "${RED}✗ Directory backend non trovata${NC}"
    exit 1
fi

# Copia nuovi file backend
cp -r "$REPO_DIR/backend"/* "$ALEFY_HOME/backend/"
chown -R "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME/backend"

# Installa nuove dipendenze
cd "$ALEFY_HOME/backend"
echo -e "${YELLOW}Installazione dipendenze backend...${NC}"
if [ -f "package-lock.json" ]; then
    run_as_user "$ALEFY_USER" npm ci --production || run_as_user "$ALEFY_USER" npm install --production
else
    run_as_user "$ALEFY_USER" npm install --production
fi

# Assicurati che uuid sia installato (potrebbe mancare se package-lock.json non è aggiornato)
echo -e "${YELLOW}Verifica installazione uuid...${NC}"
if ! run_as_user "$ALEFY_USER" npm list uuid &>/dev/null; then
    echo -e "${YELLOW}Installazione uuid...${NC}"
    run_as_user "$ALEFY_USER" npm install uuid --save --production
fi
run_as_user "$ALEFY_USER" npm list uuid || true
echo -e "${GREEN}✓ Backend aggiornato${NC}"

# 3. Ricostruisci frontend usando lo script dedicato
echo -e "\n${YELLOW}3. Ricostruzione frontend...${NC}"
cd "$REPO_DIR"
if [ -f "scripts/lxc-rebuild-frontend.sh" ]; then
    chmod +x scripts/lxc-rebuild-frontend.sh
    DOMAIN="$DOMAIN" REPO_DIR="$REPO_DIR" ./scripts/lxc-rebuild-frontend.sh
else
    echo -e "${RED}✗ Script lxc-rebuild-frontend.sh non trovato${NC}"
    exit 1
fi

# 4. Riavvia servizi
echo -e "\n${YELLOW}4. Riavvio servizi...${NC}"
systemctl restart alefy
systemctl reload nginx
echo -e "${GREEN}✓ Servizi riavviati${NC}"

# 5. Verifica
echo -e "\n${YELLOW}5. Verifica installazione...${NC}"
sleep 2

if systemctl is-active --quiet alefy; then
    echo -e "${GREEN}✓ Servizio alefy attivo${NC}"
else
    echo -e "${RED}✗ Servizio alefy non attivo${NC}"
    echo -e "${YELLOW}Controlla i log: journalctl -u alefy -n 50${NC}"
fi

# Verifica frontend
if [ -d "/var/www/alefy" ] && [ "$(ls -A /var/www/alefy)" ]; then
    CSS_COUNT=$(find /var/www/alefy -name "*.css" | wc -l)
    JS_COUNT=$(find /var/www/alefy -name "*.js" | wc -l)
    echo -e "${GREEN}✓ Frontend deployato: $CSS_COUNT file CSS, $JS_COUNT file JS${NC}"
else
    echo -e "${RED}✗ Frontend non trovato o vuoto${NC}"
fi

echo -e "\n${GREEN}=== Aggiornamento completato! ===${NC}"
echo -e "\n${YELLOW}Comandi utili:${NC}"
echo -e "  Status: systemctl status alefy"
echo -e "  Log: journalctl -u alefy -f"
echo -e "  Test API: curl http://localhost:3000/api/health"
echo -e "  Test Frontend: curl -I http://localhost/"

