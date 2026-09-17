#!/usr/bin/env bash
# Confirm the supplied records are untouched and remind how to reset the demo.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/api"
uv run python -c "from app.records import cached_records; r = cached_records(); print('Supplied records untouched, sha256:', r.sha256); print('Case:', r.case_id)"
echo "Reset the running demo with the 'Reset demo' button (or reload the page)."
