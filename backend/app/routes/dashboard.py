"""Dashboard routes."""
from fastapi import APIRouter
from collections import defaultdict
from app.helpers import month_key, _shift_month, _pct_change, _default_month
from app.dependencies import get_storage
from app.cache import get_cache, pre_bucket_transactions

router = APIRouter()


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/metrics")
async def dashboard_metrics():
    cache = get_cache()
    cached = cache.get("dashboard_metrics")
    if cached:
        return cached
    
    txns = await get_all_txns()
    if not txns:
        return {
            "income": 0, "expense": 0, "net": 0, "savings_rate": 0,
            "top_categories": [], "income_change": 0, "expense_change": 0,
            "net_change": 0, "txn_count": 0, "current_month": "",
            "investments": 0, "investments_change": 0, "investments_total": 0,
            "funds_left": 0, "total_income": 0, "total_expense": 0,
            "total_savings": 0, "total_savings_rate": 0,
            "avg_monthly_expense": 0, "avg_savings_rate": 0, "month_count": 0,
        }

    months = sorted({month_key(t["date"]) for t in txns if t.get("date")})
    current = _default_month(months)
    prev = _shift_month(current, -1) if current else ""

    # Use pre-bucketed data for efficiency
    by_month = pre_bucket_transactions(txns)
    
    def agg(ym: str):
        data = by_month.get(ym, {"income": 0.0, "expense": 0.0, "investments": 0.0})
        return data["income"], data["expense"], data["investments"]

    income, expense, investments = agg(current)
    p_income, p_expense, p_investments = agg(prev)
    net = income - expense  # funds left this month (negative = overspent)
    p_net = p_income - p_expense
    savings_rate = round(net / income * 100, 1) if income > 0 else 0.0
    investments_total = -sum(
        t["amount"] for t in txns if t["amount"] < 0 and t.get("category") == "Investments"
    )

    # All-time totals + monthly averages.
    total_income = sum(t["amount"] for t in txns if t["amount"] > 0)
    total_expense = -sum(t["amount"] for t in txns if t["amount"] < 0)
    total_savings = total_income - total_expense
    total_savings_rate = round(total_savings / total_income * 100, 1) if total_income > 0 else 0.0
    
    # Use pre-bucketed data for monthly averages
    month_count = len(by_month)
    avg_monthly_expense = round(total_expense / month_count, 2) if month_count else 0.0
    rates = [(v["income"] - v["expense"]) / v["income"] * 100 for v in by_month.values() if v["income"] > 0]
    avg_savings_rate = round(sum(rates) / len(rates), 1) if rates else 0.0

    cat_totals: dict[str, float] = defaultdict(float)
    for t in txns:
        if month_key(t["date"]) == current and t["amount"] < 0:
            cat_totals[t.get("category", "Other")] += -t["amount"]
    top = sorted(cat_totals.items(), key=lambda kv: kv[1], reverse=True)[:5]

    result = {
        "income": round(income, 2),
        "expense": round(expense, 2),
        "net": round(net, 2),
        "savings_rate": savings_rate,
        "top_categories": [{"category": c, "amount": round(a, 2)} for c, a in top],
        "income_change": _pct_change(income, p_income),
        "expense_change": _pct_change(expense, p_expense),
        "net_change": _pct_change(net, p_net),
        "investments": round(investments, 2),
        "investments_change": _pct_change(investments, p_investments),
        "investments_total": round(investments_total, 2),
        "funds_left": round(net, 2),
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "total_savings": round(total_savings, 2),
        "total_savings_rate": total_savings_rate,
        "avg_monthly_expense": avg_monthly_expense,
        "avg_savings_rate": avg_savings_rate,
        "month_count": month_count,
        "txn_count": len(txns),
        "current_month": current,
    }

    # Cache the result
    cache.set("dashboard_metrics", result)
    return result
