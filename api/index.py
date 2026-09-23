"""Vercel serverless entrypoint for the C04 deterministic API.

Vercel turns every ``.py`` file under ``api/`` into a function, so this is the only
Python file here; the package lives in ``backend/app`` and is bundled because the
Python runtime ships the whole repository (minus node_modules, .next, .venv, …).

The FastAPI app is mounted under ``/api/py`` because Vercel hands the function the
original request path (``/api/py/reconcile``), not the rewritten one.  The inner app
keeps its bare routes (``/reconcile``) so the tests and local uvicorn are unchanged.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi import FastAPI  # noqa: E402

from app.main import app as workflow  # noqa: E402

app = FastAPI(title="Octopus C04", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api/py", workflow)
