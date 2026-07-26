"""Unit tests for app/helpers.py — pure utility functions."""
import pytest
from app.helpers import (
    month_key,
    _valid_date,
    _require_valid_date,
    _kind,
    _with_kind,
    _shift_month,
    _pct_change,
    _default_month,
    _txn_key,
    _payment_bucket,
    split_payment,
    _weekday_of,
    _hour_of,
)
from fastapi import HTTPException


class TestMonthKey:
    def test_extracts_yyyy_mm(self):
        assert month_key("2026-06-15") == "2026-06"

    def test_handles_empty_string(self):
        assert month_key("") == ""

    def test_handles_none(self):
        assert month_key(None) == ""


class TestValidDate:
    def test_valid_date(self):
        assert _valid_date("2026-06-15") is True
        assert _valid_date("2024-02-29") is True  # leap year

    def test_invalid_date(self):
        assert _valid_date("not-a-date") is False
        assert _valid_date("2026-13-01") is False  # month > 12
        assert _valid_date("2026-00-01") is False  # month < 1

    def test_out_of_range_year(self):
        assert _valid_date("1800-01-01") is False  # < 1900

    def test_wrong_format(self):
        assert _valid_date("01-01-2026") is False  # not YYYY-MM-DD
        assert _valid_date("2026/01/01") is False  # wrong separator
        assert _valid_date("short") is False


class TestRequireValidDate:
    def test_passes_valid_date(self):
        _require_valid_date("2026-06-15")  # should not raise

    def test_raises_on_invalid_date(self):
        with pytest.raises(HTTPException) as exc:
            _require_valid_date("bad-date")
        assert exc.value.status_code == 400


class TestKind:
    def test_credit_for_positive(self):
        assert _kind(100) == "credit"
        assert _kind(0) == "credit"

    def test_debit_for_negative(self):
        assert _kind(-50) == "debit"

    def test_handles_none(self):
        assert _kind(None) == "credit"


class TestWithKind:
    def test_adds_txn_type(self):
        result = _with_kind({"amount": -100})
        assert result["txn_type"] == "debit"

    def test_overwrites_existing_txn_type(self):
        result = _with_kind({"amount": 500, "txn_type": "debit"})
        assert result["txn_type"] == "credit"


class TestShiftMonth:
    def test_next_month(self):
        assert _shift_month("2026-01", 1) == "2026-02"

    def test_previous_month(self):
        assert _shift_month("2026-01", -1) == "2025-12"

    def test_crosses_year(self):
        assert _shift_month("2025-12", 1) == "2026-01"
        assert _shift_month("2026-01", -1) == "2025-12"

    def test_zero_delta(self):
        assert _shift_month("2026-06", 0) == "2026-06"

    def test_multi_month_shift(self):
        assert _shift_month("2026-01", 12) == "2027-01"
        assert _shift_month("2026-01", -12) == "2025-01"


class TestPctChange:
    def test_positive_change(self):
        assert _pct_change(150, 100) == 50.0

    def test_negative_change(self):
        assert _pct_change(80, 100) == -20.0

    def test_no_change(self):
        assert _pct_change(100, 100) == 0.0

    def test_zero_prev_with_curr(self):
        assert _pct_change(100, 0) == 100.0  # infinite growth → 100%

    def test_both_zero(self):
        assert _pct_change(0, 0) == 0.0

    def test_negative_prev(self):
        # From -100 to -50 is an improvement of +50% (less negative)
        assert _pct_change(-50, -100) == 50.0


class TestDefaultMonth:
    def test_returns_latest_past_month(self):
        months = ["2025-01", "2025-06", "2026-06"]
        result = _default_month(months)
        assert int(result[:4]) >= 2025

    def test_falls_back_to_current_month_for_empty_list(self):
        from datetime import datetime
        result = _default_month([])
        assert result == datetime.now().strftime("%Y-%m")

    def test_ignores_future_months(self):
        months = ["2025-01", "2025-06", "2029-01"]
        result = _default_month(months)
        assert result <= "2025-06" or result == "2025-06"


class TestTxnKey:
    def test_creates_deterministic_key(self):
        txn = {"date": "2026-06-15", "description": "  Zomato  ", "amount": -450.0,
               "category": " Food ", "payment_method": "UPI"}
        key = _txn_key(txn)
        assert len(key) == 5
        assert key[0] == "2026-06-15"
        assert key[1] == "zomato"
        assert key[3] == "food"

    def test_same_data_produces_same_key(self):
        a = _txn_key({"date": "2026-01-01", "description": "X", "amount": 100.0,
                      "category": "Y", "payment_method": "Z"})
        b = _txn_key({"date": "2026-01-01", "description": "X", "amount": 100.0,
                      "category": "Y", "payment_method": "Z"})
        assert a == b


class TestPaymentBucket:
    def test_cash(self):
        assert _payment_bucket("Cash") == "Cash"

    def test_online(self):
        assert _payment_bucket("UPI") == "Online"
        assert _payment_bucket("Card") == "Online"
        assert _payment_bucket("Google Pay") == "Online"

    def test_external(self):
        assert _payment_bucket("Mummy") is None
        assert _payment_bucket("Friend") is None

    def test_unknown_defaults_to_none(self):
        assert _payment_bucket("Bitcoin") is None

    def test_case_insensitive(self):
        assert _payment_bucket("cash") == "Cash"
        assert _payment_bucket("upi") == "Online"


class TestSplitPayment:
    def test_simple_mode_attributes_whole_amount(self):
        result = split_payment(-500, "Cash")
        assert result["Cash"] == 500
        assert result["Online"] == 0

    def test_split_mode(self):
        result = split_payment(-296, "₹5 Cash + ₹291 UPI")
        assert result["Cash"] == 5
        assert result["Online"] == 291

    def test_external_split_is_excluded(self):
        result = split_payment(-1000, "500 Mummy + 500 Online")
        assert result["Online"] == 500
        assert result["Cash"] == 0

    def test_blank_mode_defaults_to_online(self):
        result = split_payment(-200, "")
        assert result["Online"] == 200

    def test_unknown_mode_defaults_to_online(self):
        result = split_payment(-300, "SomeRandomMethod")
        assert result["Online"] == 300


class TestWeekdayOf:
    def test_returns_weekday_for_valid_date(self):
        # 2026-06-15 is a Monday → 0
        assert _weekday_of({"date": "2026-06-15"}) == 0
        # 2026-06-21 is a Sunday → 6
        assert _weekday_of({"date": "2026-06-21"}) == 6

    def test_returns_0_for_invalid_date(self):
        assert _weekday_of({"date": "bad-date"}) == 0
        assert _weekday_of({"no_date": True}) == 0


class TestHourOf:
    def test_returns_category_typical_hour(self):
        result = _hour_of({"date": "2026-06-15", "category": "Food & Dining"})
        assert result == 19

    def test_returns_pseudo_hour_for_unknown_category(self):
        result = _hour_of({"date": "2026-06-15", "description": "random thing"})
        assert 8 <= result <= 21

    def test_extracts_hour_from_datetime_string(self):
        result = _hour_of({"date": "2026-06-15T14:30:00", "category": "Income"})
        assert result == 14
