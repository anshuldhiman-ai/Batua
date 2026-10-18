"""Regression tests for the AI Insights engine (analysis + forecasting).

Root causes these lock down:

* recommendations keyed off four exact category *names*
  ("Subscriptions"/"Food Delivery"/"Entertainment"/"Shopping"), so any other
  taxonomy produced an empty list — the page sat on "all within safety
  boundaries" while obvious discretionary spend went unmentioned;
* the forecast fitted a least-squares line through the *net* monthly series,
  skipping months with no rows, so gaps compressed time and the "prediction"
  was a line through noise;
* recurring-cost detection could not tell a monthly bill from a daily habit.
"""
import pytest

from ml_analytics import (
    SpendingPatternAnalyzer,
    CashFlowForecaster,
    detect_recurring_commitments,
    _FORECAST_CANDIDATES,
)
from ml_goals import RecommendationEngine

_CANDIDATE_NAMES = {name for name, _ in _FORECAST_CANDIDATES}


def _tx(date, amount, category, description="test"):
    return {"date": date, "amount": amount, "category": category, "description": description}


def _months(n, start_year=2026):
    """n consecutive 'YYYY-MM' labels from January of start_year."""
    out, y, m = [], start_year, 1
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


# ── Recommendations ─────────────────────────────────────────────────────────

def test_recommendations_work_for_arbitrary_category_names():
    # None of these labels existed in the old hard-coded list. Real
    # discretionary spending is several uneven purchases a month — not one
    # uniform monthly charge, which would (rightly) look like a bill.
    txns = []
    for month in _months(6):
        txns.append(_tx(f"{month}-05", -1200.0, "Chai & Samosa"))
        txns.append(_tx(f"{month}-11", -1800.0, "Chai & Samosa"))
        txns.append(_tx(f"{month}-22", -900.0, "Chai & Samosa"))
        txns.append(_tx(f"{month}-09", -1500.0, "Gadget Vault"))
        txns.append(_tx(f"{month}-19", -800.0, "Gadget Vault"))
        txns.append(_tx(f"{month}-01", 50000.0, "Paycheck"))

    out = RecommendationEngine().generate_recommendations(txns)

    assert out["empty"] is False
    titles = " ".join(r["title"] for r in out["recommendations"])
    assert "Chai & Samosa" in titles
    assert out["total_potential_monthly_savings"] > 0
    # The largest discretionary category is prioritised first.
    assert out["recommendations"][0]["category"] == "Chai & Samosa"


def test_recommendations_skip_investments_and_fixed_commitments():
    txns = []
    for month in _months(6):
        txns.append(_tx(f"{month}-05", -8000.0, "Monthly SIP"))     # investment + fixed
        txns.append(_tx(f"{month}-07", -700.0, "Weekend Fun"))      # discretionary
        txns.append(_tx(f"{month}-14", -700.0, "Weekend Fun"))
        txns.append(_tx(f"{month}-21", -600.0, "Weekend Fun"))
    out = RecommendationEngine().generate_recommendations(txns)
    categories = [r.get("category") for r in out["recommendations"]]
    assert "Monthly SIP" not in categories
    assert "Weekend Fun" in categories


def test_recommendations_empty_for_empty_input():
    out = RecommendationEngine().generate_recommendations([])
    assert out["empty"] is True
    assert out["recommendations"] == []


# ── Recurring commitments ───────────────────────────────────────────────────

def test_recurring_commitments_separate_bills_from_habits():
    txns = []
    for month in _months(6):
        txns.append(_tx(f"{month}-02", -700.0, "Utilities"))           # one bill a month
        for day in range(1, 9):
            txns.append(_tx(f"{month}-{day:02d}", -60.0, "Snacks"))    # 8 hits a month

    out = detect_recurring_commitments(txns)

    assert "Utilities" in [c["category"] for c in out["categories"]]
    assert "Snacks" not in [c["category"] for c in out["categories"]]
    assert out["fixed_monthly_total"] > 0


