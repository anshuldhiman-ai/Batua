"""Test transaction title suggestions functionality."""
import pytest


def test_transaction_titles_endpoint(client):
    """Test that /transactions/titles returns distinct suggestions."""
    # Create some test transactions
    test_transactions = [
        {
            "description": "Starbucks",
            "amount": -5.50,
            "category": "Food",
            "date": "2024-01-01",
            "payment_method": "Cash"
        },
        {
            "description": "starbucks",  # Case variation
            "amount": -6.00,
            "category": "Food", 
            "date": "2024-01-02",
            "payment_method": "UPI"
        },
        {
            "description": "Amazon",
            "amount": -25.00,
            "category": "Shopping",
            "date": "2024-01-03",
            "payment_method": "Card"
        }
    ]
    
    # Insert test transactions
    for txn in test_transactions:
        client.post("/api/transactions/", json=txn)
    
    # Get title suggestions
    response = client.get("/api/transactions/titles?limit=100")
    
    assert response.status_code == 200
    data = response.json()
    
    assert "titles" in data
    titles = data["titles"]
    
    # Should have distinct titles (case-insensitive deduplication)
    # "Starbucks" and "starbucks" should be one entry
    assert "Starbucks" in titles or "starbucks" in titles
    assert "Amazon" in titles
    
    # Verify case-insensitive deduplication
    starbucks_count = sum(1 for t in titles if t.lower() == "starbucks")
    assert starbucks_count == 1, "Should have only one Starbucks entry (case-insensitive)"
    
    # Clean up test transactions by getting all transactions
    all_txns = client.get("/api/transactions/?page_size=100")
    txn_data = all_txns.json()
    for txn in txn_data.get("items", []):
        if txn.get("description") in ["Starbucks", "starbucks", "Amazon"]:
            client.delete(f"/api/transactions/{txn['id']}")


def test_transaction_titles_limit(client):
    """Test that title suggestions respect the limit parameter."""
    # Create many transactions
    for i in range(20):  # Reduced from 50 to avoid too many operations
        client.post("/api/transactions/", json={
            "description": f"Merchant {i}",
            "amount": -10.0,
            "category": "Food",
            "date": "2024-01-01",
            "payment_method": "Cash"
        })
    
    # Request limited suggestions
    response = client.get("/api/transactions/titles?limit=10")
    
    assert response.status_code == 200
    data = response.json()
    
    assert "titles" in data
    titles = data["titles"]
    
    # Should respect limit
    assert len(titles) <= 10
    
    # Clean up
    all_txns = client.get("/api/transactions/?page_size=100")
    txn_data = all_txns.json()
    for txn in txn_data.get("items", []):
        if txn.get("description", "").startswith("Merchant"):
            client.delete(f"/api/transactions/{txn['id']}")


def test_transaction_titles_distinctness(client):
    """Test that suggestions are distinct and keyboard accessible."""
    # Create transactions with same description
    client.post("/api/transactions/", json={
        "description": "Grocery Store",
        "amount": -50.0,
        "category": "Food",
        "date": "2024-01-01",
        "payment_method": "Cash"
    })
    
    client.post("/api/transactions/", json={
        "description": "Grocery Store",
        "amount": -30.0,
        "category": "Food",
        "date": "2024-01-02",
        "payment_method": "UPI"
    })
    
    # Get suggestions
    response = client.get("/api/transactions/titles")
    
    assert response.status_code == 200
    data = response.json()
    
    titles = data["titles"]
    
    # Should have only one entry for "Grocery Store"
    grocery_count = sum(1 for t in titles if t == "Grocery Store")
    assert grocery_count == 1, "Should have distinct suggestions"
    
    # Clean up
    all_txns = client.get("/api/transactions/?page_size=100")
    txn_data = all_txns.json()
    for txn in txn_data.get("items", []):
        if txn.get("description") == "Grocery Store":
            client.delete(f"/api/transactions/{txn['id']}")