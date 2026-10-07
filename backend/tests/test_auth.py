"""Auth route tests — register/login/logout/me, recovery-token + reset.

Drives the real endpoints through the shared `client` fixture (throwaway
SQLite store), so the hashing + storage round-trip is exercised, not mocked.
"""
import asyncio

import pytest
from fastapi.testclient import TestClient


CRED = {
    "username": "anshuldhiman-ai",
    "email": "anshuldhimanbadmosh2007@gmail.com",
    "password": "1947",
}


async def _register_async(storage, **overrides) -> dict:
    """Write an account straight into `storage` (for direct-row assertions)."""
    from app.routes import auth as auth_module

    payload = {**CRED, **overrides}
    doc = {
        "id": "user_test",
        "username": payload["username"],
        "email": payload["email"],
        "password_hash": auth_module._hash_password(payload["password"]),
        "created_at": "2026-10-07T00:00:00+00:00",
        "session_token": None,
        "session_expires_at": None,
    }
    await auth_module._save_account(storage, doc)
    return doc


def _register(client: TestClient, **overrides) -> dict:
    payload = {**CRED, **overrides}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_register_roundtrip(client):
    data = _register(client)
    assert data["ok"] is True
    assert data["user"]["username"] == CRED["username"]
    assert data["user"]["email"] == CRED["email"]

    # /auth/me exposes metadata, never the password hash
    me = client.get("/api/auth/me").json()
    assert me["username"] == CRED["username"]
    assert "password_hash" not in me


def test_register_rejected_when_account_exists(client):
    _register(client)
    response = client.post("/api/auth/register", json=CRED)
    assert response.status_code == 409


def test_login_success_returns_token(client):
    _register(client)
    response = client.post(
        "/api/auth/login",
        json={"username": CRED["username"], "password": CRED["password"]},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["ok"] is True
    assert data["user"]["username"] == CRED["username"]
    assert data["token"]


def test_login_rejects_wrong_password(client):
    _register(client)
    response = client.post(
        "/api/auth/login", json={"username": CRED["username"], "password": "not-the-password"}
    )
    assert response.status_code == 401


def test_login_rejects_unknown_username(client):
    _register(client)
    response = client.post(
        "/api/auth/login", json={"username": "ghost-user", "password": CRED["password"]}
    )
    # Same status as a bad password so usernames aren't enumerable
    assert response.status_code == 401


def test_login_without_account_is_404(client):
    response = client.post(
        "/api/auth/login", json={"username": "nobody", "password": "x"}
    )
    assert response.status_code == 404


def test_logout_clears_session(client):
    _register(client)
    client.post(
        "/api/auth/login",
        json={"username": CRED["username"], "password": CRED["password"]},
    )
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json()["ok"] is True
    # Logging in again still works — logout only clears the session token
    again = client.post(
        "/api/auth/login",
        json={"username": CRED["username"], "password": CRED["password"]},
    )
    assert again.status_code == 200


def test_password_is_stored_hashed(test_storage):
    asyncio.run(_register_async(test_storage))

    async def _row():
        return await test_storage.all("users")

    stored = asyncio.run(_row())
    assert len(stored) == 1
    pw_hash = stored[0]["password_hash"]
    assert pw_hash != CRED["password"]
    assert pw_hash.split("$", 1)[0] in {"bcrypt", "sha256"}


def test_recovery_token_resets_password(client):
    _register(client)

    # Mint a one-time token
    minted = client.post("/api/auth/recovery-token", json={"username": CRED["username"]})
    assert minted.status_code == 200, minted.text
    token = minted.json()["token"]
    assert token

    # Exchange it for a new password
    reset = client.post(
        "/api/auth/reset", json={"token": token, "new_password": "new-pass-99"}
    )
    assert reset.status_code == 200, reset.text

    # Old password is dead, new one works
    old = client.post(
        "/api/auth/login", json={"username": CRED["username"], "password": CRED["password"]}
    )
    assert old.status_code == 401
    new = client.post(
        "/api/auth/login",
        json={"username": CRED["username"], "password": "new-pass-99"},
    )
    assert new.status_code == 200


def test_recovery_token_is_single_use(client):
    _register(client)
    token = client.post(
        "/api/auth/recovery-token", json={"username": CRED["username"]}
    ).json()["token"]

    first = client.post("/api/auth/reset", json={"token": token, "new_password": "second-pass"})
    assert first.status_code == 200
    replay = client.post("/api/auth/reset", json={"token": token, "new_password": "third-pass"})
    assert replay.status_code == 401


def test_recovery_token_rejects_wrong_username(client):
    _register(client)
    response = client.post("/api/auth/recovery-token", json={"username": "someone-else"})
    assert response.status_code == 404


def test_register_validation(client):
    # Short username
    response = client.post(
        "/api/auth/register",
        json={**CRED, "username": "ab"},
    )
    assert response.status_code == 400
    # Short password
    response = client.post(
        "/api/auth/register",
        json={**CRED, "password": "123"},
    )
    assert response.status_code == 400
    # Malformed email
    response = client.post(
        "/api/auth/register",
        json={**CRED, "email": "not-an-email"},
    )
    assert response.status_code == 400


def test_reset_rejects_weak_password(client):
    _register(client)
    token = client.post(
        "/api/auth/recovery-token", json={"username": CRED["username"]}
    ).json()["token"]
    response = client.post("/api/auth/reset", json={"token": token, "new_password": "12"})
    assert response.status_code == 400
