"""Mobile bootstrap: programmatic uvicorn entry point for Chaquopy.

Called from Kotlin (via Chaquopy's Python.callAttr) on a background thread
to start the FastAPI server on 127.0.0.1 inside the Android app process.

Kotlin passes a config dict with mobile-appropriate env vars since Android's
ART runtime doesn't support java.lang.ProcessEnvironment for setting env vars.
"""
import os
import sys
import logging
from pathlib import Path
from typing import Optional

# Ensure the backend package directory is on sys.path
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

_Host = "127.0.0.1"
_Port = 8001
_started = False


def start_server(config: Optional[dict] = None) -> None:
    """Start uvicorn on a background thread. Called once from Kotlin.

    Args:
        config: Optional dict of env var overrides passed from Kotlin
                (since setting env vars from Java on Android ART is unreliable).
    """
    global _started, _Port
    if _started:
        logging.getLogger("batua.mobile").warning("Server already started, skipping")
        return
    _started = True

    # Apply config from Kotlin
    if config:
        for key, value in config.items():
            os.environ[key] = str(value)

    _Port = int(os.environ.get("MOBILE_PORT", "8001"))

    logger = logging.getLogger("batua.mobile")
    logger.info("Starting Batua server on %s:%s", _Host, _Port)

    # Now safe to import server — env vars are set
    import uvicorn
    from server import app

    uvicorn.run(
        app,
        host=_Host,
        port=_Port,
        log_level="info",
        reload=False,
    )


def stop_server() -> None:
    """Graceful shutdown hook (called from Kotlin on app destroy)."""
    global _started
    _started = False
    logger = logging.getLogger("batua.mobile")
    logger.info("Batua server stopped")
