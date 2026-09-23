#!/usr/bin/env bash
# Start both services: FastAPI (mounted at /api/py) on :8000, Next.js on :3000.
# next.config.mjs rewrites /api/py/* to :8000 in development; on Vercel the same
# path is served by the api/index.py function, so the browser code never changes.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

uv sync --quiet --project backend
uv run --project backend uvicorn api.index:app --host 127.0.0.1 --port 8000 &
API_PID=$!

[ -d node_modules ] || npm install
NEXT_DIST_DIR=.next-dev npm run dev &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM EXIT
wait
