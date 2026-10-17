"""SavingsGoalTracker.predict_goal_completion math.

Regression: average monthly savings was computed after ``abs()``-ing every
amount and then multiplied by a hard-coded ``0.2`` ("assuming 20% of income is
saved"). That made the projection reflect a made-up constant instead of the
user's real income-minus-expenses net.
"""


def _tracker():
    from ml_goals import SavingsGoalTracker
    return SavingsGoalTracker()


def _goal(target=120000.0, current=0.0, months=12.0):
    return {
        "id": "g1",
        "target_amount": target,
        "current_amount": current,
        "months_remaining": months,
        "required_monthly_savings": target / months,
    }


def test_average_monthly_savings_is_real_net():
    tracker = _tracker()
    transactions = [
        {"date": "2026-01-05", "amount": 50000.0},   # income
        {"date": "2026-01-20", "amount": -30000.0},  # expense
        {"date": "2026-02-05", "amount": 50000.0},
        {"date": "2026-02-20", "amount": -30000.0},
    ]
    out = tracker.predict_goal_completion(_goal(), transactions)
    # Net savings is 20,000/month — not 20% of the gross flows.
    assert out["average_monthly_savings"] == 20000.0
    # 20,000 * 12 = 240,000 projected against a 120,000 target.
    assert out["projected_completion_amount"] == 240000.0
    assert out["success_probability"] == 100.0


def test_negative_net_savings_is_not_inflated():
    tracker = _tracker()
    transactions = [
        {"date": "2026-01-05", "amount": 10000.0},
        {"date": "2026-01-20", "amount": -25000.0},
    ]
    out = tracker.predict_goal_completion(_goal(target=60000.0), transactions)
    # Losing 15,000/month must stay negative, not become "20% saved".
    assert out["average_monthly_savings"] == -15000.0
    assert out["success_probability"] == 0.0


def test_zero_target_does_not_crash():
    tracker = _tracker()
    transactions = [{"date": "2026-01-05", "amount": 1000.0}]
    out = tracker.predict_goal_completion(_goal(target=0.0), transactions)
    assert out["success_probability"] == 0.0
    assert "error" not in out
