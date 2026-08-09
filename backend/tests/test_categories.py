"""Category classification tests — coverage for the food/drink fragmentation.

Guards the split the user asked for: fruits land in ``Fruits``, juices /
soft drinks / water in ``Refreshments``, shakes / lassi / cold coffee in
``Beverages``, and the classic snack / dining / delivery / grocery buckets
keep their behaviour. Both the raw keyword path and the full
``classify_transaction`` path (keyword-first, ML fallback) are exercised.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

import ml_nlp


KEYWORD_CASES = [
    # (description, expected category)
    # ── User's explicit fragmentation examples ──
    ("masala dosa", "Food & Dining"),
    ("masala dosa plate", "Food & Dining"),
    ("kurkure", "Snacks"),
    ("lay's chips", "Snacks"),
    ("lays packet", "Snacks"),
    ("mango", "Fruits"),
    ("banana", "Fruits"),
    ("oranges", "Fruits"),
    ("watermelon", "Fruits"),
    ("juice", "Refreshments"),
    ("fresh juice", "Refreshments"),
    ("lemonade", "Refreshments"),
    ("mineral water", "Refreshments"),
    ("bottled water", "Refreshments"),
    ("coke", "Refreshments"),
    ("cold drink", "Refreshments"),
    ("shake", "Beverages"),
    ("milkshake", "Beverages"),
    ("lassi", "Beverages"),
    ("cold coffee", "Beverages"),
    ("chocolate shake", "Beverages"),
    ("banana shake", "Beverages"),
    ("strawberry shake", "Beverages"),
    ("mix fruit juice", "Refreshments"),
    ("mango juice", "Refreshments"),
    ("lime water", "Refreshments"),
    ("lime soda", "Refreshments"),
    ("minute maid orange", "Refreshments"),
    ("cold coffe", "Beverages"),  # typo → cold coffee
    ("coffe", "Snacks"),          # typo → coffee (hot drink stays Snacks)
    ("aloo bhujiya", "Snacks"),   # typo → aloo bhujia
    # ── Regression guards — these must NOT drift ──
    ("dairy milk", "Snacks"),
    ("kitkat", "Snacks"),
    ("coffee", "Snacks"),
    ("chai", "Snacks"),
    ("samosa", "Snacks"),
    ("ice cream", "Snacks"),
    ("paneer", "Food & Dining"),
    ("biryani", "Food & Dining"),
    ("pizza", "Fast Food"),
    ("burger", "Fast Food"),
    ("kfc", "Fast Food"),
    ("dominos", "Fast Food"),
    ("momos", "Fast Food"),
    ("noodles", "Fast Food"),
    ("manchurian", "Fast Food"),
    ("kathi roll", "Fast Food"),
    ("shawarma", "Fast Food"),
    ("veg grilled sandwich", "Fast Food"),
    ("chowmein", "Fast Food"),
    ("zomato order", "Food Delivery"),
    ("swiggy", "Food Delivery"),
    ("vegetables", "Groceries"),
    ("milk", "Groceries"),
    ("petrol", "Fuel"),
    ("uber", "Transportation"),
    ("electricity bill", "Utilities"),
    ("netflix", "Subscriptions"),
    ("udemy course", "Education"),
]


@pytest.mark.parametrize("desc,expected", KEYWORD_CASES)
def test_keyword_category(desc, expected):
    assert ml_nlp.keyword_category(desc) == expected


@pytest.mark.parametrize("desc,expected", KEYWORD_CASES)
def test_classify_transaction_keyword_path(desc, expected):
    # keyword_category runs first and always wins — the ML model must not be
    # consulted for these descriptions, so the answer is deterministic.
    assert ml_nlp.classify_transaction(desc) == expected


def test_parser_route_uses_new_categories(client):
    """The NL parser endpoint categorises the new food/drink buckets."""
    cases = {
        "mango": "Fruits",
        "mineral water": "Refreshments",
        "chocolate shake": "Beverages",
        "kurkure": "Snacks",
        "masala dosa": "Food & Dining",
    }
    for text, expected in cases.items():
        r = client.post("/api/parse-nl", json={"text": f"{text} 100 upi"})
        assert r.status_code == 200
        body = r.json()
        assert body["description"].lower().startswith(text.split()[0]), body
        assert body["category"] == expected, f"{text!r} -> {body['category']} (want {expected})"


def test_categories_endpoint_includes_new_categories(client):
    r = client.get("/api/categories")
    assert r.status_code == 200
    cats = r.json()["categories"]
    for c in ("Fruits", "Refreshments", "Beverages", "Snacks", "Groceries", "Food & Dining"):
        assert c in cats


def test_payment_methods_endpoint(client):
    r = client.get("/api/categories/payment-methods")
    assert r.status_code == 200
    methods = r.json()["methods"]
    for m in ("UPI", "Cash", "Net Banking", "Credit Card", "Wallet"):
        assert m in methods


@pytest.fixture
def test_storage(tmp_path):
    from storage import SQLiteStorage
    return SQLiteStorage(str(tmp_path / "test_categories_store.db"))


@pytest.fixture
def client(test_storage):
    import server

    async def mock_create():
        return test_storage, "test-json-file"

    with patch("storage.create_storage", side_effect=mock_create):
        with TestClient(server.app) as c:
            yield c
