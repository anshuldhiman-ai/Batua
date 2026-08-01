"""Exercise the staged upload flow exactly as the frontend drives it."""
import io
import time
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    test_db = tmp_path / "test_import_store.db"
    return SQLiteStorage(str(test_db))


@pytest.fixture
def client(test_storage):
    import server
    from app.upload_progress import _progress_store

    # Fresh progress store per test so tasks don't leak between tests.
    _progress_store._tasks.clear()

    async def mock_create():
        return test_storage, "test-json-file"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


def _poll(client, task_id, timeout=15):
    """Mirror the frontend's 400ms polling loop."""
    start = time.time()
    while time.time() - start < timeout:
        r = client.get(f"/api/upload-progress/{task_id}")
        assert r.status_code == 200
        data = r.json()
        print(f"  stage={data['stage']} progress={data['progress']} msg={data.get('message')!r} err={data.get('error')!r}")
        if data["stage"] in ("complete", "error"):
            return data
        time.sleep(0.05)
    raise AssertionError("poll timeout")


def test_staged_import_end_to_end(client):
    csv_data = "Date,Particulars,Amount\n12/06/2026,Zomato Lunch,-450.00\n13/06/2026,Salary,+10000.00\n"
    files = {"file": ("statement.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    data = {"mapping": '{"date": "Date", "description": "Particulars", "amount": "Amount"}'}

    # 1. Preview (frontend onDrop)
    r = client.post("/api/upload-excel/preview", files=files)
    assert r.status_code == 200, r.text
    print("preview:", r.json())
    assert "file" not in r.json(), "preview response must not claim to carry the file"

    # 2. Start (frontend confirmUpload)
    r = client.post("/api/upload-excel/start", files=files, data=data, params={"replace": "true", "use_ai": "false"})
    assert r.status_code == 200, r.text
    task_id = r.json()["task_id"]
    print("start:", r.json())

    # 3. Poll until terminal
    final = _poll(client, task_id)
    print("final:", final)
    assert final["stage"] == "complete", f"import did not complete: {final}"

    # 4. Transactions persisted? (items come back sorted date-desc, so check
    #    the set rather than relying on row order.)
    txns = client.get("/api/transactions").json()
    print("txns:", txns)
    assert txns["total"] == 2
    by_desc = {t["description"]: t for t in txns["items"]}
    assert by_desc["Zomato Lunch"]["amount"] == -450.0
    assert by_desc["Salary"]["amount"] == 10000.0


def test_staged_import_bad_csv_reports_error(client):
    """A file with no recognizable date/amount should fail cleanly, not hang."""
    csv_data = "Hello,World\nfoo,bar\nbaz,qux\n"
    files = {"file": ("garbage.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    data = {"mapping": '{}'}
    r = client.post("/api/upload-excel/start", files=files, data=data, params={"replace": "true", "use_ai": "false"})
    assert r.status_code == 200, r.text
    task_id = r.json()["task_id"]
    final = _poll(client, task_id)
    print("bad-file final:", final)
    assert final["stage"] == "error"
