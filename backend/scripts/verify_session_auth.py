"""One-shot check that the session middleware actually enforces tokens.

Not part of the pytest suite — run manually:
    python scripts/verify_session_auth.py
"""
import logging
import os
import tempfile

logging.disable(logging.CRITICAL)
os.environ["BATUA_AUTH_DISABLE"] = ""

from unittest.mock import patch  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from storage import SQLiteStorage  # noqa: E402


def main():
    tmp = tempfile.mkdtemp()
    store = SQLiteStorage(os.path.join(tmp, "s.db"))

    import server

    async def mock_create():
        return store, "test"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            r = c.get("/api/transactions/")
            print("1. no-account GET /transactions (open):", r.status_code)

            r = c.post(
                "/api/auth/register",
                json={
                    "username": "u1",
                    "email": "u1@example.com",
                    "password": "pw123456",
                },
            )
            print("2. register:", r.status_code)
            body = r.json()
            token = body.get("session_token") or body.get("token")
            if not token and isinstance(body.get("account"), dict):
                token = body["account"].get("session_token")
            print("   token issued:", bool(token))

            r = c.get("/api/transactions/")
            print("3. post-registration, NO header:", r.status_code, "(expect 401)")

            r = c.get("/api/transactions/", headers={"Authorization": "Bearer wrong"})
            print("4. bad token:", r.status_code, "(expect 401)")

            if token:
                r = c.get(
                    "/api/transactions/",
                    headers={"Authorization": f"Bearer {token}"},
                )
                print("5. good token:", r.status_code, "(expect 200)")

            print("6. /api/ready (public):", c.get("/api/ready").status_code)
            print("7. /api (public):", c.get("/api").status_code)
            print(
                "8. /api/auth/login (public):",
                c.post(
                    "/api/auth/login",
                    json={"username": "u1", "password": "pw123456"},
                ).status_code,
            )
            print(
                "9. login wrong pw:",
                c.post(
                    "/api/auth/login",
                    json={"username": "u1", "password": "wrong"},
                ).status_code,
                "(expect 401)",
            )


if __name__ == "__main__":
    main()
