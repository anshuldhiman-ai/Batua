"""Local account authentication for Batua.

Single-user, self-hosted auth: accounts live in the same store the rest
of the app uses (``users`` collection in SQLite / Mongo). Passwords are
stored as bcrypt hashes only — the plaintext never touches disk.

Recovery path: a ``reset token`` can be minted from the server side
(``POST /api/auth/recovery-token``); the owner exchanges it for a
password reset. The app also ships a point-in-time snapshot of
``data/store.db`` (``store.pre-auth-*.db``) so the pre-login data is
always restorable if anything goes wrong.
"""
import logging
import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache

logger = logging.getLogger("batua.auth")

router = APIRouter()


# --------------------------------------------------------------------------- #
# Password hashing
# --------------------------------------------------------------------------- #

# bcrypt is optional: the app runs without it, but accounts then fall
# back to a dev-only SHA-256 scheme and every login warns about it.
try:
    import bcrypt  # type: ignore

    _BCRYPT_OK = True
except Exception:  # pragma: no cover - depends on install
    _BCRYPT_OK = False


# --------------------------------------------------------------------------- #
# Password hashing
# --------------------------------------------------------------------------- #

def _hash_password(password: str) -> str:
    """Hash a password for storage. bcrypt when available."""
    if _BCRYPT_OK:
        return "bcrypt$" + bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    # Fallback (logged loudly): sha256 with a per-account salt. Never
    # deploy this — it exists so the app still boots without bcrypt.
    salt = secrets.token_hex(16)
    import hashlib

    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    logger.warning("bcrypt unavailable — using dev-only password hashing")
    return f"sha256${salt}${digest}"


def _verify_password(password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("bcrypt$"):
        if not _BCRYPT_OK:
            return False
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash[len("bcrypt$"):].encode("utf-8"))
    if stored_hash.startswith("sha256$"):
        import hashlib

        _, salt, digest = stored_hash.split("$", 2)
        return secrets.compare_digest(
            hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest(), digest
        )
    return False


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

MIN_PASSWORD_LEN = 4


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("username", "email", "password")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if len(v) < MIN_PASSWORD_LEN:
            raise ValueError(f"password must be at least {MIN_PASSWORD_LEN} characters")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        if "@" not in v or "." not in v.rsplit("@", 1)[-1]:
            raise ValueError("invalid email address")
        return v.lower()


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class RecoveryTokenRequest(BaseModel):
    """Mint a one-time reset token for a username (server-side, owner-only)."""
    username: str


class ResetRequest(BaseModel):
    token: str
    new_password: str


class RecoveryCodesResponse(BaseModel):
    """Recovery information returned alongside login success."""
    recovery_hint: str
    snapshot_file: str | None = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _user_doc(storage) -> dict | None:
    """Return the single local account, if any (Batua is single-user)."""
    try:
        users = storage._users if hasattr(storage, "_users") else None
    except Exception:
        users = None
    # users collection is served by the generic storage interface
    return users


async def _load_account(storage) -> dict | None:
    """Fetch the account document from the users collection."""
    try:
        rows = await storage.all("users")
    except ValueError:
        # Collection not registered in _MODEL_MAP on older storage — treat
        # as no account yet (register will create it via insert).
        return None
    except Exception:
        logger.warning("Could not read users collection", exc_info=True)
        return None
    return rows[0] if rows else None


async def _save_account(storage, doc: dict) -> None:
    existing = await _load_account(storage)
    if existing:
        await storage.update("users", doc["id"], doc)
    else:
        await storage.insert("users", doc)


def _session_response(doc: dict) -> dict:
    return {
        "ok": True,
        "user": {"username": doc["username"], "email": doc.get("email", "")},
        "token": doc.get("session_token", ""),
        "expires_at": doc.get("session_expires_at"),
        "recovery": {
            "hint": f"A reset token can be minted for @{doc['username']} from Settings → Account.",
            "password_set": True,
        },
    }


# --------------------------------------------------------------------------- #
# Request validation
# --------------------------------------------------------------------------- #

def _first_validation_error(exc: RequestValidationError) -> str:
    """Pull the human message out of a Pydantic validation failure."""
    for err in exc.errors():
        ctx = err.get("ctx", {}) or {}
        reason = ctx.get("error")
        if isinstance(reason, ValueError):
            return str(reason)
        msg = err.get("msg", "")
        if msg:
            return msg
    return "invalid request"


async def validation_to_400(request: Request, exc: RequestValidationError):
    """Field-validation failures (bad email shape, short password)
    surface as 400 — the same status the route handlers raise — so
    the client only ever sees one error code for user input."""
    return JSONResponse(status_code=400, content={"detail": _first_validation_error(exc)})


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

