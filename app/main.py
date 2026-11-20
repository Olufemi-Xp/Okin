"""Root proxy entrypoint for uvicorn app.main:app."""
import os
import sys

_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend"))
if not os.path.isdir(_backend_dir):
    _backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))

if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from backend.app.main import app, lifespan
