#!/bin/bash
# Installa dipendenze per metadati (fingerprint AcoustID + Shazam)
# Eseguire come root nel container LXC
# Uso: ./scripts/install-metadata-deps.sh
# Se l'app è in /tmp/alefy: ALEFY_HOME=/tmp/alefy ./scripts/install-metadata-deps.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Se non impostato: in repo (scripts/../backend) usa la root del repo, altrimenti /opt/alefy
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${ALEFY_HOME}" ]; then
    if [ -d "${SCRIPT_DIR}/../backend" ]; then
        ALEFY_HOME="$(cd "${SCRIPT_DIR}/.." && pwd)"
    else
        ALEFY_HOME="/opt/alefy"
    fi
fi
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

# 2. Python 3 + venv (necessario per ShazamIO)
echo -e "${YELLOW}2. Verifica Python 3 e python3-venv...${NC}"
if ! command -v python3 &>/dev/null; then
    apt-get update -qq
    apt-get install -y python3 python3-pip python3-venv
    echo -e "${GREEN}✓ Python 3 installato${NC}"
else
    echo -e "${GREEN}✓ Python 3 già installato: $(python3 --version)${NC}"
fi
# python3-venv: su Debian/Ubuntu recenti può essere python3.XX-venv
if ! python3 -c "import venv" 2>/dev/null; then
    echo -e "${YELLOW}Installazione python3-venv...${NC}"
    apt-get update -qq
    PYVER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "3")
    if apt-get install -y "python${PYVER}-venv" 2>/dev/null; then
        echo -e "${GREEN}✓ python${PYVER}-venv installato${NC}"
    elif apt-get install -y python3-venv 2>/dev/null; then
        echo -e "${GREEN}✓ python3-venv installato${NC}"
    else
        echo -e "${YELLOW}⚠ Prova: apt-get install python3.13-venv (o python${PYVER}-venv)${NC}"
    fi
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
        # Rimuovi venv corrotto da tentativi precedenti falliti
        if [ -d "$SHAZAM_VENV" ] && ! "${SHAZAM_VENV}/bin/python3" -c "import venv" 2>/dev/null; then
            echo -e "${YELLOW}  Rimozione virtualenv incompleto...${NC}"
            rm -rf "$SHAZAM_VENV"
        fi
        if [ ! -d "$SHAZAM_VENV" ]; then
            echo -e "${YELLOW}Creazione virtualenv per ShazamIO in ${SHAZAM_VENV}...${NC}"
            mkdir -p "$(dirname "$SHAZAM_VENV")"
            python3 -m venv "$SHAZAM_VENV" || {
                echo -e "${RED}✗ Creazione venv fallita. Installa: apt install python3.13-venv${NC}"
                exit 1
            }
        fi
        "${SHAZAM_VENV}/bin/pip" install --upgrade pip
        "${SHAZAM_VENV}/bin/pip" install shazamio
        
        # Permessi: il backend gira spesso come utente alefy
        chown -R "${ALEFY_USER}:${ALEFY_USER}" "$SHAZAM_VENV" 2>/dev/null || true
        
        # Copia script e aggiorna shebang se non presente in ALEFY_HOME
        mkdir -p "${ALEFY_HOME}/scripts"
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        REPO_SCRIPT="${SCRIPT_DIR}/shazam_recognize.py"
        if [ -f "$REPO_SCRIPT" ]; then
            cp -f "$REPO_SCRIPT" "$SHAZAM_SCRIPT"
        fi
        if [ -f "$SHAZAM_SCRIPT" ]; then
            sed -i "1s|^#!.*|#!${SHAZAM_VENV}/bin/python3|" "$SHAZAM_SCRIPT"
            chmod +x "$SHAZAM_SCRIPT"
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
    if [ -d "$SHAZAM_VENV" ]; then
        echo -e "${YELLOW}  Prova: rm -rf ${SHAZAM_VENV} e riesegui lo script${NC}"
    fi
fi

echo -e "\n${GREEN}=== Installazione completata ===${NC}"
echo -e "Riavvia il backend: ${YELLOW}systemctl restart alefy${NC}"
