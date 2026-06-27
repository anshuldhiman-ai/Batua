"""End-to-end coverage for the ML feature endpoints under /api/ml/*.

These endpoints (spending patterns, cash-flow forecast, budget optimizer,
goals, recommendations, RAG Q&A, local NLP) had no tests. This drives each
one against a seeded SQLite store to catch runtime errors and contract
regressions.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "test_ml_store.db"))


@pytest.fixture
def client(test_storage):
    import server

    async def mock_create():
        return test_storage, "test-json-file"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


def _seed(client):
    """Seed several months of transactions across categories."""
    rows = [
        ("2026-01-10", "Salary", 50000.0, "Income"),
        ("2026-01-12", "Rent", -15000.0, "Housing/Rent"),
        ("2026-01-15", "Zomato", -450.0, "Food & Dining"),
        ("2026-02-10", "Salary", 50000.0, "Income"),
        ("2026-02-12", "Rent", -15000.0, "Housing/Rent"),
        ("2026-02-18", "Swiggy", -600.0, "Food & Dining"),
        ("2026-03-10", "Salary", 50000.0, "Income"),
        ("2026-03-12", "Rent", -15000.0, "Housing/Rent"),
        ("2026-03-20", "Uber", -300.0, "Transport"),
        ("2026-04-10", "Salary", 50000.0, "Income"),
        ("2026-04-12", "Rent", -15000.0, "Housing/Rent"),
        ("2026-04-22", "Amazon", -2500.0, "Shopping"),
    ]
    for date, desc, amt, cat in rows:
        r = client.post("/api/transactions", json={
            "date": date, "description": desc, "amount": amt, "category": cat,
        })
        assert r.status_code == 200


def test_ml_status(client):
    r = client.get("/api/ml/ml-status")
    assert r.status_code == 200
    body = r.json()
    assert "nlp_parser_available" in body
    assert "nlp_parser_mode" in body


def test_parse_local_and_classify(client):
    r = client.post("/api/ml/parse-local", params={"text": "zomato 450 yesterday upi"})
    assert r.status_code == 200
    assert "amount" in r.json()

    r = client.post("/api/ml/classify", params={"description": "Uber ride to airport"})
    assert r.status_code == 200
    assert "category" in r.json()


def test_spending_patterns(client):
    _seed(client)
    r = client.get("/api/ml/spending-patterns")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), dict)


def test_cash_flow_forecast(client):
    _seed(client)
    r = client.get("/api/ml/cash-flow-forecast", params={"months_ahead": 3})
    assert r.status_code == 200, r.text


def test_optimize_budget(client):
    _seed(client)
    r = client.post("/api/ml/optimize-budget", params={"total_budget": 30000})
    assert r.status_code == 200, r.text


def test_recommendations(client):
    _seed(client)
    r = client.get("/api/ml/recommendations")
    assert r.status_code == 200, r.text


def test_goals_lifecycle(client):
    _seed(client)
    r = client.post("/api/ml/goals", json={
        "name": "Emergency fund",
        "target_amount": 100000,
        "target_date": "2026-12-31",
        "current_amount": 20000,
    })
    assert r.status_code == 200, r.text
    goal = r.json()
    gid = goal.get("id", "test-goal")

    r = client.get(f"/api/ml/goals/{gid}/predict")
    assert r.status_code == 200, r.text

    r = client.get(f"/api/ml/goals/{gid}/impact")
    assert r.status_code == 200, r.text


def test_qa_endpoints(client):
    _seed(client)
    r = client.get("/api/ml/qa/suggestions")
    assert r.status_code == 200, r.text
    assert "suggestions" in r.json()

    r = client.post("/api/ml/qa", json={"question": "How much did I spend on rent?"})
    assert r.status_code == 200, r.text


def test_recategorize_suggest_only(client):
    _seed(client)
    r = client.post("/api/ml/recategorize", params={"apply": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["apply"] is False
    assert "changes" in body


def test_empty_store_ml_endpoints(client):
    """ML endpoints must not 500 on an empty store."""
    for url in [
        "/api/ml/spending-patterns",
        "/api/ml/cash-flow-forecast",
        "/api/ml/recommendations",
        "/api/ml/qa/suggestions",
    ]:
        r = client.get(url)
        assert r.status_code == 200, f"{url} -> {r.status_code}: {r.text}"
