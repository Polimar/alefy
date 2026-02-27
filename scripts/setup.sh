#!/bin/bash
# ALEFY - Setup iniziale (PostgreSQL, yt-dlp, FFmpeg, npm deps, migrate, seed)
# Richiamato da serve.sh al primo avvio
set -e

cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "[Setup] ALEFY - Primo avvio"
echo ""

# Carica Node/npm se non in PATH
if ! command -v npm &>/dev/null; then
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    source "$HOME/.nvm/nvm.sh"
  elif [[ -s "/usr/share/nvm/nvm.sh" ]]; then
    source /usr/share/nvm/nvm.sh
  elif [[ -d "$HOME/.fnm" ]]; then
    eval "$(fnm env)"
  fi
  export PATH="/usr/local/bin:/usr/bin:$HOME/.local/bin:$PATH"
fi

if ! command -v npm &>/dev/null; then
  echo "Errore: npm non trovato."
  echo "Installa Node.js 20+:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  echo "  apt-get install -y nodejs"
  exit 1
fi

# .env
if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/env.example" "$ROOT/.env"
  echo "[Setup] .env creato da env.example"
fi
set -a
source "$ROOT/.env" 2>/dev/null || true
set +a

# PostgreSQL
install_postgres() {
  echo "[Setup] Installazione PostgreSQL..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y postgresql postgresql-contrib
  systemctl start postgresql 2>/dev/null || service postgresql start
  systemctl enable postgresql 2>/dev/null || true
}

pg_ok() { pg_isready -h localhost -p 5432 -q 2>/dev/null || nc -z localhost 5432 2>/dev/null; }

if ! command -v psql &>/dev/null; then
  install_postgres
fi

if ! pg_ok; then
  echo "[Setup] Avvio PostgreSQL..."
  systemctl start postgresql 2>/dev/null || service postgresql start 2>/dev/null || true
  sleep 2
fi

if ! pg_ok; then
  echo "Errore: PostgreSQL non disponibile su localhost:5432"
  exit 1
fi

# Crea utente e database se non esistono
PG_USER="${POSTGRES_USER:-alefy}"
PG_PASS="${POSTGRES_PASSWORD:-La_F3ss4_d3_Mamm3ta}"
PG_DB="${POSTGRES_DB:-alefy_db}"

runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" 2>/dev/null | grep -q 1 || \
  runuser -u postgres -- psql -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASS';"

runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" 2>/dev/null | grep -q 1 || \
  runuser -u postgres -- psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"

# yt-dlp
if ! command -v yt-dlp &>/dev/null; then
  echo "[Setup] Installazione yt-dlp..."
  apt-get update -qq
  apt-get install -y yt-dlp
fi
YTDLP_ACTUAL=$(which yt-dlp 2>/dev/null || true)
if [[ -n "$YTDLP_ACTUAL" ]] && [[ -f "$ROOT/.env" ]] && grep -q "^YTDLP_PATH=" "$ROOT/.env"; then
  sed -i "s|^YTDLP_PATH=.*|YTDLP_PATH=$YTDLP_ACTUAL|" "$ROOT/.env"
  echo "[Setup] YTDLP_PATH aggiornato a $YTDLP_ACTUAL"
fi

# FFmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "[Setup] Installazione FFmpeg..."
  apt-get update -qq
  apt-get install -y ffmpeg
fi

# Storage: crea directory e migra da backend/storage se esiste
STORAGE_ABSOLUTE="$ROOT/storage"
mkdir -p "$STORAGE_ABSOLUTE"

if [[ -d "$ROOT/backend/storage" ]]; then
  echo "[Setup] Migrazione storage da backend/storage..."
  cp -a "$ROOT/backend/storage"/. "$STORAGE_ABSOLUTE/" 2>/dev/null || true
  rm -rf "$ROOT/backend/storage"
  echo "[Setup] Migrazione completata"
fi

# Aggiorna STORAGE_PATH nel .env con path assoluto
if grep -q "^STORAGE_PATH=" "$ROOT/.env"; then
  sed -i "s|^STORAGE_PATH=.*|STORAGE_PATH=$STORAGE_ABSOLUTE|" "$ROOT/.env"
else
  echo "STORAGE_PATH=$STORAGE_ABSOLUTE" >> "$ROOT/.env"
fi

# npm install
echo "[Setup] Installazione dipendenze npm..."
cd "$ROOT/backend"
npm install
cd "$ROOT/frontend"
npm install
cd "$ROOT"
npm install

# Migrate e seed
echo "[Setup] Migrazioni database e seed..."
cd "$ROOT/backend"
npm run migrate
npm run seed

# Build frontend iniziale (serve.sh aspetta frontend/dist)
echo "[Setup] Build frontend iniziale..."
cd "$ROOT/frontend"
npm run build

# Marker di inizializzazione
touch "$ROOT/.alefy-initialized"
echo ""
echo "[Setup] Completato. ALEFY pronto."
