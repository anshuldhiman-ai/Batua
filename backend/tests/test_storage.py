import pytest
from storage import SQLiteStorage

@pytest.mark.asyncio
async def test_sqlite_storage_operations(tmp_path):
    temp_db_file = tmp_path / "test_store.db"
    storage = SQLiteStorage(str(temp_db_file))
    
    # 1. Test empty
    txns = await storage.all("transactions")
    assert txns == []
    
    # 2. Test insert
    doc1 = {"id": "txn-1", "date": "2026-06-01", "description": "Zomato", "amount": -450.0, "category": "Food & Dining", "quantity": 1}
    inserted = await storage.insert("transactions", doc1)
    assert inserted == doc1
    
    # 3. Test get and all
    retrieved = await storage.get("transactions", "txn-1")
    assert retrieved == doc1
    
    non_existent = await storage.get("transactions", "txn-none")
    assert non_existent is None
    
    all_docs = await storage.all("transactions")
    assert len(all_docs) == 1
    assert all_docs[0] == doc1
    
    # 4. Test insert_many
    doc2 = {"id": "txn-2", "date": "2026-06-02", "description": "Salary", "amount": 50000.0, "category": "Income", "quantity": 1}
    doc3 = {"id": "txn-3", "date": "2026-06-03", "description": "Airtel", "amount": -799.0, "category": "Utilities", "quantity": 1}
    count = await storage.insert_many("transactions", [doc2, doc3])
    assert count == 2
    
    all_docs = await storage.all("transactions")
    assert len(all_docs) == 3
    
    # Query matching
    income_docs = await storage.all("transactions", {"category": "Income"})
    assert len(income_docs) == 1
    assert income_docs[0]["id"] == "txn-2"
    
    # 5. Test update
    updated = await storage.update("transactions", "txn-1", {"amount": -500.0, "notes": "Updated Zomato"})
    assert updated is not None
    assert updated["amount"] == -500.0
    assert updated["notes"] == "Updated Zomato"
    assert updated["description"] == "Zomato" # unchanged field
    
    update_non_existent = await storage.update("transactions", "txn-none", {"amount": 0})
    assert update_non_existent is None
    
    # 6. Test delete
    deleted = await storage.delete("transactions", "txn-3")
    assert deleted is True
    
    deleted_non_existent = await storage.delete("transactions", "txn-none")
    assert deleted_non_existent is False
    
    all_docs = await storage.all("transactions")
    assert len(all_docs) == 2
    assert "txn-3" not in [d["id"] for d in all_docs]
    
    # 7. Test delete_many
    deleted_count = await storage.delete_many("transactions", ["txn-1", "txn-none"])
    assert deleted_count == 1
    
    all_docs = await storage.all("transactions")
    assert len(all_docs) == 1
    assert all_docs[0]["id"] == "txn-2"
    
    # 8. Test clear
    cleared = await storage.clear("transactions")
    assert cleared == 1
    
    all_docs = await storage.all("transactions")
    assert len(all_docs) == 0
    
    await storage.close()

