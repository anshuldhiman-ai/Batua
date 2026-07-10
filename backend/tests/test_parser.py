from datetime import datetime
from unittest.mock import patch
from parser import (
    parse_transaction,
    parse_nl_input,
    parse_bulk_lines,
    parse_voice_input,
    _detect_payment,
    _detect_amount,
    _detect_date,
    _detect_category,
    _clean_description
)

def test_detect_payment():
    assert _detect_payment("zomato 450 upi")[0] == "UPI"
    assert _detect_payment("spent on credit card")[0] == "Credit Card"
    assert _detect_payment("cash for taxi")[0] == "Cash"
    assert _detect_payment("no payment method mentioned")[0] == ""

def test_detect_amount():
    # Explicit sign
    assert _detect_amount("zomato +450")[0:2] == (450.0, True)
    assert _detect_amount("zomato -450")[0:2] == (450.0, False)
    # Shorthand suffixes
    assert _detect_amount("salary +5k")[0:2] == (5000.0, True)
    assert _detect_amount("car -1.5lakh")[0:2] == (150000.0, False)
    assert _detect_amount("flat 2cr")[0:2] == (20000000.0, False)
    # Plain number
    assert _detect_amount("milk 50")[0:2] == (50.0, False)
    # Edge case: skip date-like and ordinals
    assert _detect_amount("date 15/06 amount 100")[0] == 100.0
    assert _detect_amount("1st prize 1000")[0] == 1000.0

def test_detect_date():
    today = datetime(2026, 6, 19)
    
    # Absolute words
    assert _detect_date("zomato today", today)[0] == "2026-06-19"
    assert _detect_date("zomato yesterday", today)[0] == "2026-06-18"
    assert _detect_date("zomato tomorrow", today)[0] == "2026-06-20"
    
    # N days ago
    assert _detect_date("paid 5 days ago", today)[0] == "2026-06-14"
    
    # Weekdays (last/this)
    # 2026-06-19 is Friday (weekday 4).
    # Last Monday (weekday 0) -> 2026-06-15
    assert _detect_date("last monday", today)[0] == "2026-06-15"
    # Coming Monday (weekday 0) -> 2026-06-22
    assert _detect_date("coming monday", today)[0] == "2026-06-22"
    
    # dd/mm/yyyy
    assert _detect_date("on 15/06/2026", today)[0] == "2026-06-15"
    assert _detect_date("on 15/06/26", today)[0] == "2026-06-15"
    assert _detect_date("on 15/06", today)[0] == "2026-06-15"
    
    # Nth month
    assert _detect_date("15th june", today)[0] == "2026-06-15"
    assert _detect_date("june 15th", today)[0] == "2026-06-15"
    assert _detect_date("15th", today)[0] == "2026-06-15"

def test_detect_category():
    assert _detect_category("biryani from cafe") == "Food & Dining"
    assert _detect_category("swiggy order") == "Food Delivery"
    assert _detect_category("lays chips tea") == "Snacks"
    assert _detect_category("bigbasket order") == "Groceries"
    assert _detect_category("petrol bunk") == "Fuel"
    assert _detect_category("ola cab") == "Transportation"
    assert _detect_category("salary received") == "Income"
    assert _detect_category("random stuff") == "Other"

def test_clean_description():
    assert _clean_description("zomato   for lunch", "Food & Dining") == "Zomato Lunch"
    assert _clean_description("   ", "Other") == "Transaction"
    assert _clean_description("   ", "Snacks") == "Snacks"

def test_parse_transaction():
    today = datetime(2026, 6, 19)
    
    # Debit scenario
    result = parse_transaction("zomato 450 yesterday upi", today)
    assert result["description"] == "Zomato"
    assert result["amount"] == -450.0
    assert result["date"] == "2026-06-18"
    assert result["category"] == "Food Delivery"
    assert result["payment_method"] == "UPI"
    assert result["txn_type"] == "debit"
    
    # Credit scenario
    result = parse_transaction("pocket money +5k today", today)
    assert result["description"] == "Pocket Money"
    assert result["amount"] == 5000.0
    assert result["date"] == "2026-06-19"
    assert result["category"] == "Income"
    assert result["txn_type"] == "credit"

