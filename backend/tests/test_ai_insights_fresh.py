"""Verify AI Insights reflects transactions added via the transactions API."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "ai_insights.db"))


@pytest.fixture
def client(test_storage):
    import server

    async def mock_create():
        return test_storage, "test-json-file"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


def test_ml_spending_patterns_see_newly_added_transactions(client):
    # 1. Add transactions the way the Transactions page does.
    r = client.post(
        "/api/transactions",
        json={"date": "2026-07-05", "description": "Zomato", "amount": -450.0, "category": "Food Delivery"},
    )
    assert r.status_code == 200
    r = client.post(
        "/api/transactions",
        json={"date": "2026-07-06", "description": "Swiggy", "amount": -320.0, "category": "Food Delivery"},
    )
    assert r.status_code == 200

    # 2. AI Insights should reflect them.
    res = client.get("/api/ml/spending-patterns")
    assert res.status_code == 200, res.text
    data = res.json()
    print("spending-patterns:", data)
    assert data.get("empty") is False
    assert data["transaction_count"] == 2

    # 3. Adding one more shows up immediately (no stale cache).
    r = client.post(
        "/api/transactions",
        json={"date": "2026-07-07", "description": "Uber", "amount": -180.0, "category": "Transportation"},
    )
    assert r.status_code == 200
    res = client.get("/api/ml/spending-patterns")
    assert res.json()["transaction_count"] == 3
