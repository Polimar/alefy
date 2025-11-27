#!/bin/bash
# Script completo per aggiornare backend e frontend su LXC
# Eseguire come root
# Uso: DOMAIN=alefy.duckdns.org ./scripts/lxc-update.sh
# Nota: Nginx è gestito esternamente tramite Nginx Proxy Manager

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"
DOMAIN="${DOMAIN:-alefy.duckdns.org}"
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

# Verifica/Installa chromaprint (necessario per fingerprint audio)
echo -e "${YELLOW}Verifica chromaprint...${NC}"
if ! command -v fpcalc &> /dev/null && ! command -v chromaprint &> /dev/null; then
    echo -e "${YELLOW}Installazione chromaprint...${NC}"
    
    # Abilita repository universe se disponibile (Ubuntu)
    if command -v add-apt-repository &> /dev/null; then
        add-apt-repository -y universe 2>/dev/null || true
    fi
    
    apt-get update -qq
    
    # Chromaprint potrebbe non essere nei repository standard
    # Prova installazione da repository universe (Ubuntu) o contrib (Debian)
    if apt-get install -y libchromaprint-tools 2>/dev/null; then
        echo -e "${GREEN}✓ chromaprint installato (libchromaprint-tools)${NC}"
    elif apt-get install -y chromaprint-tools 2>/dev/null; then
        echo -e "${GREEN}✓ chromaprint installato (chromaprint-tools)${NC}"
    elif apt-get install -y chromaprint 2>/dev/null; then
        echo -e "${GREEN}✓ chromaprint installato (chromaprint)${NC}"
    else
        echo -e "${YELLOW}⚠ chromaprint non disponibile nei repository standard${NC}"
        echo -e "${YELLOW}  Tentativo installazione da source...${NC}"
        
        # Installa dipendenze per compilazione
        apt-get install -y build-essential cmake libavcodec-dev libavformat-dev libavutil-dev libavresample-dev
        
        # Scarica e compila chromaprint
        CHROMAPRINT_VERSION="1.5.1"
        CHROMAPRINT_DIR="/tmp/chromaprint-${CHROMAPRINT_VERSION}"
        
        if [ ! -d "$CHROMAPRINT_DIR" ]; then
            cd /tmp
            wget -q "https://github.com/acoustid/chromaprint/releases/download/v${CHROMAPRINT_VERSION}/chromaprint-${CHROMAPRINT_VERSION}.tar.gz" -O chromaprint.tar.gz
            if [ $? -eq 0 ]; then
                tar -xzf chromaprint.tar.gz
                cd chromaprint-${CHROMAPRINT_VERSION}
                cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_TOOLS=ON .
                make -j$(nproc)
                make install
                ldconfig
                cd /
                rm -rf "$CHROMAPRINT_DIR" chromaprint.tar.gz
                echo -e "${GREEN}✓ chromaprint installato da source${NC}"
            else
                echo -e "${YELLOW}⚠ Impossibile scaricare chromaprint da source${NC}"
                echo -e "${YELLOW}  Il riconoscimento audio fingerprint sarà limitato${NC}"
                echo -e "${YELLOW}  Per installarlo manualmente:${NC}"
                echo -e "${YELLOW}    - Abilita repository universe: add-apt-repository universe && apt-get update${NC}"
                echo -e "${YELLOW}    - Poi: apt-get install libchromaprint-tools${NC}"
            fi
        fi
    fi
else
    echo -e "${GREEN}✓ chromaprint già installato${NC}"
fi

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

# 2.5. Aggiorna variabili d'ambiente se necessario
echo -e "\n${YELLOW}2.5. Aggiornamento variabili d'ambiente...${NC}"
if [ -f "$REPO_DIR/scripts/lxc-update-env.sh" ]; then
    chmod +x "$REPO_DIR/scripts/lxc-update-env.sh"
    "$REPO_DIR/scripts/lxc-update-env.sh" || echo -e "${YELLOW}⚠ Errore aggiornamento env (potrebbe essere già aggiornato)${NC}"
else
    echo -e "${YELLOW}⚠ Script lxc-update-env.sh non trovato, skip${NC}"
fi

# 2.6. Esegui migration database
echo -e "\n${YELLOW}2.6. Esecuzione migration database...${NC}"
cd "$ALEFY_HOME/backend"
MIGRATION_OUTPUT=$(run_as_user "$ALEFY_USER" npm run migrate 2>&1)
MIGRATION_EXIT=$?
if [ $MIGRATION_EXIT -eq 0 ]; then
    echo -e "${GREEN}✓ Migration completate${NC}"
    echo "$MIGRATION_OUTPUT" | grep -i "migration\|error\|warning" || true
else
    echo -e "${YELLOW}⚠ Output migration:${NC}"
    echo "$MIGRATION_OUTPUT"
    echo -e "${YELLOW}⚠ Errore durante migration (potrebbero essere già eseguite)${NC}"
fi

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

# Verifica API health
echo -e "\n${YELLOW}6. Verifica API...${NC}"
sleep 3
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API risponde correttamente${NC}"
    # Test endpoint stats
    if curl -s http://localhost:3000/api/stats > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Endpoint /api/stats disponibile${NC}"
    else
        echo -e "${YELLOW}⚠ Endpoint /api/stats potrebbe richiedere autenticazione${NC}"
    fi
else
    echo -e "${RED}✗ API non risponde${NC}"
    echo -e "${YELLOW}Controlla i log: journalctl -u alefy -n 50${NC}"
fi

echo -e "\n${GREEN}=== Aggiornamento completato! ===${NC}"
echo -e "\n${YELLOW}Comandi utili:${NC}"
echo -e "  Status: systemctl status alefy"
echo -e "  Log: journalctl -u alefy -f"
echo -e "  Test API: curl http://localhost:3000/api/health"
echo -e "  Test Frontend: curl -I http://localhost/"

