#!/bin/bash
# Script per aggiornare il servizio systemd alefy con FRONTEND_STATIC_PATH

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"

echo -e "${YELLOW}=== Aggiornamento servizio systemd alefy ===${NC}\n"

# Backup del servizio esistente
if [ -f "/etc/systemd/system/alefy.service" ]; then
    echo -e "${YELLOW}Backup servizio esistente...${NC}"
    cp /etc/systemd/system/alefy.service /etc/systemd/system/alefy.service.backup.$(date +%Y%m%d_%H%M%S)
fi

# Aggiorna il servizio con FRONTEND_STATIC_PATH
echo -e "${YELLOW}Aggiornamento servizio...${NC}"
cat > /etc/systemd/system/alefy.service <<EOF
[Unit]
Description=ALEFY Backend API Server
Documentation=https://github.com/Polimar/alefy
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$ALEFY_USER
Group=$ALEFY_USER
WorkingDirectory=$ALEFY_HOME/backend
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="FRONTEND_STATIC_PATH=/var/www/alefy"
EnvironmentFile=$ALEFY_HOME/backend/.env

# Comando di avvio
ExecStart=/usr/bin/node src/index.js

# Restart policy
Restart=always
RestartSec=10
StartLimitInterval=200
StartLimitBurst=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=alefy

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$ALEFY_HOME/storage $ALEFY_HOME/logs

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Servizio aggiornato${NC}"

# Ricarica systemd
echo -e "${YELLOW}Ricarica systemd...${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓ Systemd ricaricato${NC}"

# Riavvia il servizio
echo -e "${YELLOW}Riavvio servizio...${NC}"
systemctl restart alefy
sleep 2

# Verifica
if systemctl is-active --quiet alefy; then
    echo -e "${GREEN}✓ Servizio attivo${NC}"
    echo ""
    echo -e "${YELLOW}Variabili ambiente:${NC}"
    systemctl show alefy | grep -E "(NODE_ENV|PORT|FRONTEND_STATIC_PATH)"
else
    echo -e "${RED}✗ Servizio non attivo${NC}"
    echo -e "${YELLOW}Log:${NC}"
    journalctl -u alefy -n 20 --no-pager
    exit 1
fi

echo ""
echo -e "${GREEN}=== Completato! ===${NC}"
echo ""
echo "Test:"
echo "  curl http://localhost:3000/api/health"
echo "  curl http://localhost:3000/"

