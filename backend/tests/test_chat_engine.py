"""Coverage for chat_engine.py: session memory, follow-up resolution, and
the session-aware /api/ml/qa + /api/ml/chat/{id} routes.
"""
from datetime import date

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "test_chat_store.db"))


@pytest.fixture
def client(test_storage):
    import server

    async def mock_create():
        return test_storage, "test-json-file"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


def _seed(client):
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
    ]
    for date, desc, amt, cat in rows:
        r = client.post("/api/transactions", json={
            "date": date, "description": desc, "amount": amt, "category": cat,
        })
        assert r.status_code == 200


def test_legacy_qa_without_session_id_unchanged(client):
    _seed(client)
    r = client.post("/api/ml/qa", json={"question": "How much did I spend on rent?", "mode": "rules"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "answer" in body
    assert "session_id" not in body
    assert "intent" not in body


def test_session_round_trip(client):
    _seed(client)
    session_id = "test-session-1"

    r = client.post("/api/ml/qa", json={
        "question": "How much did I spend on rent?", "mode": "rules", "session_id": session_id,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"] == session_id
    assert body["intent"] == "query"

    r = client.post("/api/ml/qa", json={
        "question": "What's my savings rate?", "mode": "rules", "session_id": session_id,
    })
    assert r.status_code == 200, r.text

    r = client.get(f"/api/ml/chat/{session_id}")
    assert r.status_code == 200, r.text
    turns = r.json()["turns"]
    assert len(turns) == 4  # 2 user + 2 assistant


def _month_offset_date(months_ago: int, day: int = 15) -> str:
    """A YYYY-MM-DD string ``months_ago`` months before the current month —
    needed because "last month" in ml_rag is resolved against wall-clock
    time, not the fixture's fixed 2026 dates."""
    today = date.today()
    year, month = today.year, today.month - months_ago
    while month <= 0:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}-{day:02d}"


def _seed_relative_months(client):
    rows = [
        (_month_offset_date(0, 10), "Salary", 50000.0, "Income"),
        (_month_offset_date(0, 15), "Zomato", -500.0, "Food & Dining"),
        (_month_offset_date(1, 10), "Salary", 50000.0, "Income"),
        (_month_offset_date(1, 18), "Swiggy", -700.0, "Food & Dining"),
    ]
    for date_, desc, amt, cat in rows:
        r = client.post("/api/transactions", json={
            "date": date_, "description": desc, "amount": amt, "category": cat,
        })
        assert r.status_code == 200


def test_followup_resolution_merges_category_and_period(client):
    _seed_relative_months(client)
    session_id = "test-session-followup"

    r = client.post("/api/ml/qa", json={
        "question": "How much did I spend on Food & Dining?", "mode": "rules", "session_id": session_id,
    })
    assert r.status_code == 200, r.text
    first_value = r.json()["value"]

    r = client.post("/api/ml/qa", json={
        "question": "what about last month?", "mode": "rules", "session_id": session_id,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "resolved_question" in body
    assert "food & dining" in body["resolved_question"].lower()
    assert "last month" in body["resolved_question"].lower()

    # Sanity: the direct equivalent query returns the same figure.
    direct = client.post("/api/ml/qa", json={
        "question": "How much did I spend on Food & Dining last month?", "mode": "rules",
    })
    assert direct.status_code == 200
    assert body["value"] == direct.json()["value"]
    assert body["value"] != first_value


def test_summarization_after_many_turns(client):
    _seed(client)
    session_id = "test-session-summary"

    for i in range(7):
        r = client.post("/api/ml/qa", json={
            "question": f"What's my total income? (turn {i})", "mode": "rules", "session_id": session_id,
        })
        assert r.status_code == 200, r.text

    r = client.get(f"/api/ml/chat/{session_id}")
    assert r.status_code == 200
    body = r.json()
    # 7 turns * 2 messages = 14 > SUMMARIZE_AFTER_TURNS (12)
    assert len(body["turns"]) <= 8
    assert body["summary"]


def test_delete_then_get_returns_empty(client):
    _seed(client)
    session_id = "test-session-delete"

    r = client.post("/api/ml/qa", json={
        "question": "What's my total income?", "mode": "rules", "session_id": session_id,
    })
    assert r.status_code == 200

    r = client.delete(f"/api/ml/chat/{session_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    r = client.get(f"/api/ml/chat/{session_id}")
    assert r.status_code == 200
    assert r.json()["turns"] == []


def _seed_for_intents(client):
    """Enough history (>=5 Food & Dining txns for a meaningful std, a clear
    category spike this month, a brand-new category, and healthy positive
    cash flow) to exercise advice/anomaly/analysis/comparison handlers."""
    rows = [
        (_month_offset_date(2, 5), "Salary", 60000.0, "Income"),
        (_month_offset_date(2, 10), "Rent", -15000.0, "Housing/Rent"),
        (_month_offset_date(2, 12), "Zomato", -400.0, "Food & Dining"),
        (_month_offset_date(2, 14), "Swiggy", -420.0, "Food & Dining"),
        (_month_offset_date(2, 16), "Cafe", -380.0, "Food & Dining"),
        (_month_offset_date(1, 5), "Salary", 60000.0, "Income"),
        (_month_offset_date(1, 10), "Rent", -15000.0, "Housing/Rent"),
        (_month_offset_date(1, 12), "Zomato", -410.0, "Food & Dining"),
        (_month_offset_date(1, 14), "Swiggy", -430.0, "Food & Dining"),
        (_month_offset_date(1, 16), "Cafe", -390.0, "Food & Dining"),
        (_month_offset_date(0, 5), "Salary", 60000.0, "Income"),
        (_month_offset_date(0, 10), "Rent", -15000.0, "Housing/Rent"),
        # Food & Dining spikes hard this month vs the ~400/txn trailing pattern.
        (_month_offset_date(0, 12), "Zomato", -2500.0, "Food & Dining"),
        (_month_offset_date(0, 13), "Swiggy", -2400.0, "Food & Dining"),
        (_month_offset_date(0, 14), "Cafe", -2300.0, "Food & Dining"),
        (_month_offset_date(0, 15), "Diner", -2200.0, "Food & Dining"),
        (_month_offset_date(0, 16), "Bistro", -2600.0, "Food & Dining"),
        # Brand-new category this month only.
        (_month_offset_date(0, 20), "Gadget Store", -3000.0, "Electronics"),
    ]
    for date_, desc, amt, cat in rows:
        r = client.post("/api/transactions", json={
            "date": date_, "description": desc, "amount": amt, "category": cat,
        })
        assert r.status_code == 200


def test_advice_intent_routes_to_recommendations(client):
    _seed_for_intents(client)
    r = client.post("/api/ml/qa", json={
        "question": "What should I do to save more money?", "mode": "rules", "session_id": "test-advice",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "advice"
    assert body["type"] == "advice"
    assert "recommendations" in body
    assert "answer" in body and body["answer"]
    assert body["actions"] == [{"label": "Optimize budget", "to": "/budgets"}]


def test_anomaly_intent_routes_to_anomaly_detector(client):
    _seed_for_intents(client)
    r = client.post("/api/ml/qa", json={
        "question": "Is there anything unusual in my spending?", "mode": "rules", "session_id": "test-anomaly",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "anomaly"
    assert body["type"] == "anomaly_report"
    assert "anomalies" in body
    assert body["actions"] == [{"label": "View spending patterns", "to": "/ml-insights"}]

    direct = client.get("/api/ml/anomalies")
    assert direct.status_code == 200, direct.text
    assert direct.json()["anomalies"] == body["anomalies"]


def test_analysis_intent_routes_to_pattern_analyzer(client):
    _seed_for_intents(client)
    r = client.post("/api/ml/qa", json={
        "question": "What's the trend in my spending pattern?", "mode": "rules", "session_id": "test-analysis",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "analysis"
    assert body["type"] == "analysis"
    assert body["answer"]
    assert body["actions"] == [{"label": "View spending patterns", "to": "/ml-insights"}]


def test_unmatched_finance_question_gets_freeform_or_canned_fallback(client):
    """No pattern handler matches this question, but it's clearly on-topic
    (contains a finance term) — chat_engine should either hand it to the
    local LLM for a grounded freeform reply (when Ollama is reachable) or
    fall back to ml_rag's canned "couldn't match" answer (when it isn't).
    Either way it must not 500 and must return a non-empty answer."""
    import local_llm

    _seed(client)
    r = client.post("/api/ml/qa", json={
        "question": "How is my money looking these days",
        "mode": "rules",
        "session_id": "test-freeform",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "query"
    assert body["answer"]
    if local_llm.is_enabled():
        assert body["type"] == "freeform"
    else:
        assert body["type"] == "unknown"


def test_comparison_intent_compares_categories(client):
    _seed_for_intents(client)
    r = client.post("/api/ml/qa", json={
        "question": "Compare Food & Dining vs Housing/Rent",
        "mode": "rules",
        "session_id": "test-comparison",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "comparison"
    assert body["type"] == "comparison"
    assert body["left"]["label"] == "Food & Dining"
    assert body["right"]["label"] == "Housing/Rent"
    assert body["left"]["value"] > 0
    assert body["right"]["value"] > 0
