"""GET /transactions: server-side sorting and page_size clamping.

Regression coverage for two list bugs:
- Sorting was done client-side on a single page, so a column sort only reordered
  the visible rows. The API must sort the whole result set.
- page_size was not clamped on the non-search path, so a negative value reached
  the DB as a negative LIMIT (SQLite treats that as "no limit").
"""


def _seed(client):
    rows = [(-10.0, "Alpha"), (-300.0, "Bravo"), (-50.0, "Charlie")]
    for i, (amount, desc) in enumerate(rows, start=1):
        r = client.post("/api/transactions", json={
            "date": f"2026-06-0{i}",
            "description": desc,
            "amount": amount,
            "category": "Other",
        })
        assert r.status_code == 200, r.text


def test_list_sorts_by_amount_desc(client):
    _seed(client)
    r = client.get("/api/transactions/", params={"sort_by": "amount", "sort_order": "desc", "page_size": 50})
    assert r.status_code == 200, r.text
    amounts = [t["amount"] for t in r.json()["items"]]
    assert amounts == [-10.0, -50.0, -300.0]


def test_list_sorts_by_amount_asc(client):
    _seed(client)
    r = client.get("/api/transactions/", params={"sort_by": "amount", "sort_order": "asc", "page_size": 50})
    assert r.status_code == 200, r.text
    amounts = [t["amount"] for t in r.json()["items"]]
    assert amounts == [-300.0, -50.0, -10.0]


def test_list_sorts_by_description(client):
    _seed(client)
    r = client.get("/api/transactions/", params={"sort_by": "description", "sort_order": "asc", "page_size": 50})
    assert r.status_code == 200, r.text
    descs = [t["description"] for t in r.json()["items"]]
    assert descs == ["Alpha", "Bravo", "Charlie"]


def test_page_size_is_clamped(client):
    _seed(client)
    r = client.get("/api/transactions/", params={"page_size": -5})
    assert r.status_code == 200, r.text
    body = r.json()
    # Negative page size is clamped up to 1 rather than reaching the DB as a
    # negative LIMIT (which would return the whole collection on SQLite).
    assert body["page_size"] == 1
    assert len(body["items"]) == 1


def test_unknown_sort_field_falls_back_safely(client):
    _seed(client)
    r = client.get("/api/transactions/", params={"sort_by": "amount; DROP TABLE transactions", "page_size": 50})
    assert r.status_code == 200, r.text
    assert len(r.json()["items"]) == 3
    # The table is untouched.
    assert r.json()["total"] == 3