@patch("ai.is_enabled")
@patch("ai.chat_json")
def test_parse_transaction_gemini_fallback(mock_chat_json, mock_is_enabled):
    today = datetime(2026, 6, 19)
    
    # Mock AI disabled
    mock_is_enabled.return_value = False
    result = parse_transaction("mysterious-merchant 999", today)
    assert result["category"] == "Other"
    mock_chat_json.assert_not_called()
    
    # Mock AI enabled, fallback successful
    mock_is_enabled.return_value = True
    mock_chat_json.return_value = {
        "description": "Premium Mysterious Merchant",
        "category": "Entertainment",
        "payment_method": "Credit Card",
        "amount": -999.0,
        "date": "2026-06-18"
    }
    
    result = parse_transaction("mysterious-merchant 999", today)
    assert result["description"] == "Premium Mysterious Merchant"
    assert result["category"] == "Entertainment"
    assert result["payment_method"] == "Credit Card"
    assert result["amount"] == -999.0
    assert result["date"] == "2026-06-18"
    assert result["txn_type"] == "debit"
    mock_chat_json.assert_called_once()


def test_parse_recurring():
    today = datetime(2026, 6, 19)

    r = parse_nl_input("salary +5k on 1st every month", today)
    assert r["kind"] == "recurring"
    assert r["amount"] == 5000.0
    assert r["day"] == 1
    assert r["count"] == 12
    assert "2026-06" in r["months"]

    r = parse_nl_input("sip 1k monthly from jan to jun 2026", today)
    assert r["kind"] == "recurring"
    assert r["amount"] == -1000.0
    assert r["count"] == 6
    assert r["months"] == ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]

    r = parse_nl_input("rent -15000 monthly for 2026", today)
    assert r["count"] == 12
    assert r["months"][0] == "2026-01"


def test_parse_bulk_lines():
    today = datetime(2026, 6, 19)
    items = parse_bulk_lines("salary 5k monthly\nzomato 450 yesterday", today)
    assert len(items) == 2
    assert items[0]["kind"] == "recurring"
    assert items[1]["kind"] == "single"


def test_parse_voice_hinglish_multi_transaction():
    today = datetime(2026, 6, 19, 9, 0)
    items = parse_voice_input(
        "aaj maine 11 bje kurkure ka packet liya 10 wala fer 2 bje din k gol gappe khaye 20 k",
        today,
    )

    assert len(items) == 2
    assert items[0]["description"] == "Kurkure Packet"
    assert items[0]["amount"] == -10.0
    assert items[0]["date"] == "2026-06-19"
    assert items[0]["category"] == "Snacks"
    assert items[0]["notes"] == "Time: 11:00"

    assert items[1]["description"] == "Gol Gappe"
    assert items[1]["amount"] == -20.0
    assert items[1]["date"] == "2026-06-19"
    assert items[1]["category"] == "Snacks"
    assert items[1]["notes"] == "Time: 14:00"


def test_parse_voice_hindi_script_output():
    today = datetime(2026, 6, 19, 9, 0)
    items = parse_voice_input(
        "आज मैंने 11 बजे कुरकुरे का पैकेट लिया 10 वाला फिर 2 बजे दिन के गोल गप्पे खाए 20 के",
        today,
    )

    assert len(items) == 2
    assert items[0]["description"] == "Kurkure Packet"
    assert items[0]["amount"] == -10.0
    assert items[1]["description"] == "Gol Gappe"
    assert items[1]["amount"] == -20.0

def test_parser_improvements():
    today = datetime(2026, 6, 19)
    
    # 1. Date with year
    assert _detect_date("zomato on 15 june 2025", today)[0] == "2025-06-15"
    assert _detect_date("zomato on june 15 2025", today)[0] == "2025-06-15"
    
    # 2. Currency prefixes
    res = parse_transaction("rs. 450 for zomato", today)
    assert res["amount"] == -450.0
    assert res["description"] == "Zomato"
    
    res = parse_transaction("₹500 for petrol", today)
    assert res["amount"] == -500.0
    assert res["description"] == "Petrol"
    
    # 3. New category keywords
    res = parse_transaction("driving license fee 300", today)
    assert res["category"] == "Utilities"
    
    res = parse_transaction("bought facewash and soap 150", today)
    assert res["category"] == "Personal Care"

    res = parse_transaction("swiggy dinner 450 upi", today)
    assert res["category"] == "Food Delivery"
    assert res["amount"] == -450.0


def test_local_ml_fallback_without_spacy_preserves_expense_sign():
    today = datetime(2026, 6, 19)

    with patch("ml_nlp.LocalNLPParser._initialize", return_value=False):
        res = parse_transaction("vehicle licence renewal 900", today)

    assert res["category"] == "Utilities"
    assert res["amount"] == -900.0
    assert res["txn_type"] == "debit"
