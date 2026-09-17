#!/usr/bin/env bash
# Install Python deps and run the deterministic test suite.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../api"
uv sync --quiet
uv run pytest
