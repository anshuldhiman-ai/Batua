"""Tests for ml_nlp transaction classification."""
import json
from pathlib import Path

import pytest

import ml_nlp


@pytest.fixture(scope="module")
def classifier():
    clf = ml_nlp.TransactionClassifier()
    assert clf._initialize(), "Classifier failed to initialize"
    return clf


def test_training_json_exists_and_is_large():
    path = Path(__file__).resolve().parents[1] / "data" / "training_data.json"
    assert path.exists(), "Run backend/scripts/build_training_data.py"
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["sample_count"] >= 5000
    cats = {s["category"] for s in payload["samples"]}
    assert "Investments" in cats
    assert "Food Delivery" in cats


@pytest.mark.parametrize(
    "description,expected",
    [
        ("swiggy order dinner", "Food Delivery"),
        ("zomato lunch", "Food Delivery"),
        ("salary credited hdfc", "Income"),
        ("zerodha sip mutual fund", "Investments"),
        ("blinkit groceries", "Groceries"),
        ("hp petrol pump", "Fuel"),
        ("ola cab ride", "Transportation"),
        ("netflix subscription", "Subscriptions"),
        ("apollo pharmacy", "Health"),
        ("house rent january", "Housing/Rent"),
        ("bescom electricity bill", "Utilities"),
        ("amazon shopping order", "Shopping"),
        ("starbucks coffee", "Food & Dining"),
        ("lays chips packet", "Snacks"),
        ("udemy course purchase", "Education"),
        ("pvr movie ticket", "Entertainment"),
        ("lakme salon haircut", "Personal Care"),
        ("aloo paratha", "Food & Dining"),
        ("aloo paratntha", "Food & Dining"),
        ("punjabi tadka", "Food & Dining"),
        ("takatak", "Food & Dining"),
        ("chole bhature", "Food & Dining"),
        ("dal tadka", "Food & Dining"),
        ("paneer paratha", "Food & Dining"),
    ],
)
def test_keyword_or_ml_classification(classifier, description, expected):
    cat, _, _ = classifier.predict_category_with_confidence(description)
    assert cat == expected, f"{description!r} -> {cat}, expected {expected}"


def test_classify_many_batch(classifier):
    descriptions = [
        "swiggy order",
        "swiggy order",  # duplicate
        "zerodha sip",
        "random unknown merchant xyz",
    ]
    result = classifier.predict_many(descriptions)
    assert result["swiggy order"] == "Food Delivery"
    assert result["zerodha sip"] == "Investments"
    assert len(result) == 3  # unique keys in mapping


def test_merge_training_data_scale(classifier):
    merged = classifier._merge_training_data()
    assert len(merged) >= 5000
    categories = {cat for _, cat in merged}
    assert len(categories) >= 15


def test_persisted_model_loads(classifier):
    assert classifier._initialized
    path = Path(__file__).resolve().parents[1] / "data" / "classifier.joblib"
    assert path.exists(), "Run backend/scripts/train_classifier.py"
