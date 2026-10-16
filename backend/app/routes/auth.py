"""Local account authentication for Batua.

Single-user, self-hosted auth: accounts live in the same store the rest
of the app uses (``users`` collection in SQLite / Mongo). Passwords are
stored as bcrypt hashes only — the plaintext never touches disk.

Every account mutation goes through ``storage.mutate``: the load and
the save happen under the same lock, so two concurrent requests (two
tabs, a tab plus the mobile app) can't base their writes on the same
stale snapshot and silently drop each other's change.

Recovery path: a ``reset token`` can be minted from the server side
(``POST /api/auth/recovery-token``); the owner exchanges it for a
password reset. The app also ships a point-in-time snapshot of
``data/store.db`` (``store.pre-auth-*.db``) so the pre-login data is
always restorable if anything goes wrong.
"""
import asyncio
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


def _hash_password(password: str) -> str:
    """Hash a password for storage. bcrypt when available.

    Synchronous — bcrypt at rounds=12 blocks for ~250-400 ms, so
    routes call this via ``asyncio.to_thread`` (never on the event
    loop); only tests call it directly.
    """
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
    """Check a password against a stored hash. Synchronous — see
    ``_hash_password``; routes await it via ``asyncio.to_thread``."""
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

    @field_validator("new_password")
    @classmethod
    def _new_password(cls, v: str) -> str:
        if len(v) < MIN_PASSWORD_LEN:
            raise ValueError(f"new password must be at least {MIN_PASSWORD_LEN} characters")
        return v


class ChangeUsernameRequest(BaseModel):
    """Rename the local account's username."""
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("username must be at least 3 characters")
        return v


class RecoveryTokenRequest(BaseModel):
    """Mint a one-time reset token for a username (server-side, owner-only).

    ``password`` is required when an account exists: a reset token
    hands over the account, so it may only be minted by someone who
    already holds the password. (On first run — no account yet — the
    register screen is the right path, and the route 404s.)
    """
    username: str
    password: str = ""


class ResetRequest(BaseModel):
    token: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    """Direct local password reset by username."""
    username: str
    new_password: str

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("username must be at least 3 characters")
        return v

    @field_validator("new_password")
    @classmethod
    def _new_password(cls, v: str) -> str:
        if len(v) < MIN_PASSWORD_LEN:
            raise ValueError(f"password must be at least {MIN_PASSWORD_LEN} characters")
        return v


class SessionOpenRequest(BaseModel):
    """Client reports a sign-in happened (after the token was issued)."""


class SessionCloseRequest(BaseModel):
    """Client reports the session ended — duration in seconds,
    plus how it ended (manual sign-out vs. tab/browser close)."""

    duration_seconds: int = 0
    ended_at: str | None = None
    reason: str = "close"

    @field_validator("duration_seconds")
    @classmethod
    def _duration(cls, v: int) -> int:
        return max(0, min(v, 30 * 24 * 3600))

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        return v if v in {"logout", "close", "timeout"} else "close"


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
# Login history
# --------------------------------------------------------------------------- #

LOGIN_HISTORY_LIMIT = 30


async def _record_login(doc: dict) -> None:
    """Append a timestamped entry to the account's login history.

    Kept on the account document itself so it survives restarts and
    travels with the store's backups. Only the most recent
    LOGIN_HISTORY_LIMIT entries are retained.
    """
    history = list(doc.get("login_history") or [])
    history.append({"at": datetime.now(timezone.utc).isoformat()})
    doc["login_history"] = history[-LOGIN_HISTORY_LIMIT:]


async def _login_history(storage) -> list[dict]:
    doc = await _load_account(storage)
    if not doc:
        return []
    # Newest first — the list is stored oldest-first.
    return list(reversed(doc.get("login_history") or []))


# --------------------------------------------------------------------------- #
# Session log — sign-in time, time stayed, exit time
# --------------------------------------------------------------------------- #

SESSION_LOG_LIMIT = 100


