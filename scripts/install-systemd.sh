#!/bin/bash
# ALEFY - Installa servizio systemd per avvio automatico al reboot
set -e

cd "$(dirname "$0")/.."
ROOT="$PWD"

SERVICE_FILE="/etc/systemd/system/alefy.service"

echo "[Systemd] Creazione $SERVICE_FILE"
echo "  WorkingDirectory=$ROOT"
echo ""

ENV_LINE=""
[[ -f "$ROOT/.env" ]] && ENV_LINE="EnvironmentFile=$ROOT/.env"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ALEFY Music Streaming
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$ROOT
$ENV_LINE
ExecStart=$(command -v npm) run serve
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable alefy
systemctl start alefy

echo ""
echo "[Systemd] Servizio alefy installato e avviato."
echo "  Comandi: systemctl status alefy | stop alefy | restart alefy"
