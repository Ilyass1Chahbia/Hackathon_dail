"""Vercel serverless entrypoint for the C04 deterministic API.

Root Directory for this Vercel project: ``api``.
The ASGI application lives in ``app.main:app``; this module only re-exports it so the
platform has a file it recognises as the entrypoint.

Everything the app needs is inside this directory (``app/`` and ``source/``), and the
supplied records are resolved relative to ``app/records.py`` via ``__file__`` — never
from the repository root or the process working directory.
"""

from app.main import app  # noqa: F401  (Vercel looks for an ASGI/WSGI `app`)

__all__ = ["app"]
