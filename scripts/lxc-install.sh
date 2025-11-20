#!/bin/bash
# Script di installazione Alefy su Proxmox LXC
# Eseguire come root o con sudo

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variabili configurazione
ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"
ALEFY_REPO_URL="https://github.com/Polimar/alefy.git"
NODE_VERSION="20"
POSTGRES_USER="alefy"
POSTGRES_DB="alefy_db"
DOMAIN="${DOMAIN:-alevale.iliadboxos.it}"
EMAIL="${EMAIL:-valerio@free-ware.it}"

echo -e "${GREEN}=== Installazione Alefy su LXC ===${NC}"

# Verifica che lo script sia eseguito come root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Errore: Questo script deve essere eseguito come root${NC}"
    exit 1
fi

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

# Rileva distribuzione
if [ -f /etc/debian_version ]; then
    DISTRO="debian"
    if grep -q "bookworm\|bullseye" /etc/debian_version 2>/dev/null || grep -q "Debian GNU/Linux 12\|Debian GNU/Linux 11" /etc/os-release 2>/dev/null; then
        DEBIAN_VERSION=$(grep VERSION_ID /etc/os-release | cut -d'"' -f2)
    fi
elif [ -f /etc/lsb-release ]; then
    DISTRO="ubuntu"
    UBUNTU_VERSION=$(grep DISTRIB_RELEASE /etc/lsb-release | cut -d'=' -f2)
else
    echo -e "${RED}Distribuzione non supportata. Richiesto Debian o Ubuntu.${NC}"
    exit 1
fi

echo -e "${YELLOW}Distribuzione rilevata: ${DISTRO}${NC}"

# Aggiornamento sistema
echo -e "${YELLOW}Aggiornamento sistema...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y

# Installazione dipendenze base
echo -e "${YELLOW}Installazione dipendenze base...${NC}"
apt-get install -y \
    curl \
    git \
    wget \
    build-essential \
    ffmpeg \
    python3 \
    python3-pip \
    nginx \
    postgresql \
    postgresql-contrib \
    certbot \
    python3-certbot-nginx \
    ufw

# Installazione Node.js 20.x
echo -e "${YELLOW}Installazione Node.js ${NODE_VERSION}.x...${NC}"
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "$NODE_VERSION" ]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

echo -e "${GREEN}Node.js $(node -v) installato${NC}"
echo -e "${GREEN}npm $(npm -v) installato${NC}"

# Installazione yt-dlp
echo -e "${YELLOW}Installazione yt-dlp...${NC}"
if ! command -v yt-dlp &> /dev/null; then
    pip3 install --break-system-packages yt-dlp
    # Crea symlink per compatibilità
    if [ ! -f /usr/local/bin/yt-dlp ]; then
        ln -s $(which yt-dlp) /usr/local/bin/yt-dlp 2>/dev/null || true
    fi
fi

# Creazione utente alefy
echo -e "${YELLOW}Creazione utente ${ALEFY_USER}...${NC}"
if ! id "$ALEFY_USER" &>/dev/null; then
    useradd -r -m -d "$ALEFY_HOME" -s /bin/bash "$ALEFY_USER"
    echo -e "${GREEN}Utente ${ALEFY_USER} creato${NC}"
else
    echo -e "${YELLOW}Utente ${ALEFY_USER} già esistente${NC}"
fi

# Creazione directory
echo -e "${YELLOW}Creazione directory...${NC}"
mkdir -p "$ALEFY_HOME"
mkdir -p "$ALEFY_HOME/storage"
mkdir -p "$ALEFY_HOME/logs"
chown -R "$ALEFY_USER:$ALEFY_USER" "$ALEFY_HOME"

# Clone repository
echo -e "${YELLOW}Clone repository...${NC}"
if [ ! -d "$ALEFY_HOME/backend" ]; then
    run_as_user "$ALEFY_USER" git clone "$ALEFY_REPO_URL" "$ALEFY_HOME/repo"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/backend" "$ALEFY_HOME/"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/frontend" "$ALEFY_HOME/"
else
    echo -e "${YELLOW}Directory backend già esistente, aggiornamento...${NC}"
    cd "$ALEFY_HOME/repo" && run_as_user "$ALEFY_USER" git pull
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/backend" "$ALEFY_HOME/"
    run_as_user "$ALEFY_USER" cp -r "$ALEFY_HOME/repo/frontend" "$ALEFY_HOME/"
fi

# Setup PostgreSQL
echo -e "${YELLOW}Setup PostgreSQL...${NC}"
systemctl start postgresql
systemctl enable postgresql

# Genera password PostgreSQL se non esiste
if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
fi

# Crea utente e database PostgreSQL
run_as_user postgres psql <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$POSTGRES_USER') THEN
        CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';
    END IF;
END
\$\$;
ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';
SELECT 'CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB')\gexec
GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
EOF

echo -e "${GREEN}Database PostgreSQL configurato${NC}"

# Genera JWT secrets se non esistono
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
fi
if [ -z "$JWT_REFRESH_SECRET" ]; then
    JWT_REFRESH_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
fi

# Setup Backend
echo -e "${YELLOW}Setup Backend...${NC}"
cd "$ALEFY_HOME/backend"

# Crea file .env
cat > .env <<EOF
# Database
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB

# JWT
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
NODE_ENV=production
PORT=3000
API_URL=http://localhost:3000
FRONTEND_URL=https://$DOMAIN
DOMAIN=$DOMAIN

