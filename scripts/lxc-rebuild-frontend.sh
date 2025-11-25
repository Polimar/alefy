#!/bin/bash
# Script per ricostruire il frontend
# Eseguire come root
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

echo -e "${YELLOW}=== Ricostruzione Frontend ===${NC}\n"

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

# Verifica che il frontend esista
if [ ! -d "$ALEFY_HOME/frontend" ]; then
    echo -e "${RED}✗ Directory frontend non trovata${NC}"
    exit 1
fi

# Aggiorna repository e copia frontend
echo -e "${YELLOW}Aggiornamento repository...${NC}"
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

# Copia frontend aggiornato
echo -e "\n${YELLOW}Copia frontend aggiornato...${NC}"
# Rimuovi vecchia directory se esiste
if [ -d "$ALEFY_HOME/frontend" ]; then
    chown -R "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME/frontend" 2>/dev/null || true
fi
cp -r "$REPO_DIR/frontend"/* "$ALEFY_HOME/frontend/"
chown -R "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME/frontend"
echo -e "${GREEN}✓ Frontend copiato${NC}"

# Vai nella directory frontend
cd "$ALEFY_HOME/frontend"

# Assicura che la directory appartenga all'utente alefy
chown -R "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME/frontend" 2>/dev/null || true

# Crea/aggiorna .env.production
# Nota: DOMAIN dovrebbe essere il FQDN pubblico gestito da Nginx Proxy Manager (es. alefy.duckdns.org)
echo -e "\n${YELLOW}Configurazione ambiente...${NC}"
cat > .env.production <<EOF
VITE_API_URL=https://$DOMAIN/api
EOF
chown "$ALEFY_USER:$ALEFY_USER" .env.production
echo -e "${GREEN}✓ File .env.production configurato con dominio: $DOMAIN${NC}"

# Installa dipendenze se necessario
echo -e "\n${YELLOW}Verifica dipendenze...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installazione dipendenze...${NC}"
    if [ -f "package-lock.json" ]; then
        run_as_user "$ALEFY_USER" npm ci
    else
        run_as_user "$ALEFY_USER" npm install
    fi
    echo -e "${GREEN}✓ Dipendenze installate${NC}"
else
    echo -e "${GREEN}✓ Dipendenze presenti${NC}"
fi

# Pulisci build precedente
echo -e "\n${YELLOW}Pulizia build precedente...${NC}"
if [ -d "dist" ]; then
    # Cambia proprietario se necessario e rimuovi
    chown -R "$ALEFY_USER:$ALEFY_USER" dist 2>/dev/null || true
    run_as_user "$ALEFY_USER" rm -rf dist || rm -rf dist
    echo -e "${GREEN}✓ Build precedente rimossa${NC}"
fi

# Build frontend
echo -e "\n${YELLOW}Build frontend...${NC}"
run_as_user "$ALEFY_USER" npm run build

# Verifica che il build sia stato creato
if [ ! -d "dist" ]; then
    echo -e "${RED}✗ Errore: directory dist non creata${NC}"
    exit 1
fi

# Verifica che ci siano file CSS
CSS_COUNT=$(find dist -name "*.css" | wc -l)
if [ "$CSS_COUNT" -eq 0 ]; then
    echo -e "${RED}✗ Errore: nessun file CSS trovato nel build${NC}"
    echo -e "${YELLOW}Contenuto directory dist:${NC}"
    ls -la dist/
    exit 1
else
    echo -e "${GREEN}✓ Trovati $CSS_COUNT file CSS${NC}"
fi

# Copia build in directory web
echo -e "\n${YELLOW}Copia build in /var/www/alefy...${NC}"
mkdir -p /var/www/alefy
rm -rf /var/www/alefy/*
cp -r dist/* /var/www/alefy/
chown -R www-data:www-data /var/www/alefy

# Verifica permessi
echo -e "\n${YELLOW}Verifica permessi...${NC}"
chmod -R 755 /var/www/alefy
echo -e "${GREEN}✓ Permessi configurati${NC}"

# Lista file CSS copiati
echo -e "\n${YELLOW}File CSS copiati:${NC}"
find /var/www/alefy -name "*.css" -exec ls -lh {} \;

echo -e "\n${GREEN}=== Ricostruzione completata! ===${NC}"
echo -e "\n${YELLOW}Nota:${NC} Frontend servito tramite Nginx Proxy Manager esterno"
echo -e "\n${YELLOW}Verifica:${NC}"
echo -e "  - File CSS: ls -lh /var/www/alefy/assets/*.css"
echo -e "  - Test locale: curl -I http://localhost/assets/index-*.css"

