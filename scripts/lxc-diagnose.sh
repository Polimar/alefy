#!/bin/bash
# Script di diagnostica e correzione per Alefy su LXC
# Eseguire come root

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"
ALEFY_REPO_URL="https://github.com/Polimar/alefy.git"
DOMAIN="${DOMAIN:-alevale.iliadboxos.it}"

echo -e "${YELLOW}=== Diagnostica Alefy ===${NC}\n"

# Funzione helper per eseguire comandi come utente (funziona anche come root)
run_as_user() {
    local user=$1
    shift
    if command -v runuser &> /dev/null; then
        runuser -u "$user" -- "$@"
    else
        # Usa su con bash per eseguire il comando
        local cmd="$*"
        su -s /bin/bash "$user" -c "$cmd"
    fi
}

# Verifica utente
echo -e "${YELLOW}1. Verifica utente ${ALEFY_USER}...${NC}"
if id "$ALEFY_USER" &>/dev/null; then
    echo -e "${GREEN}✓ Utente esistente${NC}"
else
    echo -e "${RED}✗ Utente non trovato, creazione...${NC}"
    useradd -r -m -d "$ALEFY_HOME" -s /bin/bash "$ALEFY_USER"
    echo -e "${GREEN}✓ Utente creato${NC}"
fi

# Verifica Node.js
echo -e "\n${YELLOW}2. Verifica Node.js...${NC}"
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓ Node.js $(node -v) installato${NC}"
else
    echo -e "${RED}✗ Node.js non trovato, installazione...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo -e "${GREEN}✓ Node.js installato${NC}"
fi

# Verifica directory
echo -e "\n${YELLOW}3. Verifica directory...${NC}"
if [ ! -d "$ALEFY_HOME" ]; then
    echo -e "${RED}✗ Directory $ALEFY_HOME non trovata, creazione...${NC}"
    mkdir -p "$ALEFY_HOME"
    mkdir -p "$ALEFY_HOME/storage"
    mkdir -p "$ALEFY_HOME/logs"
    chown -R "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME"
    echo -e "${GREEN}✓ Directory create${NC}"
else
    echo -e "${GREEN}✓ Directory esistente${NC}"
fi

# Verifica repository
echo -e "\n${YELLOW}4. Verifica repository...${NC}"
if [ ! -d "$ALEFY_HOME/repo" ]; then
    echo -e "${RED}✗ Repository non trovato, clone...${NC}"
    run_as_user "$ALEFY_USER" git clone "$ALEFY_REPO_URL" "$ALEFY_HOME/repo"
    echo -e "${GREEN}✓ Repository clonato${NC}"
else
    echo -e "${YELLOW}Repository esistente, aggiornamento...${NC}"
    cd "$ALEFY_HOME/repo" && run_as_user "$ALEFY_USER" git pull
    echo -e "${GREEN}✓ Repository aggiornato${NC}"
fi

# Copia backend e frontend
echo -e "\n${YELLOW}5. Copia backend e frontend...${NC}"
if [ ! -d "$ALEFY_HOME/backend" ]; then
    echo -e "${RED}✗ Backend non trovato, copia...${NC}"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/backend" "$ALEFY_HOME/"
    echo -e "${GREEN}✓ Backend copiato${NC}"
else
    echo -e "${YELLOW}Backend esistente, aggiornamento...${NC}"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/backend" "$ALEFY_HOME/"
    echo -e "${GREEN}✓ Backend aggiornato${NC}"
fi

if [ ! -d "$ALEFY_HOME/frontend" ]; then
    echo -e "${RED}✗ Frontend non trovato, copia...${NC}"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/frontend" "$ALEFY_HOME/"
    echo -e "${GREEN}✓ Frontend copiato${NC}"
else
    echo -e "${YELLOW}Frontend esistente, aggiornamento...${NC}"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/frontend" "$ALEFY_HOME/"
    echo -e "${GREEN}✓ Frontend aggiornato${NC}"
fi

# Verifica .env backend
echo -e "\n${YELLOW}6. Verifica configurazione backend...${NC}"
if [ ! -f "$ALEFY_HOME/backend/.env" ]; then
    echo -e "${RED}✗ File .env non trovato, creazione...${NC}"
    
    # Leggi password PostgreSQL esistente o genera nuova
    if run_as_user postgres psql -tAc "SELECT 1 FROM pg_user WHERE usename='alefy'" | grep -q 1; then
        echo -e "${YELLOW}Utente PostgreSQL esistente, recupero password...${NC}"
        POSTGRES_PASSWORD=$(run_as_user postgres psql -tAc "SELECT passwd FROM pg_shadow WHERE usename='alefy'" 2>/dev/null || echo "")
        if [ -z "$POSTGRES_PASSWORD" ]; then
            POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
            run_as_user postgres psql -c "ALTER USER alefy WITH PASSWORD '$POSTGRES_PASSWORD';"
        fi
    else
        POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
        run_as_user postgres psql <<EOF
CREATE USER alefy WITH PASSWORD '$POSTGRES_PASSWORD';
CREATE DATABASE alefy_db OWNER alefy;
GRANT ALL PRIVILEGES ON DATABASE alefy_db TO alefy;
EOF
    fi
    
    JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    JWT_REFRESH_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    
    cat > "$ALEFY_HOME/backend/.env" <<EOF
