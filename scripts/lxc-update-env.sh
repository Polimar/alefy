#!/bin/bash
# Script per aggiornare le variabili d'ambiente nel container LXC
# Eseguire come root nel container
# Uso: ./scripts/lxc-update-env.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_USER="alefy"
ALEFY_HOME="/opt/alefy"
ENV_FILE="$ALEFY_HOME/backend/.env"

echo -e "${YELLOW}=== Aggiornamento variabili d'ambiente ===${NC}\n"

# Verifica che il file .env esista
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗ File .env non trovato in $ENV_FILE${NC}"
    echo -e "${YELLOW}Eseguire prima lxc-install.sh${NC}"
    exit 1
fi

# Funzione per aggiungere o aggiornare una variabile nel .env
update_env_var() {
    local key=$1
    local value=$2
    
    if grep -q "^${key}=" "$ENV_FILE"; then
        # Variabile esistente, aggiorna
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        else
            # Linux
            sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        fi
        echo -e "${GREEN}✓ Aggiornata ${key}${NC}"
    else
        # Variabile non esistente, aggiungi
        echo "${key}=${value}" >> "$ENV_FILE"
        echo -e "${GREEN}✓ Aggiunta ${key}${NC}"
    fi
}

# Aggiorna/aggiungi API keys
echo -e "${YELLOW}Aggiornamento API keys...${NC}"
update_env_var "LASTFM_API_KEY" "155937c90c65c12774b9c5f9784b1d90"
update_env_var "ACOUSTID_API_KEY" "fDqV1xMrc5"

# Aggiorna/aggiungi configurazione batch metadata
echo -e "\n${YELLOW}Aggiornamento configurazione batch metadata...${NC}"
update_env_var "METADATA_BATCH_INTERVAL" "24"
update_env_var "METADATA_BATCH_BATCH_SIZE" "10"
update_env_var "METADATA_BATCH_RATE_LIMIT_MS" "6000"

# Aggiorna DOMAIN e FRONTEND_URL se DOMAIN è passato come variabile d'ambiente
if [ -n "$DOMAIN" ]; then
    echo -e "\n${YELLOW}Aggiornamento DOMAIN e FRONTEND_URL...${NC}"
    update_env_var "DOMAIN" "$DOMAIN"
    # Costruisci FRONTEND_URL basato su DOMAIN
    FRONTEND_URL_VALUE="https://${DOMAIN}"
    update_env_var "FRONTEND_URL" "$FRONTEND_URL_VALUE"
    echo -e "${GREEN}✓ DOMAIN impostato a: ${DOMAIN}${NC}"
    echo -e "${GREEN}✓ FRONTEND_URL impostato a: ${FRONTEND_URL_VALUE}${NC}"
fi

# Assicura permessi corretti
chown "$ALEFY_USER:$ALEFY_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo -e "\n${GREEN}=== Variabili d'ambiente aggiornate! ===${NC}"
echo -e "\n${YELLOW}Riavvia il servizio per applicare le modifiche:${NC}"
echo -e "  systemctl restart alefy"


