"""Root proxy package to allow uvicorn app.main:app to run from the root directory."""
import os
import sys

_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend"))
if not os.path.isdir(_backend_dir):
    _backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))

if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

_backend_app = os.path.join(_backend_dir, "app")
__path__ = [_backend_app]
