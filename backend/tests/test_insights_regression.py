"""Regression tests for insights + dashboard caching.

- /api/insights on a cold cache previously raised NameError because
  get_storage was never imported in insights.py.
- /api/dashboard/metrics previously had dead code after `return`, so the
  result was never cached. Here we assert the cache is actually populated.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "test_insights_store.db"))


@pytest.fixture
def client(test_storage):
    import server

    async def mock_create():
        return test_storage, "test-json-file"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


def test_insights_cold_cache_does_not_crash(client):
    from app.cache import get_cache
    get_cache().clear()  # force the cold-cache branch (get_all_txns)

    client.post("/api/transactions", json={
        "date": "2026-06-10", "description": "Salary",
        "amount": 10000.0, "category": "Income",
    })
    client.post("/api/transactions", json={
        "date": "2026-06-11", "description": "Rent",
        "amount": -2000.0, "category": "Housing/Rent",
    })

    get_cache().clear()
    r = client.get("/api/insights")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["insights"]
    assert body["source"] == "rules"


def test_dashboard_metrics_are_cached(client):
    from app.cache import get_cache
    client.post("/api/transactions", json={
        "date": "2026-06-10", "description": "Salary",
        "amount": 10000.0, "category": "Income",
    })
    get_cache().clear()
    assert get_cache().get("dashboard_metrics") is None

    r = client.get("/api/dashboard/metrics")
    assert r.status_code == 200
    # The dead-code bug meant this was never populated.
    assert get_cache().get("dashboard_metrics") is not None
