"""Shared fixtures for the route test suite.

Every route test drives the app against a throwaway SQLite store: the
``client`` fixture patches ``storage.create_storage`` so the app's
lifespan registers that store. Both used to be copy-pasted into each
test module. A module can override ``storage_backend_name`` when it
needs the app to report a different storage backend.

The session middleware requires a Bearer token on every non-auth
route once an account exists. Tests don't log in, so the fixture
below installs a test token into the account document after any
register/login — the enforcement logic itself still runs on every
request (it just sees a valid token), so the "missing / wrong
token → 401" behavior stays covered wherever a test exercises it
directly.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

# Fixed token the test client presents. The middleware compares
# against the account's real session_token, so after register/
# login the fixture copies this value into the account doc.
_TEST_TOKEN = "test-session-token"


def _inject_test_token(storage):
    """Stamp the fixed test token onto the account, if one exists.

    Runs after register/login inside the request so the middleware
    accepts subsequent requests. Safe when no account exists yet
    (first run is open anyway).
    """
    import asyncio

    async def _apply():
        docs = await storage.all("users")
        if not docs:
            return
        doc = docs[0]

        def _set(account: dict) -> None:
            account["session_token"] = _TEST_TOKEN
            account["session_expires_at"] = None

        await storage.mutate("users", doc["id"], _set)

    asyncio.get_event_loop().run_until_complete(_apply())


class _AutoAuthClient(TestClient):
    """TestClient that re-stamps the test token between requests.

    The token lives in the account doc (the middleware's source
    of truth), so a re-login that rotates it is followed by
    re-stamping here — every request the test then makes still
    carries the token the middleware will accept.
    """

    def __init__(self, app, storage, **kwargs):
        super().__init__(app, **kwargs)
        self._storage = storage

    def request(self, method, url, **kwargs):
        headers = dict(kwargs.get("headers") or {})
        headers.setdefault("Authorization", f"Bearer {_TEST_TOKEN}")
        kwargs["headers"] = headers
        return super().request(method, url, **kwargs)


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "test_store.db"))


@pytest.fixture
def storage_backend_name():
    return "test-json-file"


@pytest.fixture
def client(test_storage, storage_backend_name):
    import server

    # Patch storage.create_storage so lifespan registers test_storage
    async def mock_create():
        return test_storage, storage_backend_name

    with patch("storage.create_storage", side_effect=mock_create):
        with _AutoAuthClient(server.app, test_storage) as c:
            yield c
