import io
import pandas as pd
from datetime import datetime
from unittest.mock import patch
from excel_loader import (
    _norm,
    _clean_amount,
    _to_date,
    _infer_date_order,
    try_load_excel,
    detect_columns
)

def test_norm():
    assert _norm("  Date (Txn) *!  ") == "date txn"
    assert _norm(123) == "123"

def test_clean_amount():
    assert _clean_amount(150) == 150.0
    assert _clean_amount(-75.5) == -75.5
    assert _clean_amount("₹1,250.50") == 1250.50
    assert _clean_amount(" (500) ") == -500.0
    assert _clean_amount(" - ") is None
    assert _clean_amount("NaN") is None

def test_to_date():
    default = datetime(2026, 6, 1)
    
    # String dates
    assert _to_date("15/06/2026", default, dayfirst=True) == datetime(2026, 6, 15)
    assert _to_date("06/15/2026", default, dayfirst=False) == datetime(2026, 6, 15)
    
    # Missing year
    assert _to_date("15/06", default) == datetime(2026, 6, 15)
    
    # Excel serial dates
    assert _to_date(45444, default) == datetime(2024, 6, 1)  # Excel 45444 is June 1 2024
    
    # Invalid date
    assert _to_date("not-a-date", default) is None

def test_infer_date_order():
    # If first part is > 12, it must be dayfirst (e.g. 15/06/2026)
    assert _infer_date_order(["15/06/2026", "10/06/2026"]) is True
    # If second part is > 12, it must be monthfirst (e.g. 06/15/2026)
    assert _infer_date_order(["06/15/2026", "06/10/2026"]) is False
    # Defaults to True (dayfirst)
    assert _infer_date_order(["05/06/2026"]) is True

def test_parse_tabular_csv():
    # Simple bank statement CSV with separate Debit/Credit columns
    csv_data = (
        "Date,Narration,Debit,Credit\n"
        "12/06/2026,Zomato Lunch,450.00,\n"
        "13/06/2026,Salary Received,,50000.00\n"
        "14/06/2026,Airtel Recharge,799.00,\n"
    )
    content = csv_data.encode("utf-8")
    
    # Test loading with try_load_excel (with AI disabled to avoid network calls)
    txns = try_load_excel(content, "statement.csv", use_ai=False)
    assert len(txns) == 3
    
    assert txns[0]["description"] == "Zomato Lunch"
    assert txns[0]["amount"] == -450.0
    assert txns[0]["date"] == "2026-06-12"
    assert txns[0]["category"] == "Food Delivery"
    
    assert txns[1]["description"] == "Salary Received"
    assert txns[1]["amount"] == 50000.0
    assert txns[1]["category"] == "Income"
    
    assert txns[2]["description"] == "Airtel Recharge"
    assert txns[2]["amount"] == -799.0
    assert txns[2]["category"] == "Utilities"

def test_parse_stacked_excel():
    data = [
        ["Expense Table : 05/2026", "", "", "", ""],
        ["SNo", "Name of Item", "Price", "Date of Purchase", "Mode of Payment"],
        [1, "Biryani", 250, "15/05/2026", "UPI"],
        [2, "Lays", 20, "16/05", "Cash"],
        ["", "", "", "", ""],
        ["Expense Table : 06/2026", "", "", "", ""],
        ["SNo", "Name of Item", "Price", "Date of Purchase", "Mode of Payment"],
        [1, "Airtel", 799, "02/06/2026", "CC"]
    ]
    
    # We write to an in-memory stream using pandas and openpyxl
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine='openpyxl') as writer:
        df = pd.DataFrame(data)
        df.to_excel(writer, index=False, header=False, sheet_name="Sheet1")
    content = out.getvalue()
    
    # Load stacked excel
    txns = try_load_excel(content, "statement.xlsx", use_ai=False)
    assert len(txns) == 3
    
    # Check details
    assert txns[0]["description"] == "Biryani"
    assert txns[0]["amount"] == -250.0
    assert txns[0]["date"] == "2026-05-15"
    assert txns[0]["category"] == "Food & Dining"
    assert txns[0]["payment_method"] == "UPI"
    
    assert txns[1]["description"] == "Lays"
    assert txns[1]["amount"] == -20.0
    assert txns[1]["date"] == "2026-05-16"
    assert txns[1]["category"] == "Snacks"
    assert txns[1]["payment_method"] == "Cash"
    
    assert txns[2]["description"] == "Airtel"
    assert txns[2]["amount"] == -799.0
    assert txns[2]["date"] == "2026-06-02"
    assert txns[2]["category"] == "Utilities"
    assert txns[2]["payment_method"] == "CC"


def test_detect_columns_tabular():
    csv_data = (
        "Date,Particulars,Amount,Payment Mode\n"
        "12/06/2026,Zomato Lunch,450.00,UPI\n"
    )
    content = csv_data.encode("utf-8")
    
    preview = detect_columns(content, "statement.csv")
    assert preview["format"] == "tabular"
    assert preview["sheet"] == "csv"
    assert "Particulars" in preview["columns"]
    # Mapping output format
    assert preview["mapping"]["date"] == "Date"
    assert preview["mapping"]["description"] == "Particulars"
    assert preview["mapping"]["amount"] == "Amount"
    assert preview["mapping"]["payment_method"] == "Payment Mode"

@patch("ml_nlp.classify_transaction")
@patch("ai.is_enabled")
@patch("ai.chat_json")
def test_ai_categorize(mock_chat_json, mock_is_enabled, mock_classify):
    mock_classify.return_value = "Other"
    mock_is_enabled.return_value = True
    mock_chat_json.return_value = {
        "map": {
            "UnknownMerchant": "Shopping",
            "RandomVendor": "Food & Dining"
        }
    }
    
    rows = [
        {"description": "UnknownMerchant", "category": "Other"},
        {"description": "RandomVendor", "category": "Other"},
        {"description": "Zomato", "category": "Food & Dining"}  # Should remain unchanged
    ]
    
    from excel_loader import _ai_categorize
    _ai_categorize(rows, use_ai=True)
    
    assert rows[0]["category"] == "Shopping"
    assert rows[1]["category"] == "Food & Dining"
    assert rows[2]["category"] == "Food & Dining"
