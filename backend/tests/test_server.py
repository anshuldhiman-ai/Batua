import pytest
import io
from unittest.mock import patch
from fastapi.testclient import TestClient

@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    test_db = tmp_path / "test_server_store.db"
    return SQLiteStorage(str(test_db))

@pytest.fixture
def client(test_storage):
    import server
    
    # Patch storage.create_storage so lifespan registers test_storage
    async def mock_create():
        return test_storage, "test-json-file"
        
    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c


def test_health_check(client):
    response = client.get("/api/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "Batua"
    assert data["status"] == "live"
    assert data["storage"] == "test-json-file"

def test_parse_nl_route(client):
    response = client.post("/api/parse-nl", json={"text": "zomato 450 yesterday upi"})
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Zomato"
    assert data["amount"] == -450.0
    assert data["category"] == "Food Delivery"
    assert data["payment_method"] == "UPI"

    # Empty payload error
    response = client.post("/api/parse-nl", json={"text": "   "})
    assert response.status_code == 400


def test_parse_voice_route(client):
    response = client.post(
        "/api/parse-nl/voice",
        json={
            "text": "aaj maine 11 bje kurkure ka packet liya 10 wala fer 2 bje din k gol gappe khaye 20 k"
        },
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2
    assert items[0]["description"] == "Kurkure Packet"
    assert items[0]["amount"] == -10.0
    assert items[0]["category"] == "Snacks"
    assert items[0]["notes"] == "Time: 11:00"
    assert items[1]["description"] == "Gol Gappe"
    assert items[1]["amount"] == -20.0
    assert items[1]["category"] == "Snacks"
    assert items[1]["notes"] == "Time: 14:00"


def test_transaction_crud(client):
    # 1. Create a transaction
    payload = {
        "date": "2026-06-19",
        "description": "Zomato lunch",
        "amount": -450.0,
        "category": "Food & Dining",
        "payment_method": "UPI",
        "notes": "Spicy paneer biryani"
    }
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 200
    txn = response.json()
    assert txn["description"] == "Zomato lunch"
    assert txn["amount"] == -450.0
    assert txn["txn_type"] == "debit"
    assert "id" in txn

    txn_id = txn["id"]

    # 2. Get list of transactions
    response = client.get("/api/transactions")
    assert response.status_code == 200
    list_data = response.json()
    assert list_data["total"] == 1
    assert list_data["items"][0]["id"] == txn_id

    # 3. Update transaction
    response = client.put(f"/api/transactions/{txn_id}", json={"amount": -500.0, "notes": "Price increased"})
    assert response.status_code == 200
    updated_txn = response.json()
    assert updated_txn["amount"] == -500.0
    assert updated_txn["notes"] == "Price increased"
    assert updated_txn["txn_type"] == "debit"

    # Try non-existent transaction update
    response = client.put("/api/transactions/non-existent-id", json={"amount": 100})
    assert response.status_code == 404

    # 4. Get transaction list with filter
    response = client.get("/api/transactions", params={"search": "Zomato", "category": "Food & Dining"})
    assert len(response.json()["items"]) == 1

    # Search with no hit
    response = client.get("/api/transactions", params={"search": "Uber"})
    assert len(response.json()["items"]) == 0

    # 5. Delete transaction
    response = client.delete(f"/api/transactions/{txn_id}")
    assert response.status_code == 200
    assert response.json() == {"deleted": 1}

    # Delete non-existent
    response = client.delete("/api/transactions/non-existent-id")
    assert response.status_code == 404

def test_bulk_delete(client):
    # Insert two transactions
    t1 = client.post("/api/transactions", json={"date": "2026-06-19", "description": "T1", "amount": -10}).json()
    t2 = client.post("/api/transactions", json={"date": "2026-06-19", "description": "T2", "amount": -20}).json()
    
    # Check total is 2
    assert client.get("/api/transactions").json()["total"] == 2
    
    # Bulk delete them
    response = client.post("/api/transactions/bulk-delete", json={"ids": [t1["id"], t2["id"]]})
    assert response.status_code == 200
    assert response.json()["deleted"] == 2

    # Check total is 0
    assert client.get("/api/transactions").json()["total"] == 0

def test_wipe_transactions(client):
    client.post("/api/transactions", json={"date": "2026-06-19", "description": "T1", "amount": -10})
    client.post("/api/transactions", json={"date": "2026-06-19", "description": "T2", "amount": -20})
    
    response = client.delete("/api/transactions")
    assert response.status_code == 200
    assert response.json()["deleted"] == 2
    assert client.get("/api/transactions").json()["total"] == 0

def test_budgets_crud(client):
    # Create budget
    response = client.post("/api/budgets", json={"category": "Food & Dining", "limit": 5000.0})
    assert response.status_code == 200
    budget = response.json()
    assert budget["category"] == "Food & Dining"
    assert budget["limit"] == 5000.0
    budget_id = budget["id"]

    # List budgets
    response = client.get("/api/budgets")
    assert response.status_code == 200
    assert len(response.json()["budgets"]) == 1
    assert response.json()["budgets"][0]["id"] == budget_id

    # Update budget limit (upsert)
    response = client.post("/api/budgets", json={"category": "Food & Dining", "limit": 6000.0})
    assert response.status_code == 200
    # List again to verify limit updated
    response = client.get("/api/budgets")
    assert response.json()["budgets"][0]["limit"] == 6000.0

    # Delete budget
    response = client.delete(f"/api/budgets/{budget_id}")
    assert response.status_code == 200
    assert response.json() == {"deleted": 1}

    # Delete non-existent
    response = client.delete("/api/budgets/non-existent-id")
    assert response.status_code == 404

def test_dashboard_metrics_and_analytics(client):
    # Insert test data:
    # Current month: 2026-06
    # Previous month: 2026-05
    client.post("/api/transactions", json={"date": "2026-06-10", "description": "Salary", "amount": 10000.0, "category": "Income"})
    client.post("/api/transactions", json={"date": "2026-06-11", "description": "Rent", "amount": -2000.0, "category": "Housing/Rent"})
    client.post("/api/transactions", json={"date": "2026-06-12", "description": "Swiggy", "amount": -500.0, "category": "Food & Dining"})
    
    # Prev Month
    client.post("/api/transactions", json={"date": "2026-05-10", "description": "Salary", "amount": 8000.0, "category": "Income"})
    client.post("/api/transactions", json={"date": "2026-05-12", "description": "Swiggy", "amount": -400.0, "category": "Food & Dining"})

    # Dashboard Metrics
    response = client.get("/api/dashboard/metrics")
    assert response.status_code == 200
    metrics = response.json()
    assert metrics["income"] == 10000.0
    assert metrics["expense"] == 2500.0
    assert metrics["net"] == 7500.0
    assert metrics["savings_rate"] == 75.0
    assert metrics["current_month"] == "2026-06"
    # Percentage changes:
    # Income: 10000 vs 8000 (+25%)
    # Expense: 2500 vs 400 (+525%)
    assert metrics["income_change"] == 25.0
    assert metrics["expense_change"] == 525.0

    # Analytics Timeline
    response = client.get("/api/analytics/timeline")
    assert response.status_code == 200
    series = response.json()["series"]
    assert len(series) == 2
    assert series[0]["month"] == "2026-05"
    assert series[0]["income"] == 8000.0
    assert series[1]["month"] == "2026-06"
    assert series[1]["income"] == 10000.0

    # Category Breakdown
    response = client.get("/api/analytics/category-breakdown", params={"month": "2026-06"})
    assert response.status_code == 200
    cats = response.json()["data"]
    # Should have Housing/Rent and Food & Dining
    assert len(cats) == 2
    assert cats[0]["category"] == "Housing/Rent"
    assert cats[0]["amount"] == 2000.0

    # Top Merchants
    response = client.get("/api/analytics/top-merchants")
    assert response.status_code == 200
    merchants = response.json()["data"]
    assert merchants[0]["merchant"] == "Rent"
    assert merchants[0]["amount"] == 2000.0

    # Heatmap
    response = client.get("/api/analytics/heatmap")
    assert response.status_code == 200
    assert "days" in response.json()
    assert "max" in response.json()

    # Payment Method
    response = client.get("/api/analytics/payment-method")
    assert response.status_code == 200
    # None of the txns had payment methods, should aggregate under "Unknown" or empty
    assert len(response.json()["data"]) >= 1

    # Treemap
    response = client.get("/api/analytics/treemap")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 2  # Housing/Rent & Food & Dining

    # Categories list
    response = client.get("/api/categories")
    assert response.status_code == 200
    assert "Income" in response.json()["categories"]

    # Budget Status
    client.post("/api/budgets", json={"category": "Food & Dining", "limit": 1000.0})
    response = client.get("/api/budgets/status", params={"month": "2026-06"})
    assert response.status_code == 200
    status_rows = response.json()["rows"]
    assert len(status_rows) == 1
    assert status_rows[0]["category"] == "Food & Dining"
    assert status_rows[0]["spent"] == 500.0
    assert status_rows[0]["pct"] == 50.0
    assert status_rows[0]["status"] == "ok"

    # Recurring Expenses
    response = client.get("/api/recurring")
    assert response.status_code == 200
    # No merchant appears in >= 3 months yet, so empty list
    assert len(response.json()["recurring"]) == 0

    # Insights
    response = client.get("/api/insights")
    assert response.status_code == 200
    assert "insights" in response.json()

def test_export_endpoints(client):
    client.post("/api/transactions", json={"date": "2026-06-10", "description": "Salary", "amount": 10000.0, "category": "Income"})
    
    # CSV Export
    response = client.get("/api/export/csv")
    assert response.status_code == 200
    assert response.headers["Content-Disposition"] == "attachment; filename=batua_transactions.csv"
    assert "Salary" in response.text
    
    # Excel Export
    response = client.get("/api/export/excel")
    assert response.status_code == 200
    assert response.headers["Content-Disposition"] == "attachment; filename=batua_transactions.xlsx"
    assert len(response.content) > 0

def test_excel_upload_endpoints(client):
    # 1. Preview
    csv_data = "Date,Particulars,Amount\n12/06/2026,Zomato Lunch,-450.00\n"
    file_payload = {"file": ("statement.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    
    response = client.post("/api/upload-excel/preview", files=file_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["format"] == "tabular"
    assert data["mapping"]["description"] == "Particulars"

    # 2. Upload
    file_payload = {"file": ("statement.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    response = client.post("/api/upload-excel", files=file_payload, params={"replace": True, "use_ai": False})
    assert response.status_code == 200
    assert response.json()["inserted"] == 1
    assert response.json()["replaced"] is True

    # Check that transaction was added
    txns = client.get("/api/transactions").json()
    assert txns["total"] == 1
    assert txns["items"][0]["description"] == "Zomato Lunch"
