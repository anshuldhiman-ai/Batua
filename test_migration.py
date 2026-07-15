import asyncio
import sqlite3
import sys
sys.path.insert(0, 'backend')
from storage import SQLiteStorage

async def test_migration():
    # Test with the real database copy
    print("Testing migration with real database copy...")
    storage = SQLiteStorage("backend/data/store_backup.db")
    
    # Try to read some data - this should trigger migration
    txns = await storage.all("transactions")
    print(f"✓ Successfully read {len(txns)} transactions")
    
    # Check table schema after migration
    conn = sqlite3.connect("backend/data/store_backup.db")
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(transactions)")
    columns = cursor.fetchall()
    print("Table schema:")
    for col in columns:
        print(f"  {col}")
    
    # Verify price column exists
    column_names = [col[1] for col in columns]
    assert "price" in column_names, "price column not found!"
    print("✓ price column exists")
    
    if txns:
        print(f"Sample transaction: {txns[0]}")
    
    await storage.close()
    conn.close()
    
    # Test with a fresh database
    print("\nTesting fresh database initialization...")
    import tempfile
    import os
    
    temp_db = tempfile.mktemp(suffix=".db")
    storage2 = None
    try:
        storage2 = SQLiteStorage(temp_db)
        
        # Try to insert and read - this should trigger migration
        test_doc = {"id": "test-1", "date": "2026-06-01", "description": "Test", "amount": -100.0, "quantity": 1, "price": 100.0}
        await storage2.insert("transactions", test_doc)
        retrieved = await storage2.get("transactions", "test-1")
        print(f"Retrieved: {retrieved}")
        print(f"Expected: {test_doc}")
        assert retrieved["id"] == test_doc["id"]
        assert retrieved["amount"] == test_doc["amount"]
        assert retrieved["price"] == test_doc["price"]
        print("✓ Insert and read works in fresh DB")
        
        # Close storage before checking schema
        await storage2.close()
        storage2 = None
        
        # Check schema
        conn2 = sqlite3.connect(temp_db)
        cursor2 = conn2.cursor()
        cursor2.execute("PRAGMA table_info(transactions)")
        columns2 = cursor2.fetchall()
        print("Fresh DB table schema:")
        for col in columns2:
            print(f"  {col}")
        
        column_names2 = [col[1] for col in columns2]
        assert "price" in column_names2, "price column not found in fresh DB!"
        print("✓ price column exists in fresh DB")
        
        conn2.close()
    finally:
        if storage2:
            await storage2.close()
        if os.path.exists(temp_db):
            os.remove(temp_db)
    
    print("\n✅ All migration tests passed!")

if __name__ == "__main__":
    asyncio.run(test_migration())
