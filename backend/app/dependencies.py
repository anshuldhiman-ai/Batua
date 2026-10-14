"""Dependencies for route modules."""
import secrets
from typing import Optional

# Global storage reference - set during startup
_storage = None


def get_storage():
    """Dependency to get the storage instance."""
    if _storage is None:
        raise RuntimeError("Storage not initialized")
    return _storage


def set_storage(storage):
    """Set the global storage instance (called during startup)."""
    global _storage
    _storage = storage


# --------------------------------------------------------------------------- #
# Session-token enforcement
# --------------------------------------------------------------------------- #

# When BATUA_DEV=1 (or BATUA_AUTH_DISABLE=1), the session middleware
# lets every request through. This exists ONLY so the local dev server
# and the test suite (which drive routes without logging in first)
# keep working; production deploys must leave it off.
import os  # noqa: E402

_AUTH_DISABLED = (
    os.environ.get("BATUA_AUTH_DISABLE", "").strip().lower() in ("1", "true", "yes")
    or os.environ.get("BATUA_DEV", "0") == "1"
)

# Paths that are reachable without a session. Everything else under
# /api requires a valid Bearer token.
#
# The allowlist is per-path, NOT a blanket "/api/auth*" prefix:
# the auth module also hosts session-log routes (session/open,
# session/close, logout, me, sessions, login-history) that
# write to the account or expose account data. Leaving those
# under the prefix exemption let any caller pollute the
# session log or sign the owner out. Only the flow itself
# (register/login/recovery/reset) and health probes stay open.
_PUBLIC_PATHS = {
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/recovery-token",
    "/api/auth/reset",
}


def _is_public_path(path: str) -> bool:
    """Health probes and the auth flow stay open; everything else
    requires a session. GET /api and GET /api/ready are the only
    non-auth paths that don't start with /api/auth."""
    if path in _PUBLIC_PATHS:
        return True
    if path in ("/api", "/api/", "/api/ready"):
        return True
    if path == "/api/openapi.json":
        return True
    return False


async def verify_session_token(request) -> Optional[dict]:
    """Validate the request's Bearer token against the account.

    Returns the account doc on success, None on failure. The token
    is compared in constant time so a forged token can't be probed
    byte-by-byte. When no account exists yet (first run), everything
    is open until register creates one — otherwise the frontend
    couldn't reach the register screen.
    """
    if _AUTH_DISABLED:
        return {}
    if request.method == "OPTIONS":
        # CORS preflight — no session possible yet.
        return {}

    from app.dependencies import get_storage
    from app.routes.auth import _load_account

    path = request.url.path
    if _is_public_path(path):
        return {}

    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        # No account exists — first run, allow until registered.
        return {}

    expected = doc.get("session_token")
    if not expected:
        # Account exists but has no open session — reject.
        return None

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    presented = header[len("Bearer "):].strip()
    if not presented:
        return None
    if not secrets.compare_digest(presented, expected):
        return None
    return doc
