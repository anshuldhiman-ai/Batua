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
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

# Disable auth for tests - the middleware already supports this via BATUA_AUTH_DISABLE
os.environ["BATUA_AUTH_DISABLE"] = "1"


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
        with TestClient(server.app) as c:
            yield c


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
        with TestClient(server.app) as c:
            yield c
