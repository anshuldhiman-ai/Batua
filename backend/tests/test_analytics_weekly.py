"""Regression tests for weekly analytics bucketing.

The old implementation used strftime("%Y-W%W"), which is NOT an ISO week:
  - A calendar week spanning the year boundary was split into two buckets
    (e.g. 2025-12-29..2026-01-04 became "2025-W52" + "2026-W00").
  - Bucket generation started at the range start instead of the week's
    Monday, so a 7-day range could yield two partial, misaligned buckets.
"""
from app.routes.analytics import aggregate_series, compute_trends_analysis


def test_weekly_does_not_split_year_boundary_week():
    # Dec 29 2025 – Jan 4 2026 is a single ISO week (2026-W01).
    txns = [
        {"date": "2025-12-29", "amount": -100.0},
        {"date": "2025-12-31", "amount": -50.0},
        {"date": "2026-01-01", "amount": -25.0},
        {"date": "2026-01-04", "amount": -25.0},
    ]
    series = aggregate_series(txns, "2025-12-29", "2026-01-04", "weekly")

    assert len(series) == 1, f"expected 1 bucket, got {[s['key'] for s in series]}"
    assert series[0]["key"] == "2026-W01"
    assert series[0]["expense"] == 200.0
    assert series[0]["transactions"] == 4


def test_fastest_growing_category_is_computed_not_hardcoded():
    # Food Delivery jumps from ₹100 in the first half to ₹300 in the second;
    # Shopping falls from ₹200 to ₹50. The "fastest growing" must be real, not
    # the old hardcoded 10.0 stub.
    txns = [
        {"date": "2026-01-05", "amount": -100.0, "category": "Food Delivery"},
        {"date": "2026-01-20", "amount": -200.0, "category": "Shopping"},
        {"date": "2026-02-05", "amount": -300.0, "category": "Food Delivery"},
        {"date": "2026-02-15", "amount": -50.0, "category": "Shopping"},
    ]
    categories = [
        {"category": "Food Delivery", "amount": 400.0, "transactions": 2},
        {"category": "Shopping", "amount": 250.0, "transactions": 2},
    ]
    result = compute_trends_analysis(txns, "2026-01-01", "2026-02-28", categories)
    fastest = result["fastestGrowingCategory"]
    assert fastest is not None
    assert fastest["category"] == "Food Delivery"
    assert fastest["growth"] == 200.0
    assert result["avgTransactionAmount"] == round(650.0 / 4, 2)


def test_weekly_seven_day_range_totals_are_complete():
    # Wed Jan 7 – Tue Jan 13 2026. Old code produced two buckets whose
    # boundaries disagreed with calendar weeks; totals must still be complete
    # and every transaction counted exactly once.
    txns = [
        {"date": "2026-01-07", "amount": -10.0},  # Wed
        {"date": "2026-01-11", "amount": -20.0},  # Sun
        {"date": "2026-01-12", "amount": -30.0},  # Mon -> next calendar week
        {"date": "2026-01-13", "amount": -40.0},  # Tue
    ]
    series = aggregate_series(txns, "2026-01-07", "2026-01-13", "weekly")

    assert sum(s["expense"] for s in series) == 100.0
    assert sum(s["transactions"] for s in series) == 4
    keys = [s["key"] for s in series]
    assert len(keys) == len(set(keys)), "duplicate week keys"
    assert all(not k.endswith("W00") for k in keys), "week 00 is not an ISO week"


def test_weekly_income_and_expense_split():
    # Mon Feb 2 – Sun Feb 8 2026 is exactly one ISO week (2026-W06).
    txns = [
        {"date": "2026-02-02", "amount": -500.0},  # Monday
        {"date": "2026-02-03", "amount": 1000.0},  # salary
        {"date": "2026-02-05", "amount": -200.0},
    ]
    series = aggregate_series(txns, "2026-02-02", "2026-02-08", "weekly")

    assert len(series) == 1, f"expected 1 bucket, got {[s['key'] for s in series]}"
    assert series[0]["income"] == 1000.0
    assert series[0]["expense"] == 700.0


def test_weekly_multiple_weeks_bucket_labels():
    # Mon Feb 9 – Sun Mar 1 2026 spans three ISO weeks.
    txns = [
        {"date": "2026-02-09", "amount": -10.0},   # W07
        {"date": "2026-02-16", "amount": -20.0},   # W08
        {"date": "2026-02-25", "amount": -30.0},   # W09
    ]
    series = aggregate_series(txns, "2026-02-09", "2026-03-01", "weekly")

    assert [s["key"] for s in series] == ["2026-W07", "2026-W08", "2026-W09"]
    assert [s["expense"] for s in series] == [10.0, 20.0, 30.0]
