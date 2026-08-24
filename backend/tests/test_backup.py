"""Backup / restore coverage.

``/api/backup`` + ``/api/restore`` are the only full export/import mechanism in
the app, so a regression here means silent data loss. These tests pin the
round-trip and — importantly — the *replace* semantics: restoring a backup must
never wipe a collection the backup file doesn't actually carry.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "test_backup_store.db"))


@pytest.fixture
def client(test_storage):
    import server

    async def mock_create():
        return test_storage, "test-sqlite"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


TXN = {
    "id": "t1", "date": "2026-08-01", "description": "Zomato",
    "amount": -450.0, "category": "Food Delivery", "payment_method": "upi",
}
BUDGET = {"id": "b1", "category": "Food Delivery", "limit": 5000.0}
GOAL = {
    "id": "g1", "name": "Laptop", "target_amount": 80000.0,
    "current_amount": 1000.0, "target_date": "2027-01-01",
}
PERSON = {
    "id": "p1", "person_name": "Rahul", "direction": "gave",
    "amount": 500.0, "date": "2026-08-02",
}
CATEGORY = {"id": "c1", "name": "Gadgets"}


def _seed(client):
    """Put one row in every collection via a full restore."""
    r = client.post("/api/restore", json={
        "transactions": [TXN], "budgets": [BUDGET], "goals": [GOAL],
        "people": [PERSON], "custom_categories": [CATEGORY],
    })
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# Round trip
# --------------------------------------------------------------------------- #

def test_backup_returns_every_collection(client):
    _seed(client)
    data = client.get("/api/backup").json()

    assert data["app"] == "batua"
    assert data["version"] == 1
    assert "exported_at" in data
    for key in ("transactions", "budgets", "goals", "people", "custom_categories"):
        assert len(data[key]) == 1, f"{key} missing from backup"


def test_backup_restore_round_trip_is_lossless(client):
    _seed(client)
    original = client.get("/api/backup").json()

    # Wipe, then restore from the downloaded document.
    client.delete("/api/transactions")
    restored = client.post("/api/restore", json=original)
    assert restored.status_code == 200, restored.text

    after = client.get("/api/backup").json()
    for key in ("transactions", "budgets", "goals", "people", "custom_categories"):
        assert after[key] == original[key], f"{key} changed across a round trip"


def test_restore_counts_and_skips_invalid_rows(client):
    r = client.post("/api/restore", json={
        "transactions": [TXN, {"date": "2026-08-01"}],      # 2nd: no amount/description
        "budgets": [BUDGET, {"category": "X", "limit": -5}],  # 2nd: limit must be > 0
        "custom_categories": [CATEGORY, {"name": "   "}],     # 2nd: blank name
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["transactions"] == 1
    assert body["budgets"] == 1
    assert body["custom_categories"] == 1
    assert body["skipped"] == 3


def test_restore_rejects_empty_backup(client):
    assert client.post("/api/restore", json={}).status_code == 400
    assert client.post("/api/restore", json={
        "transactions": [], "budgets": [], "goals": [],
        "people": [], "custom_categories": [],
    }).status_code == 400


def test_restore_rejects_backup_with_only_invalid_rows(client):
    r = client.post("/api/restore", json={"transactions": [{"nope": 1}]})
    assert r.status_code == 400
    assert "no valid rows" in r.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# Replace semantics — the data-loss surface
# --------------------------------------------------------------------------- #

def test_partial_backup_does_not_wipe_collections_it_omits(client):
    """A people-only backup must not destroy transactions/budgets/goals.

    ``replace=True`` means "replace what this file carries", not "delete
    everything". Restoring a partial export used to clear transactions,
    budgets and goals unconditionally, so importing a people-only file
    silently destroyed the entire spending history.
    """
    _seed(client)

    r = client.post("/api/restore", json={
        "people": [{**PERSON, "id": "p2", "person_name": "Mom", "direction": "took"}]
    })
    assert r.status_code == 200, r.text

    after = client.get("/api/backup").json()
    assert len(after["transactions"]) == 1, "transactions were wiped by a people-only backup"
    assert len(after["budgets"]) == 1, "budgets were wiped by a people-only backup"
    assert len(after["goals"]) == 1, "goals were wiped by a people-only backup"
    # The supplied collection *is* replaced.
    assert [p["person_name"] for p in after["people"]] == ["Mom"]


def test_supplied_collections_are_replaced_not_appended(client):
    _seed(client)

    r = client.post("/api/restore", json={
        "transactions": [{**TXN, "id": "t2", "description": "Swiggy"}]
    })
    assert r.status_code == 200, r.text

    after = client.get("/api/backup").json()
    assert [t["description"] for t in after["transactions"]] == ["Swiggy"]


def test_restore_append_mode_keeps_existing_rows(client):
    _seed(client)

    r = client.post("/api/restore?replace=false", json={
        "transactions": [{**TXN, "id": "t2", "description": "Swiggy"}]
    })
    assert r.status_code == 200, r.text

    after = client.get("/api/backup").json()
    assert sorted(t["description"] for t in after["transactions"]) == ["Swiggy", "Zomato"]


def test_failed_restore_preserves_previous_data(client):
    """If an insert blows up mid-restore, the old data must come back.

    The failure is transient (forward path only) so the rollback's re-insert
    succeeds — that's the recoverable case the endpoint promises to handle.
    """
    _seed(client)
    before = client.get("/api/backup").json()

    from app.routes import backup as backup_route

    storage = backup_route.get_storage()
    original_insert_many = storage.insert_many
    failed = {"done": False}

    async def flaky_insert_many(collection, rows, progress_cb=None):
        # Fail exactly once, on the forward insert of the new goals.
        if collection == "goals" and not failed["done"]:
            failed["done"] = True
            raise RuntimeError("disk exploded")
        return await original_insert_many(collection, rows, progress_cb)

    with patch.object(storage, "insert_many", flaky_insert_many):
        r = client.post("/api/restore", json={
            "transactions": [{**TXN, "id": "t9", "description": "New"}],
            "goals": [GOAL],
        })

    assert r.status_code == 500
    after = client.get("/api/backup").json()
    assert after["transactions"] == before["transactions"], "rollback lost transactions"
    assert after["goals"] == before["goals"], "rollback lost goals"


def test_rollback_failure_reports_cleanly_and_saves_the_rest(client):
    """A rollback that itself fails must not crash or abort the other collections.

    Storage stays broken for ``goals``, so that one is unrecoverable — but the
    endpoint must still return a clear 500 naming it, and still put the other
    collections back.
    """
    _seed(client)
    before = client.get("/api/backup").json()

    from app.routes import backup as backup_route

    storage = backup_route.get_storage()
    original_insert_many = storage.insert_many

    async def broken_for_goals(collection, rows, progress_cb=None):
        if collection == "goals":
            raise RuntimeError("goals table is toast")
        return await original_insert_many(collection, rows, progress_cb)

    with patch.object(storage, "insert_many", broken_for_goals):
        r = client.post("/api/restore", json={
            "transactions": [{**TXN, "id": "t9", "description": "New"}],
            "goals": [GOAL],
        })

    assert r.status_code == 500
    detail = r.json()["detail"]
    assert "goals" in detail, detail
    assert "roll" in detail.lower(), detail

    after = client.get("/api/backup").json()
    # Transactions were recoverable, so they must be intact.
    assert after["transactions"] == before["transactions"]