def test_subscription_detection_requires_a_fixed_price():
    txns = []
    prices = [199.0, 649.0, 240.0, 399.0, 500.0, 300.0]  # a variable "recharge"
    for month, price in zip(_months(6), prices):
        txns.append(_tx(f"{month}-03", -price, "Utilities", description="Airtel Recharge"))
    for month in _months(6):
        txns.append(_tx(f"{month}-04", -499.0, "Entertainment", description="Netflix"))

    out = detect_recurring_commitments(txns)
    payees = [s["payee"] for s in out["subscriptions"]]
    assert "netflix" in payees
    assert "airtel recharge" not in payees


# ── Forecast ────────────────────────────────────────────────────────────────

def test_forecast_uses_a_continuous_month_axis():
    # March is missing entirely; the model must still see Jan..Aug as 8 months.
    txns = []
    for month in ["2026-01", "2026-02", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]:
        txns.append(_tx(f"{month}-10", 50000.0, "Income"))
        txns.append(_tx(f"{month}-12", -20000.0, "Expenses"))

    out = CashFlowForecaster().forecast_cash_flow(txns, months_ahead=3)

    assert out["empty"] is False
    assert out["months_observed"] == 8
    assert out["average_monthly_income"] == pytest.approx(50000 * 7 / 8)
    assert out["average_monthly_expense"] == pytest.approx(20000 * 7 / 8)


def test_forecast_bands_grow_with_horizon_and_beat_the_naive_baseline():
    txns = []
    for i, month in enumerate(_months(10)):
        txns.append(_tx(f"{month}-01", 50000.0, "Income"))
        txns.append(_tx(f"{month}-05", float(-(20000 + 300 * i)), "Expenses"))

    out = CashFlowForecaster().forecast_cash_flow(txns, months_ahead=3)

    for row in out["forecast"]:
        assert row["lower"] <= row["predicted_cashflow"] <= row["upper"]
    widths = [r["upper"] - r["lower"] for r in out["forecast"]]
    assert widths == sorted(widths)
    assert out["backtest"]["folds"] == 3
    assert out["backtest"]["beats_baseline"] is True


def test_forecast_reports_the_method_for_each_component():
    txns = []
    for i, month in enumerate(_months(10)):
        txns.append(_tx(f"{month}-01", 50000.0, "Income"))
        txns.append(_tx(f"{month}-05", float(-(20000 + 300 * i)), "Expenses"))

    out = CashFlowForecaster().forecast_cash_flow(txns, months_ahead=3)

    assert out["components"]["income"] is not None
    assert out["components"]["expense"] is not None
    assert out["components"]["income"]["method"] in _CANDIDATE_NAMES
    assert out["components"]["expense"]["method"] in _CANDIDATE_NAMES
    assert out["method"] in _CANDIDATE_NAMES | {"combined", "average"}


def test_forecast_survives_a_single_month_of_data():
    out = CashFlowForecaster().forecast_cash_flow([_tx("2026-05-10", -500.0, "Food")], 3)
    assert out["empty"] is False
    assert len(out["forecast"]) == 3


# ── Spending patterns payload ───────────────────────────────────────────────

def test_spending_patterns_expose_fixed_vs_discretionary_split():
    txns = []
    for month in _months(6):
        txns.append(_tx(f"{month}-02", -700.0, "Utilities"))       # one bill a month
        txns.append(_tx(f"{month}-20", -1500.0, "Fun"))            # discretionary
        txns.append(_tx(f"{month}-24", -900.0, "Fun"))
        txns.append(_tx(f"{month}-27", -600.0, "Fun"))

    out = SpendingPatternAnalyzer().analyze_patterns(txns)

    assert "recurring_commitments" in out
    split = out["fixed_vs_discretionary"]
    assert split["fixed_monthly"] > 0
    assert split["discretionary_monthly"] > 0
    assert 0 <= split["fixed_share"] <= 1
