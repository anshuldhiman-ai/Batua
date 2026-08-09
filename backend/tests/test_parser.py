from datetime import datetime
from unittest.mock import patch
from parser import (
    parse_transaction,
    parse_nl_input,
    parse_bulk_lines,
    parse_voice_input,
    fragment_transactions,
    _typed_item_fragments,
    _detect_payment,
    _detect_amount,
    _detect_date,
    _detect_category,
    _detect_quantity,
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

def test_detect_amount_arithmetic():
    # Addition breakdown "120+89+70" is one total (not three amounts / signs).
    assert _detect_amount("banana 120+89+70")[0:2] == (279.0, False)
    # Mixed + and * respects precedence: 15*2+20 = 50.
    assert _detect_amount("chai 15*2+20")[0:2] == (50.0, False)
    # Spaces around operators are fine.
    assert _detect_amount("basket 10 + 5 + 3")[0:2] == (18.0, False)
    # Leading sign still works on an expression.
    assert _detect_amount("salary +5+3")[0:2] == (8.0, True)
    # A dd/mm date must NOT be treated as division.
    assert _detect_amount("date 15/06 amount 100")[0] == 100.0
    # A bare single number is untouched by the arithmetic path.
    assert _detect_amount("netflix 599")[0:2] == (599.0, False)
    # A multi-term expression is a single total.
    assert _detect_amount("order 10+20")[0:2] == (30.0, False)
    # End-to-end: NL parse of an arithmetic price produces a single expense.
    r = parse_nl_input("banana 120+89+70")
    assert r["amount"] == -279.0
    assert r["description"].lower() == "banana"
    assert r["price"] == 279.0


def test_typed_item_fragments_shapes():
    # Item list + price list, zipped into per-item strings.
    assert _typed_item_fragments("banana + mango 50+20") == ["banana 50", "mango 20"]
    # Alternating item/price pairs.
    assert _typed_item_fragments("banana 50 mango 20") == ["banana 50", "mango 20"]
    # Hinglish / English conjunctions between pairs.
    assert _typed_item_fragments("lays 10 aur samosa 15") == ["lays 10", "samosa 15"]
    assert _typed_item_fragments("chai 10 and samosa 15") == ["chai 10", "samosa 15"]
    # Each item keeps its OWN quantity + payment method words.
    assert _typed_item_fragments("2 samosay 50 upi and 1 cup coffe 15 cash") == [
        "2 samosay 50 upi", "1 cup coffe 15 cash",
    ]
    # A lead-count quantity ("2 plate momos 120") is a real second item here.
    assert _typed_item_fragments("2 plate momos 120 aur ek coffee 60") == [
        "2 plate momos 120", "ek coffee 60",
    ]


def test_typed_item_fragments_not_splittable():
    # Single transaction — no fragments.
    assert _typed_item_fragments("zomato 450 upi") == []
    assert _typed_item_fragments("salary 85000 credit") == []
    assert _typed_item_fragments("petrol 1200 10/05/2026 hdfc") == []
    # A counted quantity is ONE grouped item, not a list.
    assert _typed_item_fragments("maggi 2 packet 20") == []
    # A single basket total (arithmetic with *) is not a price list.
    assert _typed_item_fragments("chai 15*2+20") == []
    # Model numbers ("6e 2345") and a bare-number "second item" ("and 500")
    # must not be read as item/price lists.
    assert _typed_item_fragments("flight 6e 2345") == []
    assert _typed_item_fragments("banana 50 and 500") == []
    # A lone item/price pair stays a single transaction.
    assert _typed_item_fragments("chai 10") == []


def test_parse_nl_input_attaches_fragments():
    today = datetime(2026, 6, 19)
    r = parse_nl_input("banana + mango 50+20", today)
    assert r["amount"] == -70.0
    assert "fragments" in r
    frags = r["fragments"]
    assert [f["description"] for f in frags] == ["Banana", "Mango"]
    assert [f["amount"] for f in frags] == [-50.0, -20.0]
    assert all(f["category"] == "Fruits" for f in frags)
    assert all(f["kind"] == "single" for f in frags)


def test_parse_nl_input_combined_is_sum_of_fragments():
    today = datetime(2026, 6, 19)
    r = parse_nl_input("2 samosay 50 upi and 1 cup coffe 15 cash", today)
    # Combined = whole basket (₹65), not the stray count "2".
    assert r["amount"] == -65.0
    assert r["description"] == "Samosay + Cup Coffe"
    assert r["quantity"] == 1
    frags = r["fragments"]
    assert [(f["description"], f["amount"], f["quantity"]) for f in frags] == [
        ("Samosay", -50.0, 2), ("Cup Coffe", -15.0, 1),
    ]


def test_fragment_transactions_per_item_payment_and_category():
    today = datetime(2026, 6, 19)
    frags = fragment_transactions("2 samosay 50 upi and 1 cup coffe 15 cash", today)
    assert len(frags) == 2
    samosa, coffe = frags
    assert samosa["description"] == "Samosay"
    assert samosa["payment_method"] == "UPI"   # its OWN method, not the line's
    assert samosa["amount"] == -50.0
    assert samosa["quantity"] == 2
    assert samosa["price"] == 25.0             # ₹50 total ÷ 2
    assert samosa["category"] == "Snacks"
    assert coffe["description"] == "Cup Coffe"
    assert coffe["payment_method"] == "Cash"
    assert coffe["amount"] == -15.0
    assert coffe["quantity"] == 1
    assert coffe["category"] == "Snacks"


def test_fragment_transactions_inherits_shared_context():
    today = datetime(2026, 6, 19)
    frags = fragment_transactions("banana + mango 50+20 yesterday upi", today)
    assert len(frags) == 2
    for f in frags:
        assert f["date"] == "2026-06-18"       # shared date inherited
        assert f["payment_method"] == "UPI"    # shared payment inherited
        assert f["amount"] < 0                 # expense list stays expenses
        assert f["txn_type"] == "debit"
        assert f["price"] == abs(f["amount"])  # per-item price = its own amount


def test_fragment_transactions_not_splittable_returns_empty():
    today = datetime(2026, 6, 19)
    assert fragment_transactions("zomato 450 upi", today) == []
    assert fragment_transactions("maggi 2 packet 20", today) == []


def test_parse_bulk_lines_flattens_fragments():
    today = datetime(2026, 6, 19)
    items = parse_bulk_lines(
        "zomato 450 upi\n2 samosay 50 upi and 1 cup coffe 15 cash", today
    )
    # The multi-item line expands into its two entries, so every one-off line
    # maps to one transaction in the bulk preview.
    assert len(items) == 3
    assert items[0]["description"] == "Zomato"
    assert items[1]["description"] == "Samosay" and items[1]["payment_method"] == "UPI"
    assert items[2]["description"] == "Cup Coffe" and items[2]["payment_method"] == "Cash"
    assert all(i["kind"] == "single" for i in items)


def test_credit_card_bill_is_an_expense_not_income():
    # "credit card bill 5000" is a ₹5000 payment — a debit. The ML model can
    # treat "credit" as an income signal, so guard against Income category
    # leaking onto a negative-amount transaction.
    today = datetime(2026, 6, 19)
    r = parse_transaction("credit card bill 5000", today)
    assert r["amount"] == -5000.0
    assert r["category"] != "Income"
    assert r["txn_type"] == "debit"

    # A genuine credit still parses as Income.
    r = parse_transaction("salary credit 50000", today)
    assert r["amount"] == 50000.0
    assert r["category"] == "Income"


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


def test_parse_transaction_clamps_future_dates():
    today = datetime(2026, 6, 19)

    # Relative future ("tomorrow") is clamped down to today.
    result = parse_transaction("zomato 200 tomorrow", today)
    assert result["date"] == "2026-06-19"

    # Explicit future dates are clamped to today too.
    result = parse_transaction("zomato 200 on 25/12/2026", today)
    assert result["date"] == "2026-06-19"

    # Past dates pass through untouched.
    result = parse_transaction("zomato 200 on 10/06/2026", today)
    assert result["date"] == "2026-06-10"

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
    # No keyword defaults: a SIP with no stated day is the generic 1st (not 11th),
    # and an explicit day is honoured.
    assert r["day"] == 1

    r = parse_nl_input("sip 1k monthly on 15th", today)
    assert r["kind"] == "recurring"
    assert r["day"] == 15

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
    # Spoken time is stripped (so it is not misread as an amount) but not stored.
    assert items[0].get("notes", "") == ""

    assert items[1]["description"] == "Gol Gappe"
    assert items[1]["amount"] == -20.0
    assert items[1]["date"] == "2026-06-19"
    assert items[1]["category"] == "Snacks"
    assert items[1].get("notes", "") == ""


def test_parse_voice_quantity_and_price_enumeration():
    today = datetime(2026, 6, 19)
    # "2 packets of lays, one ₹10 and one ₹20" -> single grouped item.
    items = parse_voice_input("aaj maine lays k 2 packet liye ek 10 ka ek 20 ka", today)
    assert len(items) == 1
    item = items[0]
    assert item["category"] == "Snacks"
    assert item["quantity"] == 2
    assert item["amount"] == -30.0
    assert item["txn_type"] == "debit"
    assert "10" in item["notes"] and "20" in item["notes"]


def test_parse_voice_hindi_script_quantity_price_is_expense():
    today = datetime(2026, 6, 19)
    items = parse_voice_input("आज मैंने लेज़ के 2 पैकेट लिये एक 10 का एक 20 का", today)
    assert len(items) == 1
    # A quantity count must never flip an expense into income.
    assert items[0]["amount"] == -30.0
    assert items[0]["quantity"] == 2


def test_parse_voice_multi_item_split_and_noise():
    today = datetime(2026, 6, 19)
    items = parse_voice_input(
        "aaj main market gaya tha aur maine chai 10 ki phir samosa 15 ka khaya "
        "aur shaam ko zomato se 450 ka khana mangaya",
        today,
    )
    # Three real transactions; the chatter ("market gaya tha") is dropped.
    assert len(items) == 3
    amounts = sorted(i["amount"] for i in items)
    assert amounts == [-450.0, -15.0, -10.0]
    # No leftover chatter verbs in descriptions.
    joined = " ".join(i["description"].lower() for i in items)
    assert "gaya" not in joined and "mangaya" not in joined


def test_parse_voice_lead_count_is_quantity_not_amount():
    today = datetime(2026, 6, 19)
    items = parse_voice_input("do plate momos 120 aur ek coffee 60", today)
    assert len(items) == 2
    assert items[0]["quantity"] == 2 and items[0]["amount"] == -120.0
    assert items[1]["quantity"] == 1 and items[1]["amount"] == -60.0


def test_detect_quantity():
    assert _detect_quantity("2 packet lays")[0] == 2
    assert _detect_quantity("3 plate momos")[0] == 3
    assert _detect_quantity("just lays")[0] == 1  # default when no unit


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


def test_parse_transaction_price_derivation():
    today = datetime(2026, 6, 19)
    
    # Test that price is derived from amount/quantity
    result = parse_transaction("2 packet lays 40", today)
    assert result["quantity"] == 2
    assert result["amount"] == -40.0
    assert result["price"] == 20.0  # 40/2 = 20
    
    # Test voice enumeration case where price = total ÷ quantity
    items = parse_voice_input("aaj maine lays k 2 packet liye ek 10 ka ek 20 ka", today)
    assert len(items) == 1
    assert items[0]["quantity"] == 2
    assert items[0]["amount"] == -30.0
    assert items[0]["price"] == 15.0  # 30/2 = 15


# ── C3 regression: "credit" keyword must not misclassify card purchases ──

def test_credit_card_purchase_is_not_income():
    """'amazon 1500 credit card' must classify as expense, not Income."""
    today = datetime(2026, 6, 19)
    result = parse_transaction("amazon 1500 credit card", today)
    assert result["category"] != "Income", (
        f"Expected category != Income, got {result['category']}"
    )
    assert result["txn_type"] == "debit"
    assert result["amount"] < 0


def test_salary_with_credit_word_is_still_income():
    """'salary 85000 credit' must still classify as Income (via 'salary')."""
    today = datetime(2026, 6, 19)
    result = parse_transaction("salary 85000 credit", today)
    assert result["category"] == "Income"
    assert result["txn_type"] == "credit"
    assert result["amount"] > 0


def test_credit_card_payment_method_detected():
    """Payment method 'Credit Card' should still be detected."""
    result = parse_transaction("amazon 1500 credit card", datetime(2026, 6, 19))
    assert result["payment_method"] == "Credit Card"
