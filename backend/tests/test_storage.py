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
    doc1 = {"id": "txn-1", "date": "2026-06-01", "description": "Zomato", "amount": -450.0, "category": "Food & Dining", "quantity": 1, "price": 450.0}
    inserted = await storage.insert("transactions", doc1)
    assert inserted == doc1

    # 3. Test get and all
    retrieved = await storage.get("transactions", "txn-1")
    assert doc1.items() <= retrieved.items()  # SQLite adds default empty-string fields

    non_existent = await storage.get("transactions", "txn-none")
    assert non_existent is None

    all_docs = await storage.all("transactions")
    assert len(all_docs) == 1
    assert doc1.items() <= all_docs[0].items()
    
    # 4. Test insert_many
    doc2 = {"id": "txn-2", "date": "2026-06-02", "description": "Salary", "amount": 50000.0, "category": "Income", "quantity": 1, "price": 50000.0}
    doc3 = {"id": "txn-3", "date": "2026-06-03", "description": "Airtel", "amount": -799.0, "category": "Utilities", "quantity": 1, "price": 799.0}
    count = await storage.insert_many("transactions", [doc2, doc3])
    assert count == 2
    
    all_docs = await storage.all("transactions")
    assert len(all_docs) == 3
    
    # Query matching
    income_docs = await storage.all("transactions", {"category": "Income"})
    assert len(income_docs) == 1
    assert income_docs[0]["id"] == "txn-2"
    
    # 5. Test update
    updated = await storage.update("transactions", "txn-1", {"amount": -500.0, "notes": "Updated Zomato", "price": 500.0})
    assert updated is not None
    assert updated["amount"] == -500.0
    assert updated["notes"] == "Updated Zomato"
    assert updated["description"] == "Zomato" # unchanged field
    assert updated["price"] == 500.0
    
    update_non_existent = await storage.update("transactions", "txn-none", {"amount": 0})
    assert update_non_existent is None
    
    # 6. Test one-statement bulk update
    bulk_updated = await storage.update_many("transactions", {"category": "Food & Dining"}, {"category": "Dining"})
    assert bulk_updated == 1
    assert (await storage.get("transactions", "txn-1"))["category"] == "Dining"

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


@pytest.mark.asyncio
async def test_storage_price_field(tmp_path):
    """Test that price field is properly stored and retrieved."""
    temp_db_file = tmp_path / "test_price.db"
    storage = SQLiteStorage(str(temp_db_file))
    
    # Insert with price
    doc = {"id": "price-test", "date": "2026-06-01", "description": "Test", "amount": -100.0, "quantity": 2, "price": 50.0}
    inserted = await storage.insert("transactions", doc)
    assert inserted["price"] == 50.0
    
    # Retrieve and verify price
    retrieved = await storage.get("transactions", "price-test")
    assert retrieved["price"] == 50.0
    
    # Update price
    updated = await storage.update("transactions", "price-test", {"price": 75.0})
    assert updated["price"] == 75.0
    
    await storage.close()


@pytest.mark.asyncio
async def test_sqlite_combined_range_query(tmp_path):
    """A {"$gte": ..., "$lte": ...} range must apply BOTH bounds.

    Regression: the operator handling was an if/elif chain, so a combined date
    range silently dropped the upper bound and returned everything on/after the
    start date (inflating results and counts).
    """
    storage = SQLiteStorage(str(tmp_path / "range.db"))
    docs = [
        {"id": "a", "date": "2026-01-05", "description": "Jan early", "amount": -10.0},
        {"id": "b", "date": "2026-01-20", "description": "Jan late", "amount": -20.0},
        {"id": "c", "date": "2026-02-10", "description": "Feb", "amount": -30.0},
        {"id": "d", "date": "2025-12-31", "description": "Dec prev", "amount": -40.0},
    ]
    await storage.insert_many("transactions", docs)

    q = {"date": {"$gte": "2026-01-01", "$lte": "2026-01-31"}}
    rows = await storage.all("transactions", query=q, order_by="date")
    assert [r["id"] for r in rows] == ["a", "b"]
    assert await storage.count("transactions", query=q) == 2

    # A combined amount range likewise applies both bounds.
    aq = {"amount": {"$gt": -25.0, "$lt": -5.0}}
    rows = await storage.all("transactions", query=aq, order_by="date")
    assert sorted(r["id"] for r in rows) == ["a", "b"]

    await storage.close()

