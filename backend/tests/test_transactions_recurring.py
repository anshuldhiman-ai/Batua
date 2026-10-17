"""POST /transactions/recurring: within-request de-duplication.

Regression: the idempotency check only compared against transactions already in
the DB, so the same month listed twice in one request produced two identical
rows.
"""


def test_recurring_dedupes_repeated_months(client):
    r = client.post("/api/transactions/recurring", json={
        "description": "Rent",
        "amount": -15000.0,
        "category": "Housing/Rent",
        "payment_method": "Bank",
        "day": 5,
        "months": ["2026-01", "2026-02", "2026-01"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    # Two distinct months inserted; the repeated month is skipped.
    assert body["inserted"] == 2
    assert body["skipped"] == 1

    listed = client.get("/api/transactions/", params={"page_size": 50}).json()
    dates = sorted(t["date"] for t in listed["items"])
    assert dates == ["2026-01-05", "2026-02-05"]


def test_recurring_skips_rows_already_in_db(client):
    payload = {
        "description": "Internet",
        "amount": -999.0,
        "category": "Utilities",
        "day": 10,
        "months": ["2026-03"],
    }
    first = client.post("/api/transactions/recurring", json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["inserted"] == 1

    # Re-sending the identical request must not create a duplicate.
    second = client.post("/api/transactions/recurring", json=payload)
    assert second.status_code == 200, second.text
    assert second.json()["inserted"] == 0
    assert second.json()["skipped"] == 1
