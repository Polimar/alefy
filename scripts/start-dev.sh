#!/bin/bash
# ALEFY - Avvio ambiente di sviluppo
# Uso: ./scripts/start-dev.sh (dalla root del progetto)
set -e

cd "$(dirname "$0")/.."
ROOT="$PWD"

# Carica Node/npm se non in PATH
if ! command -v npm &>/dev/null; then
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    source "$HOME/.nvm/nvm.sh"
  elif [[ -s "/usr/share/nvm/nvm.sh" ]]; then
    source /usr/share/nvm/nvm.sh
  elif [[ -d "$HOME/.fnm" ]]; then
    eval "$(fnm env)"
  fi
  # Prova anche PATH comuni
  export PATH="/usr/local/bin:/usr/bin:$HOME/.local/bin:$PATH"
fi

if ! command -v npm &>/dev/null; then
  echo "Errore: npm non trovato."
  echo "Come root:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  echo "  apt-get install -y nodejs"
  exit 1
fi

# .env
if [[ ! -f .env ]]; then
  cp env.example .env
  echo "[OK] .env creato da env.example"
fi
set -a
source "$ROOT/.env" 2>/dev/null || true
set +a

# PostgreSQL
install_postgres() {
  echo "[PostgreSQL] Installazione..."
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
  echo "[PostgreSQL] Avvio servizio..."
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

# Backend
echo "[1/4] Backend: install, migrate, seed..."
cd "$ROOT/backend"
npm install
npm run migrate
npm run seed

# Frontend
echo "[2/4] Frontend: install..."
cd "$ROOT/frontend"
npm install

# Root deps (concurrently)
cd "$ROOT"
npm install

# Avvia backend e frontend in parallelo
echo "[3/4] Avvio backend (:3000) e frontend (:5173)..."
echo ""
echo "=== ALEFY ==="
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3000"
echo ""
npx concurrently "cd backend && npm run dev" "cd frontend && npm run dev"