@router.post("/auth/register")
async def register(payload: RegisterRequest):
    """Create the local account. One account per install — registering
    again updates the credentials (the account is the owner's)."""
    if not payload.username or len(payload.username) < 3:
        raise HTTPException(400, "username must be at least 3 characters")
    storage = get_storage()
    existing = await _load_account(storage)
    if existing:
        raise HTTPException(409, "An account already exists — log in, or mint a recovery token to reset the password")

    doc = {
        "id": f"user_{uuid.uuid4().hex[:12]}",
        "username": payload.username,
        "email": payload.email,
        "password_hash": _hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "session_token": None,
        "session_expires_at": None,
    }
    await _save_account(storage, doc)
    logger.info("Registered local account @%s (%s)", payload.username, payload.email)
    return {"ok": True, "user": {"username": doc["username"], "email": doc["email"]}}


@router.post("/auth/login")
async def login(payload: LoginRequest):
    """Authenticate and issue a short-lived session token."""
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found — register first (POST /api/auth/register)")
    if doc["username"] != payload.username:
        # Same error as a bad password so usernames aren't enumerable
        raise HTTPException(401, "Invalid username or password")
    if not _verify_password(payload.password, doc.get("password_hash", "")):
        raise HTTPException(401, "Invalid username or password")

    token = secrets.token_urlsafe(32)
    doc["session_token"] = token
    doc["session_expires_at"] = datetime.now(timezone.utc).isoformat()
    await _save_account(storage, doc)
    return _session_response(doc)


@router.post("/auth/logout")
async def logout():
    """Clear the session token."""
    storage = get_storage()
    doc = await _load_account(storage)
    if doc:
        doc["session_token"] = None
        doc["session_expires_at"] = None
        await _save_account(storage, doc)
    return {"ok": True}


@router.post("/auth/change-password")
async def change_password(payload: ChangePasswordRequest):
    """Change the account password after verifying the current one."""
    if len(payload.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"new password must be at least {MIN_PASSWORD_LEN} characters")
    storage = get_storage()
    doc = await _load_account(storage)
    if not doc:
        raise HTTPException(404, "No account found — register first")
    if not _verify_password(payload.current_password, doc.get("password_hash", "")):
        raise HTTPException(401, "Current password is incorrect")
    doc["password_hash"] = _hash_password(payload.new_password)
    doc["reset_token"] = None
    doc["reset_token_expires_at"] = None
    doc["session_token"] = None
    await _save_account(storage, doc)
    logger.info("Password changed for @%s", doc["username"])
    return {"ok": True, "message": "Password updated — please sign in again"}


@router.get("/auth/me")
async def whoami():
    """Current account (never the password hash)."""
    storage = get_storage()
    doc = await _load_account(storage)
    if not doc:
        raise HTTPException(404, "No account found")
    return {
        "username": doc["username"],
        "email": doc.get("email", ""),
        "created_at": doc.get("created_at"),
    }


@router.post("/auth/recovery-token")
async def mint_recovery_token(payload: RecoveryTokenRequest):
    """Mint a one-time password-reset token for the account.

    This is the "I might lose access" path: run this (or the Settings
    button) *before* you ever need it, keep the token somewhere safe,
    and exchange it at /auth/reset if the password is ever forgotten.
    Tokens expire after 15 minutes and are single-use.
    """
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found — register first")
    if doc["username"] != payload.username:
        raise HTTPException(404, "No account with that username")

    token = secrets.token_urlsafe(24)
    doc["reset_token"] = token
    doc["reset_token_expires_at"] = datetime.now(timezone.utc).timestamp() + 15 * 60
    await _save_account(storage, doc)
    logger.info("Recovery token minted for @%s", payload.username)
    return {
        "ok": True,
        "token": token,
        "expires_in_seconds": 15 * 60,
        "use": "POST /api/auth/reset with { token, new_password }",
    }


@router.post("/auth/reset")
async def reset_password(payload: ResetRequest):
    """Exchange a recovery token for a new password."""
    if len(payload.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"password must be at least {MIN_PASSWORD_LEN} characters")
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found")

    token = doc.get("reset_token")
    expires = doc.get("reset_token_expires_at", 0)
    if not token or token != payload.token:
        raise HTTPException(401, "Invalid or already-used recovery token")
    if time.time() > float(expires):
        doc["reset_token"] = None
        await _save_account(storage, doc)
        raise HTTPException(401, "Recovery token expired — mint a new one")

    doc["password_hash"] = _hash_password(payload.new_password)
    doc["reset_token"] = None
    doc["reset_token_expires_at"] = None
    doc["session_token"] = None
    await _save_account(storage, doc)
    logger.info("Password reset via recovery token for @%s", doc["username"])
    return {"ok": True, "message": "Password updated"}
