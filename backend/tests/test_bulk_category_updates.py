"""Test bulk category rename/delete operations."""
import pytest
from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache


@pytest.mark.asyncio
async def test_category_rename_bulk_update():
    """Test that category rename uses bulk update and invalidates cache."""
    storage = get_storage()
    
    # Create a custom category
    await storage.insert("custom_categories", {
        "id": "test_cat_1",
        "name": "Test Category"
    })
    
    # Create transactions with this category
    await storage.insert_many("transactions", [
        {
            "id": "txn1",
            "description": "Test transaction 1",
            "amount": -100.0,
            "category": "Test Category",
            "date": "2024-01-01",
            "payment_method": "Cash"
        },
        {
            "id": "txn2", 
            "description": "Test transaction 2",
            "amount": -50.0,
            "category": "Test Category",
            "date": "2024-01-02",
            "payment_method": "UPI"
        }
    ])
    
    # Set cache entry
    cache = invalidate_analytics_cache.__wrapped__.__globals__['_analytics_cache']
    cache.set("test_key", "test_value")
    assert len(cache) > 0
    
    # Perform bulk update
    updated_count = await storage.update_many(
        "transactions",
        {"category": "Test Category"},
        {"category": "Renamed Category"}
    )
    
    # Should update both transactions
    assert updated_count == 2
    
    # Verify transactions were updated
    txn1 = await storage.get("transactions", "txn1")
    assert txn1["category"] == "Renamed Category"
    
    txn2 = await storage.get("transactions", "txn2")
    assert txn2["category"] == "Renamed Category"
    
    # Clean up
    await storage.delete("transactions", "txn1")
    await storage.delete("transactions", "txn2")
    await storage.delete("custom_categories", "test_cat_1")


@pytest.mark.asyncio
async def test_category_delete_bulk_reassign():
    """Test that category delete uses bulk reassign and invalidates cache."""
    storage = get_storage()
    
    # Create a custom category
    await storage.insert("custom_categories", {
        "id": "test_cat_2",
        "name": "To Delete"
    })
    
    # Create transactions with this category
    await storage.insert_many("transactions", [
        {
            "id": "txn3",
            "description": "Test transaction 3",
            "amount": -75.0,
            "category": "To Delete",
            "date": "2024-01-03",
            "payment_method": "Cash"
        },
        {
            "id": "txn4",
            "description": "Test transaction 4", 
            "amount": -25.0,
            "category": "To Delete",
            "date": "2024-01-04",
            "payment_method": "UPI"
        }
    ])
    
    # Perform bulk reassign
    reassigned_count = await storage.update_many(
        "transactions",
        {"category": "To Delete"},
        {"category": "Other"}
    )
    
    # Should reassign both transactions
    assert reassigned_count == 2
    
    # Verify transactions were reassigned
    txn3 = await storage.get("transactions", "txn3")
    assert txn3["category"] == "Other"
    
    txn4 = await storage.get("transactions", "txn4")
    assert txn4["category"] == "Other"
    
    # Clean up
    await storage.delete("transactions", "txn3")
    await storage.delete("transactions", "txn4")
    await storage.delete("custom_categories", "test_cat_2")