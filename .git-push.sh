#!/bin/bash
# Script per push automatico su GitHub

cd "$(dirname "$0")"

# Colori per output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Preparazione push su GitHub...${NC}"

# Verifica che ci siano modifiche da committare
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Trovate modifiche non committate.${NC}"
    read -p "Messaggio per il commit (premi Invio per messaggio automatico): " commit_msg
    if [ -z "$commit_msg" ]; then
        commit_msg="Auto-commit: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    git add -A
    git commit -m "$commit_msg"
    echo -e "${GREEN}✓ Commit creato${NC}"
fi

# Verifica se ci sono commit da pushare
if [ -z "$(git log origin/main..main 2>/dev/null)" ] && [ -z "$(git log main..origin/main 2>/dev/null)" ]; then
    echo -e "${YELLOW}Nessun commit da pushare.${NC}"
    exit 0
fi

# Esegui il push
echo -e "${YELLOW}Eseguo push su GitHub...${NC}"
if git push origin main 2>&1; then
    echo -e "${GREEN}✓ Push completato con successo!${NC}"
    exit 0
else
    echo -e "${RED}✗ Errore durante il push.${NC}"
    echo -e "${YELLOW}Se è la prima volta, potrebbe essere necessario:${NC}"
    echo -e "  1. Configurare un token GitHub: https://github.com/settings/tokens"
    echo -e "  2. Usare: git push origin main"
    echo -e "  3. Inserire username e token come password"
    exit 1
fi