# Storage
STORAGE_PATH=$ALEFY_HOME/storage
UPLOAD_MAX_SIZE=500MB

# FFmpeg
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# YouTube Download
YTDLP_PATH=/usr/bin/yt-dlp

# MusicBrainz API (opzionale)
MUSICBRAINZ_USER_AGENT=ALEFY/1.0.0

# CORS
CORS_ORIGIN=https://$DOMAIN

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

chown "$ALEFY_USER:$ALEFY_USER" .env
chmod 600 .env

# Installazione dipendenze backend
echo -e "${YELLOW}Installazione dipendenze backend...${NC}"
if [ -f "$ALEFY_HOME/backend/package-lock.json" ]; then
    run_as_user "$ALEFY_USER" npm ci --omit=dev
else
    run_as_user "$ALEFY_USER" npm install --omit=dev
fi

# Esecuzione migrazioni
echo -e "${YELLOW}Esecuzione migrazioni database...${NC}"
run_as_user "$ALEFY_USER" npm run migrate

# Creazione utente admin
echo -e "${YELLOW}Creazione utente admin...${NC}"
run_as_user "$ALEFY_USER" npm run seed

# Setup Frontend
echo -e "${YELLOW}Setup Frontend...${NC}"
cd "$ALEFY_HOME/frontend"

# Crea file .env.production
cat > .env.production <<EOF
VITE_API_URL=https://$DOMAIN/api
EOF

chown "$ALEFY_USER:$ALEFY_USER" .env.production

# Installazione dipendenze frontend
echo -e "${YELLOW}Installazione dipendenze frontend...${NC}"
if [ -f "$ALEFY_HOME/frontend/package-lock.json" ]; then
    run_as_user "$ALEFY_USER" npm ci
else
    run_as_user "$ALEFY_USER" npm install
fi

# Build frontend
echo -e "${YELLOW}Build frontend...${NC}"
run_as_user "$ALEFY_USER" npm run build

# Copia build in directory Nginx
mkdir -p /var/www/alefy
cp -r dist/* /var/www/alefy/
chown -R www-data:www-data /var/www/alefy

# Setup Systemd service
echo -e "${YELLOW}Setup servizio Systemd...${NC}"
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
systemctl start alefy

echo -e "${GREEN}Servizio Systemd configurato e avviato${NC}"

# Setup Nginx
echo -e "${YELLOW}Setup Nginx...${NC}"
cat > /etc/nginx/sites-available/alefy <<'NGINX_EOF'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # Redirect HTTP to HTTPS (dopo setup SSL)
    # return 301 https://$host$request_uri;

    # Frontend static files
    root /var/www/alefy;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Frontend routing (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout per upload grandi
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        client_max_body_size 500M;
    }

    # Streaming audio
    location /api/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
    }
}
NGINX_EOF

# Sostituisci il dominio se specificato
if [ "$DOMAIN" != "_" ]; then
    sed -i "s/server_name _;/server_name $DOMAIN;/g" /etc/nginx/sites-available/alefy
fi

# Abilita sito
ln -sf /etc/nginx/sites-available/alefy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test configurazione Nginx
nginx -t

# Riavvia Nginx
systemctl restart nginx
systemctl enable nginx

echo -e "${GREEN}Nginx configurato${NC}"

# Setup firewall (opzionale)
echo -e "${YELLOW}Configurazione firewall...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable || true
fi

# Setup SSL con Certbot (opzionale, richiede dominio valido)
if [ "$DOMAIN" != "_" ] && [ -n "$EMAIL" ]; then
    echo -e "${YELLOW}Setup SSL con Let's Encrypt...${NC}"
    echo -e "${YELLOW}Assicurati che il dominio $DOMAIN punti a questo server prima di continuare${NC}"
    read -p "Procedere con setup SSL? (s/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        # Modifica Nginx per permettere certificazione
        sed -i 's/# return 301/return 301/g' /etc/nginx/sites-available/alefy || true
        systemctl reload nginx
        
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" || {
            echo -e "${YELLOW}Certbot fallito. Puoi eseguirlo manualmente più tardi con:${NC}"
            echo -e "certbot --nginx -d $DOMAIN"
        }
    fi
fi

# Riepilogo
echo -e "${GREEN}=== Installazione completata! ===${NC}"
echo -e "${GREEN}Backend:${NC} http://localhost:3000"
echo -e "${GREEN}Frontend:${NC} http://$(hostname -I | awk '{print $1}')"
if [ "$DOMAIN" != "_" ]; then
    echo -e "${GREEN}URL pubblico:${NC} https://$DOMAIN"
fi
echo ""
echo -e "${YELLOW}Credenziali database salvate in:${NC} $ALEFY_HOME/backend/.env"
echo -e "${YELLOW}Credenziali admin di default:${NC}"
echo -e "  Email: valerio@free-ware.it"
echo -e "  Password: La_F3ss4_d3_Mamm3ta"
echo ""
echo -e "${YELLOW}Comandi utili:${NC}"
echo -e "  Status backend: systemctl status alefy"
echo -e "  Log backend: journalctl -u alefy -f"
echo -e "  Riavvia backend: systemctl restart alefy"
echo -e "  Status Nginx: systemctl status nginx"
echo -e "  Test Nginx: nginx -t"