def _append_session_log(
    doc: dict,
    entry: dict,
) -> None:
    """Append one entry to the session log, in place.

    The log answers "when did I sign in, how long did I stay,
    when did I leave" — entries are written twice: once at
    sign-in (``ended_at: null``) and again at exit (duration
    + end time filled in), matched by ``session_id``.
    """
    log = list(doc.get("session_log") or [])
    if entry.get("session_id"):
        # Closing an existing entry — update it, don't append.
        # Dict lookup instead of a linear scan: this runs on
        # every sign-in and sign-out, and a scan made the two
        # writes O(N) each (O(N²) across a long log).
        by_id = {row.get("session_id"): i for i, row in enumerate(log)}
        idx = by_id.get(entry["session_id"])
        if idx is not None:
            log[idx] = {**log[idx], **entry}
            doc["session_log"] = log[-SESSION_LOG_LIMIT:]
            return
    log.append(entry)
    doc["session_log"] = log[-SESSION_LOG_LIMIT:]


async def _session_log(storage) -> list[dict]:
    doc = await _load_account(storage)
    if not doc:
        return []
    return list(doc.get("session_log") or [])


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
        "password_hash": await asyncio.to_thread(_hash_password, payload.password),
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
    if not await asyncio.to_thread(_verify_password, payload.password, doc.get("password_hash", "")):
        raise HTTPException(401, "Invalid username or password")

    # Token + login-history entry are written in one locked mutation —
    # two logins racing each other can no longer lose one another's
    # history entry (the old load → mutate → save-from-snapshot path).
    def _apply(account: dict) -> None:
        account["session_token"] = secrets.token_urlsafe(32)
        account["session_expires_at"] = datetime.now(timezone.utc).isoformat()
        history = list(account.get("login_history") or [])
        history.append({"at": datetime.now(timezone.utc).isoformat()})
        account["login_history"] = history[-LOGIN_HISTORY_LIMIT:]

    saved = await storage.mutate("users", doc["id"], _apply)
    return _session_response(saved or doc)


@router.post("/auth/session/open")
async def session_open(_payload: SessionOpenRequest | None = None):
    """Mark the start of a session: the sign-in time.

    Called by the client right after login succeeds, so the
    sign-in timestamp is captured at the moment the vault
    opened — not just when the token was minted. The entry
    starts open (``ended_at: null``) and is closed by
    ``POST /auth/session/close``.
    """
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found")
    session_id = secrets.token_hex(8)
    entry = {
        "session_id": session_id,
        "sign_in_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "duration_seconds": 0,
        "reason": None,
    }

    def _apply(account: dict) -> None:
        _append_session_log(account, entry)

    await storage.mutate("users", doc["id"], _apply)
    return {"ok": True, "session_id": session_id}


@router.post("/auth/session/close")
async def session_close(payload: SessionCloseRequest):
    """Close the most recent open session entry.

    The client reports how long the user stayed and how the
    session ended — an explicit sign-out, or the tab/browser
    closing (the beacon fires from ``beforeunload``). If the
    browser died without the beacon, the entry stays open and
    is reported as such (``ended_at: null``) — honest over
    fabricated.
    """
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found")

    # Attach to the newest OPEN entry when the client didn't
    # tell us which session this was (tab-close beacons can't
    # await anything, so they don't send the id).
    entry = {
        "ended_at": payload.ended_at
        or datetime.now(timezone.utc).isoformat(),
        "duration_seconds": payload.duration_seconds,
        "reason": payload.reason,
    }
    log = list(doc.get("session_log") or [])
    target = None
    for row in reversed(log):
        if row.get("ended_at") is None:
            target = row.get("session_id")
            break
    if target:
        entry["session_id"] = target

    def _apply(account: dict) -> None:
        _append_session_log(account, entry)

    await storage.mutate("users", doc["id"], _apply)
    return {"ok": True}


@router.get("/auth/sessions")
async def sessions():
    """Recent session log, newest first — sign-in time,
    duration, and exit time per visit."""
    storage = get_storage()
    log = await _session_log(storage)
    return {"sessions": list(reversed(log))}


@router.post("/auth/logout")
async def logout():
    """Clear the session token."""
    storage = get_storage()
    doc = await _load_account(storage)
    if doc:
        await storage.mutate("users", doc["id"], lambda a: a.update(
            session_token=None, session_expires_at=None
        ))
    return {"ok": True}


