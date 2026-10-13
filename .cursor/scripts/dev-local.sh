#!/usr/bin/env bash
# Sobe Postgres (host), API e frontend (Vite) para teste local / Cloud Agent.
# O frontend usa proxy /api → API; não defina VITE_API_URL=http://localhost:3333
# ao acessar por URL remota (o navegador chamaria a sua máquina, não a VM).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMUX="${TMUX_CMD:-tmux -f /exec-daemon/tmux.portal.conf}"

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "PostgreSQL client não encontrado." >&2
  exit 1
fi

sudo service postgresql start 2>/dev/null || true
until pg_isready -h 127.0.0.1 -U sgp -q 2>/dev/null; do
  sleep 1
done

export DATABASE_URL="${DATABASE_URL:-postgresql://sgp:sgp@127.0.0.1:5432/sgp?schema=public}"
export JWT_SECRET="${JWT_SECRET:-troque-este-segredo-em-producao}"
export SMTP_ENABLED="${SMTP_ENABLED:-false}"
export NODE_ENV=development
export API_PORT=3333

cd "$ROOT/backend"
npx prisma migrate deploy >/dev/null

start_tmux() {
  local name="$1"
  local cmd="$2"
  if $TMUX has-session -t "$name" 2>/dev/null; then
    $TMUX send-keys -t "$name" C-c
    sleep 1
  else
    $TMUX new-session -d -s "$name" -c "$ROOT"
  fi
  $TMUX send-keys -t "$name" "$cmd" C-m
}

start_tmux sgp-api "cd $ROOT/backend && export DATABASE_URL JWT_SECRET SMTP_ENABLED NODE_ENV API_PORT && npm run dev"
start_tmux sgp-frontend "cd $ROOT/frontend && npm run dev -- --host 0.0.0.0 --port 8080"

for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "SGP pronto: http://127.0.0.1:8080 (health: /api/health)"
    exit 0
  fi
  sleep 1
done

echo "Serviços iniciados, mas /api/health ainda não respondeu. Veja tmux sgp-api e sgp-frontend." >&2
exit 1
