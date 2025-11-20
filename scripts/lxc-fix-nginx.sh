#!/bin/bash
# Script per correggere problemi di redirect infinito in Nginx
# Eseguire come root

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="${DOMAIN:-alevale.iliadboxos.it}"

echo -e "${YELLOW}=== Correzione configurazione Nginx ===${NC}\n"

# Backup configurazione esistente
if [ -f /etc/nginx/sites-available/alefy ]; then
    cp /etc/nginx/sites-available/alefy /etc/nginx/sites-available/alefy.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✓ Backup configurazione creato${NC}"
fi

# Verifica se esiste configurazione HTTPS (da Certbot)
if grep -q "listen 443" /etc/nginx/sites-available/alefy 2>/dev/null; then
    echo -e "${YELLOW}Configurazione HTTPS trovata, verifica...${NC}"
    
    # Verifica che non ci siano redirect infiniti
    if grep -q "return 301 http" /etc/nginx/sites-available/alefy; then
        echo -e "${RED}✗ Trovato redirect HTTP nel blocco HTTPS (problema!)${NC}"
        echo -e "${YELLOW}Rimuovo redirect problematico...${NC}"
        sed -i '/return 301 http/d' /etc/nginx/sites-available/alefy
    fi
else
    echo -e "${YELLOW}Configurazione HTTPS non trovata, creo configurazione base...${NC}"
    
    # Crea configurazione HTTP senza redirect (per ora)
    cat > /etc/nginx/sites-available/alefy <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # Frontend static files
    root /var/www/alefy;
    index index.html;

    # Logging
    access_log /var/log/nginx/alefy-access.log;
    error_log /var/log/nginx/alefy-error.log;

    # MIME types (importante per CSS e altri file statici)
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types 
        text/plain 
        text/css 
        text/xml 
        text/javascript 
        application/x-javascript 
        application/xml+rss 
        application/json 
        application/javascript
        application/x-font-ttf
        application/vnd.ms-fontobject
        font/opentype
        image/svg+xml
        image/x-icon;

    # File statici (CSS, JS, immagini) - DEVE venire PRIMA di location /
    location ~* ^/assets/.*\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot|json)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # Altri file statici nella root
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot|json)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # Frontend routing (SPA) - DEVE venire DOPO le location per file statici
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout per upload grandi
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        client_max_body_size 500M;
    }

    # Streaming audio
    location /api/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF
fi

# Test configurazione
echo -e "\n${YELLOW}Test configurazione Nginx...${NC}"
if nginx -t; then
    echo -e "${GREEN}✓ Configurazione valida${NC}"
    
    # Riavvia Nginx
    echo -e "\n${YELLOW}Riavvio Nginx...${NC}"
    systemctl reload nginx
    echo -e "${GREEN}✓ Nginx riavviato${NC}"
else
    echo -e "${RED}✗ Errore nella configurazione Nginx${NC}"
    echo -e "${YELLOW}Controlla i log:${NC}"
    echo -e "  nginx -t"
    exit 1
fi

# Verifica servizio backend
echo -e "\n${YELLOW}Verifica servizio backend...${NC}"
if systemctl is-active --quiet alefy; then
    echo -e "${GREEN}✓ Backend attivo${NC}"
else
    echo -e "${RED}✗ Backend non attivo${NC}"
    echo -e "${YELLOW}Avvio backend...${NC}"
    systemctl start alefy
    sleep 2
    if systemctl is-active --quiet alefy; then
        echo -e "${GREEN}✓ Backend avviato${NC}"
    else
        echo -e "${RED}✗ Errore avvio backend, controlla i log:${NC}"
        echo -e "  journalctl -u alefy -n 50"
    fi
fi

# Verifica frontend
echo -e "\n${YELLOW}Verifica frontend...${NC}"
if [ -f /var/www/alefy/index.html ]; then
    echo -e "${GREEN}✓ Frontend presente${NC}"
else
    echo -e "${RED}✗ Frontend non trovato in /var/www/alefy/${NC}"
fi

# Test connessione
echo -e "\n${YELLOW}Test connessione...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200\|404"; then
    echo -e "${GREEN}✓ Server risponde correttamente${NC}"
else
    echo -e "${YELLOW}⚠ Verifica manuale necessaria${NC}"
fi

echo -e "\n${GREEN}=== Correzione completata! ===${NC}"
echo -e "\n${YELLOW}Se il problema persiste:${NC}"
echo -e "  1. Verifica configurazione: cat /etc/nginx/sites-available/alefy"
echo -e "  2. Controlla log Nginx: tail -f /var/log/nginx/alefy-error.log"
echo -e "  3. Controlla log backend: journalctl -u alefy -f"
echo -e "  4. Test configurazione: nginx -t"
echo -e "\n${YELLOW}Per configurare SSL correttamente:${NC}"
echo -e "  certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email valerio@free-ware.it"