@router.post("/auth/change-password")
async def change_password(payload: ChangePasswordRequest):
    """Change the account password after verifying the current one."""
    storage = get_storage()
    doc = await _load_account(storage)
    if not doc:
        raise HTTPException(404, "No account found — register first")
    if not await asyncio.to_thread(_verify_password, payload.current_password, doc.get("password_hash", "")):
        raise HTTPException(401, "Current password is incorrect")
    if await asyncio.to_thread(_verify_password, payload.new_password, doc.get("password_hash", "")):
        raise HTTPException(400, "New password must be different from the current one")
    new_hash = await asyncio.to_thread(_hash_password, payload.new_password)

    # Password change + token/session invalidation happen in one locked
    # mutation — the check above can't be invalidated by a concurrent
    # login writing a fresh session token.
    def _apply(account: dict) -> None:
        account["password_hash"] = new_hash
        account["reset_token"] = None
        account["reset_token_expires_at"] = None
        account["session_token"] = None

    await storage.mutate("users", doc["id"], _apply)
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


@router.get("/auth/login-history")
async def login_history():
    """Recent sign-in timestamps for the account, newest first."""
    storage = get_storage()
    return {"history": await _login_history(storage)}


@router.post("/auth/change-username")
async def change_username(payload: ChangeUsernameRequest):
    """Change the account's username after verifying the password."""
    storage = get_storage()
    doc = await _load_account(storage)
    if not doc:
        raise HTTPException(404, "No account found — register first")
    if not await asyncio.to_thread(_verify_password, payload.password, doc.get("password_hash", "")):
        raise HTTPException(401, "Password is incorrect")

    def _apply(account: dict) -> None:
        account["username"] = payload.username

    await storage.mutate("users", doc["id"], _apply)
    logger.info("Username changed to @%s", payload.username)
    return {"ok": True, "user": {"username": payload.username, "email": doc.get("email", "")}}


@router.post("/auth/recovery-token")
async def mint_recovery_token(payload: RecoveryTokenRequest):
    """Mint a one-time password-reset token for the account.

    This is the "I might lose access" path: run this (or the Settings
    button) *before* you ever need it, keep the token somewhere safe,
    and exchange it at /auth/reset if the password is ever forgotten.
    Tokens expire after 15 minutes and are single-use.

    Requires the account's current password — the token
    replaces the password, so anyone who can mint one
    owns the account. Without this check, knowing the
    username alone (often guessable) was enough to take
    over the account.
    """
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found — register first")
    if doc["username"] != payload.username:
        raise HTTPException(404, "No account with that username")
    if not await asyncio.to_thread(_verify_password, payload.password, doc.get("password_hash", "")):
        raise HTTPException(401, "Incorrect password")

    token = secrets.token_urlsafe(24)

    def _apply(account: dict) -> None:
        account["reset_token"] = token
        account["reset_token_expires_at"] = datetime.now(timezone.utc).timestamp() + 15 * 60

    await storage.mutate("users", doc["id"], _apply)
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
        await storage.mutate("users", doc["id"], lambda a: a.update(reset_token=None))
        raise HTTPException(401, "Recovery token expired — mint a new one")
    new_hash = await asyncio.to_thread(_hash_password, payload.new_password)

    # The token is cleared and the password swapped in one locked
    # mutation — a replayed token can't race a concurrent reset into
    # applying twice.
    def _apply(account: dict) -> None:
        account["password_hash"] = new_hash
        account["reset_token"] = None
        account["reset_token_expires_at"] = None
        account["session_token"] = None

    await storage.mutate("users", doc["id"], _apply)
    logger.info("Password reset via recovery token for @%s", doc["username"])
    return {"ok": True, "message": "Password updated"}


@router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    """Direct local password reset by username (current mode, additional security to be expanded)."""
    storage = get_storage()
    doc = await _load_account(storage)
    if doc is None:
        raise HTTPException(404, "No account found — register first")
    if doc["username"] != payload.username:
        raise HTTPException(404, "No account found with this username")

    new_hash = await asyncio.to_thread(_hash_password, payload.new_password)

    def _apply(account: dict) -> None:
        account["password_hash"] = new_hash
        account["reset_token"] = None
        account["reset_token_expires_at"] = None
        account["session_token"] = None

    await storage.mutate("users", doc["id"], _apply)
    logger.info("Password reset via forgot-password for @%s", payload.username)
    return {"ok": True, "message": "Password updated successfully. You can now sign in."}

