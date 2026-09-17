#!/usr/bin/env bash
# Start both services (FastAPI on :8000, Next.js on :3000).
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/api"
uv sync --quiet
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!

cd "$ROOT/web"
[ -d node_modules ] || npm install
NEXT_DIST_DIR=.next-dev npm run dev &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM EXIT
wait
