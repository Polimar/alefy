#!/bin/bash
# Installa dipendenze per metadati (fingerprint AcoustID + Shazam)
# Eseguire come root nel container LXC
# Uso: ./scripts/install-metadata-deps.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ALEFY_HOME="${ALEFY_HOME:-/opt/alefy}"
ALEFY_USER="${ALEFY_USER:-alefy}"

echo -e "${YELLOW}=== Installazione dipendenze metadati (chromaprint + ShazamIO) ===${NC}\n"

# 1. Chromaprint (fpcalc) - per fingerprint audio AcoustID
echo -e "${YELLOW}1. Verifica chromaprint (fpcalc)...${NC}"
if command -v fpcalc &>/dev/null || command -v chromaprint &>/dev/null; then
    echo -e "${GREEN}✓ chromaprint già installato: $(command -v fpcalc 2>/dev/null || command -v chromaprint 2>/dev/null)${NC}"
else
    echo -e "${YELLOW}Installazione chromaprint...${NC}"
    
    # Abilita universe (Ubuntu) se disponibile
    if command -v add-apt-repository &>/dev/null; then
        add-apt-repository -y universe 2>/dev/null || true
    fi
    
    apt-get update -qq
    
    if apt-get install -y libchromaprint-tools 2>/dev/null; then
        echo -e "${GREEN}✓ chromaprint installato (libchromaprint-tools)${NC}"
    elif apt-get install -y chromaprint-tools 2>/dev/null; then
        echo -e "${GREEN}✓ chromaprint installato (chromaprint-tools)${NC}"
    elif apt-get install -y chromaprint 2>/dev/null; then
        echo -e "${GREEN}✓ chromaprint installato (chromaprint)${NC}"
    else
        echo -e "${YELLOW}⚠ chromaprint non nei repository, compilazione da source...${NC}"
        apt-get install -y build-essential cmake libavcodec-dev libavformat-dev libavutil-dev libavresample-dev
        
        CHROMAPRINT_VERSION="1.5.1"
        cd /tmp
        wget -q "https://github.com/acoustid/chromaprint/releases/download/v${CHROMAPRINT_VERSION}/chromaprint-${CHROMAPRINT_VERSION}.tar.gz" -O chromaprint.tar.gz
        tar -xzf chromaprint.tar.gz
        cd chromaprint-${CHROMAPRINT_VERSION}
        cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_TOOLS=ON .
        make -j$(nproc)
        make install
        ldconfig
        cd /
        rm -rf "/tmp/chromaprint-${CHROMAPRINT_VERSION}" chromaprint.tar.gz
        echo -e "${GREEN}✓ chromaprint installato da source${NC}"
    fi
fi

# Verifica fpcalc
if ! command -v fpcalc &>/dev/null; then
    echo -e "${RED}✗ fpcalc non trovato dopo installazione. Verifica: which fpcalc${NC}"
    exit 1
fi
echo -e "${GREEN}✓ fpcalc: $(fpcalc -version 2>/dev/null || fpcalc 2>&1 | head -1)${NC}\n"

# 2. Python 3
echo -e "${YELLOW}2. Verifica Python 3...${NC}"
if ! command -v python3 &>/dev/null; then
    apt-get update -qq
    apt-get install -y python3 python3-pip python3-venv
    echo -e "${GREEN}✓ Python 3 installato${NC}"
else
    echo -e "${GREEN}✓ Python 3 già installato: $(python3 --version)${NC}"
fi

# 3. ShazamIO
echo -e "${YELLOW}3. Verifica ShazamIO...${NC}"
SHAZAM_VENV="${ALEFY_HOME}/shazam_venv"
SHAZAM_SCRIPT="${ALEFY_HOME}/scripts/shazam_recognize.py"

if python3 -c "import shazamio" 2>/dev/null; then
    echo -e "${GREEN}✓ ShazamIO già installato (sistema)${NC}"
elif [ -f "${SHAZAM_VENV}/bin/python3" ] && "${SHAZAM_VENV}/bin/python3" -c "import shazamio" 2>/dev/null; then
    echo -e "${GREEN}✓ ShazamIO già installato (virtualenv)${NC}"
else
    echo -e "${YELLOW}Installazione ShazamIO...${NC}"
    
    # Prova pip3 globale (--break-system-packages per Debian/Ubuntu recenti)
    if pip3 install --break-system-packages shazamio 2>/dev/null; then
        echo -e "${GREEN}✓ ShazamIO installato (pip globale)${NC}"
    else
        # Fallback: virtualenv dedicato
        echo -e "${YELLOW}Creazione virtualenv per ShazamIO in ${SHAZAM_VENV}...${NC}"
        mkdir -p "$(dirname "$SHAZAM_VENV")"
        python3 -m venv "$SHAZAM_VENV"
        "${SHAZAM_VENV}/bin/pip" install --upgrade pip
        "${SHAZAM_VENV}/bin/pip" install shazamio
        
        # Aggiorna shebang dello script se esiste
        if [ -f "$SHAZAM_SCRIPT" ]; then
            sed -i "1s|^#!/usr/bin/env python3|#!${SHAZAM_VENV}/bin/python3|" "$SHAZAM_SCRIPT"
            chown "${ALEFY_USER}:${ALEFY_USER}" "$SHAZAM_SCRIPT" 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ ShazamIO installato in virtualenv${NC}"
    fi
fi

# Verifica finale
echo -e "\n${YELLOW}4. Verifica finale...${NC}"
if command -v fpcalc &>/dev/null; then
    echo -e "${GREEN}✓ fpcalc OK${NC}"
else
    echo -e "${RED}✗ fpcalc non trovato${NC}"
fi

PYTHON_CMD="python3"
if [ -f "${SHAZAM_VENV}/bin/python3" ]; then
    PYTHON_CMD="${SHAZAM_VENV}/bin/python3"
fi
if $PYTHON_CMD -c "import shazamio" 2>/dev/null; then
    echo -e "${GREEN}✓ ShazamIO OK${NC}"
else
    echo -e "${RED}✗ ShazamIO non disponibile${NC}"
fi

echo -e "\n${GREEN}=== Installazione completata ===${NC}"
echo -e "Riavvia il backend: ${YELLOW}systemctl restart alefy${NC}"