POSTGRES_USER=alefy
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=alefy_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgresql://alefy:$POSTGRES_PASSWORD@localhost:5432/alefy_db

JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

NODE_ENV=production
PORT=3000
API_URL=http://localhost:3000
FRONTEND_URL=https://$DOMAIN
DOMAIN=$DOMAIN

STORAGE_PATH=$ALEFY_HOME/storage
UPLOAD_MAX_SIZE=500MB

FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
YTDLP_PATH=/usr/bin/yt-dlp

MUSICBRAINZ_USER_AGENT=ALEFY/1.0.0
CORS_ORIGIN=https://$DOMAIN

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
    
    chown "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME/backend/.env"
    chmod 600 "$ALEFY_HOME/backend/.env"
    echo -e "${GREEN}✓ File .env creato${NC}"
else
    echo -e "${GREEN}✓ File .env esistente${NC}"
fi

# Installazione dipendenze backend
echo -e "\n${YELLOW}7. Installazione dipendenze backend...${NC}"
cd "$ALEFY_HOME/backend"
if [ ! -d "node_modules" ]; then
    echo -e "${RED}✗ Dipendenze non installate, installazione...${NC}"
    if [ -f "package-lock.json" ]; then
        run_as_user "$ALEFY_USER" npm ci --omit=dev
    else
        run_as_user "$ALEFY_USER" npm install --omit=dev
    fi
    echo -e "${GREEN}✓ Dipendenze installate${NC}"
else
    echo -e "${YELLOW}Dipendenze esistenti, aggiornamento...${NC}"
    if [ -f "package-lock.json" ]; then
        run_as_user "$ALEFY_USER" npm ci --omit=dev
    else
        run_as_user "$ALEFY_USER" npm install --omit=dev
    fi
    echo -e "${GREEN}✓ Dipendenze aggiornate${NC}"
fi

# Esecuzione migrazioni
echo -e "\n${YELLOW}8. Esecuzione migrazioni database...${NC}"
run_as_user "$ALEFY_USER" npm run migrate || echo -e "${YELLOW}⚠ Migrazioni già eseguite o errore (verificare manualmente)${NC}"

# Seed database
echo -e "\n${YELLOW}9. Verifica seed database...${NC}"
run_as_user "$ALEFY_USER" npm run seed || echo -e "${YELLOW}⚠ Seed già eseguito o errore${NC}"

# Setup frontend
echo -e "\n${YELLOW}10. Setup frontend...${NC}"
cd "$ALEFY_HOME/frontend"

# Crea .env.production
cat > .env.production <<EOF
VITE_API_URL=https://$DOMAIN/api
EOF
chown "$ALEFY_USER:$ALEFY_USER" .env.production

# Installazione dipendenze frontend
if [ ! -d "node_modules" ]; then
    echo -e "${RED}✗ Dipendenze frontend non installate...${NC}"
    if [ -f "package-lock.json" ]; then
        run_as_user "$ALEFY_USER" npm ci
    else
        run_as_user "$ALEFY_USER" npm install
    fi
    echo -e "${GREEN}✓ Dipendenze installate${NC}"
else
    echo -e "${YELLOW}Dipendenze esistenti, aggiornamento...${NC}"
    if [ -f "package-lock.json" ]; then
        run_as_user "$ALEFY_USER" npm ci
    else
        run_as_user "$ALEFY_USER" npm install
    fi
    echo -e "${GREEN}✓ Dipendenze aggiornate${NC}"
fi

# Build frontend
echo -e "\n${YELLOW}11. Build frontend...${NC}"
run_as_user "$ALEFY_USER" npm run build

# Copia build
echo -e "\n${YELLOW}12. Copia build frontend...${NC}"
mkdir -p /var/www/alefy
cp -r dist/* /var/www/alefy/
chown -R www-data:www-data /var/www/alefy
echo -e "${GREEN}✓ Build copiata${NC}"

# Setup servizio Systemd
echo -e "\n${YELLOW}13. Setup servizio Systemd...${NC}"
cat > /etc/systemd/system/alefy.service <<EOF
[Unit]
Description=ALEFY Backend API Server
After=network.target postgresql.service

[Service]
Type=simple
User=$ALEFY_USER
WorkingDirectory=$ALEFY_HOME/backend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=alefy

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable alefy
systemctl restart alefy

echo -e "${GREEN}✓ Servizio Systemd configurato e avviato${NC}"

# Verifica servizio
echo -e "\n${YELLOW}14. Verifica servizio...${NC}"
sleep 2
if systemctl is-active --quiet alefy; then
    echo -e "${GREEN}✓ Servizio alefy attivo${NC}"
else
    echo -e "${RED}✗ Servizio alefy non attivo, controlla i log:${NC}"
    echo -e "  journalctl -u alefy -n 50"
fi

# Riepilogo
echo -e "\n${GREEN}=== Diagnostica completata! ===${NC}"
echo -e "\n${YELLOW}Comandi utili:${NC}"
echo -e "  Status: systemctl status alefy"
echo -e "  Log: journalctl -u alefy -f"
echo -e "  Riavvia: systemctl restart alefy"
echo -e "  Test API: curl http://localhost:3000/api/health"
echo -e "\n${YELLOW}Verifica frontend:${NC}"
echo -e "  ls -la /var/www/alefy/"
echo -e "  curl http://localhost/"

