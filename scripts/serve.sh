#!/bin/bash
# ALEFY - Avvio con npm run serve
# Singola porta 3000, hot-reload backend e frontend
set -e

cd "$(dirname "$0")/.."
ROOT="$PWD"

# Setup al primo avvio
if [[ ! -f "$ROOT/.alefy-initialized" ]]; then
  "$ROOT/scripts/setup.sh"
fi

# Carica npm se non in PATH
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

# Carica .env
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a

# Build frontend iniziale prima di avviare (il backend controlla dist/ al caricamento)
echo "[Serve] Build frontend..."
(cd "$ROOT/frontend" && npx vite build)

# Libera porte occupate
kill_port() {
  local port=$1
  local pid
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    echo "[Serve] Terminando processo $pid sulla porta $port..."
    kill $pid 2>/dev/null || kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
}
kill_port 3000
kill_port 5173

echo ""
echo "=== ALEFY ==="
echo "  http://localhost:3000"
echo ""
# Avvia backend prima, poi frontend watch (evita race: vite watch svuota dist all'avvio)
npm run serve:backend &
BACKEND_PID=$!
sleep 3
npm run serve:frontend &
FRONTEND_PID=$!
wait $BACKEND_PID $FRONTEND_PID
