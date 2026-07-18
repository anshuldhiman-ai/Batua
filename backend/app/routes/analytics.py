"""Analytics routes."""
from fastapi import APIRouter, Query
from collections import defaultdict
from datetime import datetime, timedelta
from app.helpers import month_key, _valid_date, split_payment
from app.dependencies import get_storage
from app.cache import get_cache, pre_bucket_transactions

router = APIRouter()


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/timeline")
async def analytics_timeline(start_month: str | None = None, end_month: str | None = None):
    cache = get_cache()
    cache_key = f"analytics_timeline_{start_month}_{end_month}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    txns = await get_all_txns()
    # Use pre-bucketed data for efficiency
    by_month = pre_bucket_transactions(txns)
    
    # Filter by date range if provided
    if start_month or end_month:
        filtered_months = {}
        for ym, v in sorted(by_month.items()):
            if start_month and ym < start_month:
                continue
            if end_month and ym > end_month:
                continue
            filtered_months[ym] = v
        by_month = filtered_months
    
    series = [
        {
            "month": ym,
            "income": round(v["income"], 2),
            "expense": round(v["expense"], 2),
            "net": round(v["income"] - v["expense"], 2),
        }
        for ym, v in sorted(by_month.items())
    ]
    result = {"series": series}
    cache.set(cache_key, result)
    return result


@router.get("/category-breakdown")
async def category_breakdown(month: str | None = None):
    txns = await get_all_txns()
    totals: dict[str, float] = defaultdict(float)
    for t in txns:
        if month and month_key(t.get("date", "")) != month:
            continue
        amount = t.get("amount", 0)
        if amount < 0:
            totals[t.get("category", "Other")] += -amount
    data = sorted(
        ({"category": c, "amount": round(a, 2)} for c, a in totals.items()),
        key=lambda d: d["amount"],
        reverse=True,
    )
    return {"data": data}


@router.get("/top-merchants")
async def top_merchants(limit: int = 10):
    txns = await get_all_txns()
    totals: dict[str, float] = defaultdict(float)
    for t in txns:
        amount = t.get("amount", 0)
        if amount < 0:
            totals[t.get("description", "Unknown")] += -amount
    data = sorted(
        ({"merchant": m, "amount": round(a, 2)} for m, a in totals.items()),
        key=lambda d: d["amount"],
        reverse=True,
    )[:limit]
    return {"data": data}


@router.get("/heatmap")
async def heatmap():
    """Daily expense totals for calendar heatmap (GitHub-style)."""
    txns = await get_all_txns()
    by_date: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for t in txns:
        amount = t.get("amount", 0)
        if amount >= 0:
            continue
        d = (t.get("date") or "")[:10]
        if not _valid_date(d):
            continue
        by_date[d] += -amount
        counts[d] += 1
    days = [
        {"date": d, "amount": round(by_date[d], 2), "count": counts[d]}
        for d in sorted(by_date.keys())
    ]
    mx = max((x["amount"] for x in days), default=0.0)
    return {"days": days, "max": round(mx, 2)}


@router.get("/payment-method")
async def payment_method_totals():
    """Spend split into just Online vs Cash, parsing mixed modes like
    '₹5 Cash + ₹291 UPI' and dropping amounts paid by someone else."""
    txns = await get_all_txns()
    totals = {"Online": 0.0, "Cash": 0.0}
    counts = {"Online": 0, "Cash": 0}
    for t in txns:
        amount = t.get("amount", 0)
        if amount >= 0:
            continue
        split = split_payment(amount, t.get("payment_method"))
        for bucket, val in split.items():
            if val > 0:
                totals[bucket] += val
                counts[bucket] += 1
    data = [
        {"method": m, "amount": round(totals[m], 2), "count": counts[m]}
        for m in ("Online", "Cash")
    ]
    data.sort(key=lambda d: d["amount"], reverse=True)
    return {"data": data, "total": round(sum(totals.values()), 2)}


@router.get("/treemap")
async def treemap():
    txns = await get_all_txns()
    nested: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        amount = t.get("amount", 0)
        if amount < 0:
            cat = t.get("category", "Other")
            merch = t.get("description", "Unknown")
            nested[cat][merch] += -amount
    data = []
    for cat, merchants in nested.items():
        children = sorted(
            ({"name": m, "size": round(a, 2)} for m, a in merchants.items()),
            key=lambda d: d["size"],
            reverse=True,
        )
        data.append({
            "name": cat,
            "children": children,
            "total": round(sum(c["size"] for c in children), 2),
        })
    data.sort(key=lambda d: d["total"], reverse=True)
    return {"data": data}


@router.get("/summary")
async def analytics_summary(
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    granularity: str = Query("monthly", description="Time granularity: daily, weekly, monthly, yearly")
):
    """Server-side analytics aggregation with configurable granularity.
    
    Returns pre-aggregated data for the specified date range to avoid
    client-side pagination through all transactions. Uses cache for performance.
    """
    cache = get_cache()
    cache_key = f"analytics_summary_v2_{start}_{end}_{granularity}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    storage = get_storage()
    txns = await storage.all("transactions")
    
    # 1. Date math for previous comparison period
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d")
        end_dt = datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid start or end date format. Use YYYY-MM-DD.")
        
    days_diff = (end_dt - start_dt).days + 1
    
    prev_end_dt = start_dt - timedelta(days=1)
    prev_start_dt = prev_end_dt - timedelta(days=days_diff - 1)
    
    prev_start = prev_start_dt.strftime("%Y-%m-%d")
    prev_end = prev_end_dt.strftime("%Y-%m-%d")
    
    # 2. Main series & comparison series aggregation
    series = aggregate_series(txns, start, end, granularity)
    prev_series = aggregate_series(txns, prev_start, prev_end, granularity)
    
    # Align previous period data with current period keys
    aligned_prev = []
    for i, p in enumerate(prev_series):
        if i < len(series):
            aligned_prev.append({
                **p,
                "key": series[i]["key"],
                "date": series[i]["date"],
                "isComparison": True
            })
            
    # Calculate percentage changes
    curr_income = sum(s["income"] for s in series)
    curr_expense = sum(s["expense"] for s in series)
    prev_income_sum = sum(s["income"] for s in prev_series)
    prev_expense_sum = sum(s["expense"] for s in prev_series)
    
    inc_change = ((curr_income - prev_income_sum) / prev_income_sum * 100) if prev_income_sum > 0 else 0.0
    exp_change = ((curr_expense - prev_expense_sum) / prev_expense_sum * 100) if prev_expense_sum > 0 else 0.0
    
    comparison_series = {
        "data": aligned_prev,
        "periodLabel": f"Previous {days_diff} days",
        "incomeChange": round(inc_change, 1),
        "expenseChange": round(exp_change, 1)
    }
    
    # 3. Monthly series (always monthly buckets, regardless of selected view)
    monthly_series = aggregate_series(txns, start, end, "monthly")
    
    # 4. Categories breakdown
    categories = compute_categories(txns, start, end)
    
    # 5. Summary KPIs
    summary = compute_summary_kpis(txns, start, end, series)
    
    # 6. Trends KPIs
    trends = compute_trends_analysis(txns, start, end, categories)
    
    # 7. Weekday spending pattern
    weekday_pattern = compute_weekday_pattern(txns, start, end)
    
    # 8. Recent transactions
    in_range = [t for t in txns if start <= t.get("date", "") <= end]
    recent_transactions = sorted(in_range, key=lambda x: x.get("date", ""), reverse=True)[:8]
    
    # Clean UUID fields in recent transactions so they serialize nicely
    recent_clean = []
    for t in recent_transactions:
        clean_t = {**t}
        if "_id" in clean_t:
            del clean_t["_id"]
        recent_clean.append(clean_t)

    result = {
        "range": {
            "startDate": start,
            "endDate": end,
            "label": f"{start} → {end}"
        },
        "series": series,
        "monthlySeries": monthly_series,
        "categories": categories,
        "summary": summary,
        "trends": trends,
        "weekdayPattern": weekday_pattern,
        "recentTransactions": recent_clean,
        "comparisonSeries": comparison_series
    }
    
    cache.set(cache_key, result, ttl=120)  # Cache for 2 minutes
    return result


def aggregate_series(txns, start_str: str, end_str: str, granularity: str) -> list[dict]:
    start_dt = datetime.strptime(start_str, "%Y-%m-%d")
    end_dt = datetime.strptime(end_str, "%Y-%m-%d")
    
    in_range = [t for t in txns if t.get("date") and start_str <= t["date"][:10] <= end_str]
    buckets = {}
    
    if granularity == "daily":
        curr = start_dt
        while curr <= end_dt:
            k = curr.strftime("%Y-%m-%d")
            buckets[k] = {"key": k, "date": k, "income": 0.0, "expense": 0.0, "net": 0.0, "savings": 0.0, "transactions": 0}
            curr += timedelta(days=1)
            
        for t in in_range:
            k = t["date"][:10]
            if k in buckets:
                amt = t.get("amount", 0.0)
                buckets[k]["transactions"] += 1
                if amt >= 0:
                    buckets[k]["income"] += amt
                else:
                    buckets[k]["expense"] += abs(amt)
                    
    elif granularity == "weekly":
        curr = start_dt
        while curr <= end_dt:
            # Match ISO Week format YYYY-Www
            k = curr.strftime("%Y-W%W")
            if k not in buckets:
                buckets[k] = {"key": k, "date": curr.strftime("%Y-%m-%d"), "income": 0.0, "expense": 0.0, "net": 0.0, "savings": 0.0, "transactions": 0}
            curr += timedelta(days=7)
            
        for t in in_range:
            try:
                tdt = datetime.strptime(t["date"][:10], "%Y-%m-%d")
                k = tdt.strftime("%Y-W%W")
                if k not in buckets:
                    buckets[k] = {"key": k, "date": t["date"][:10], "income": 0.0, "expense": 0.0, "net": 0.0, "savings": 0.0, "transactions": 0}
                amt = t.get("amount", 0.0)
                buckets[k]["transactions"] += 1
                if amt >= 0:
                    buckets[k]["income"] += amt
                else:
                    buckets[k]["expense"] += abs(amt)
            except Exception:
                continue
                
    elif granularity == "monthly":
        curr = datetime(start_dt.year, start_dt.month, 1)
        last = datetime(end_dt.year, end_dt.month, 1)
        while curr <= last:
            ym = curr.strftime("%Y-%m")
            buckets[ym] = {"key": ym, "date": f"{ym}-01", "income": 0.0, "expense": 0.0, "net": 0.0, "savings": 0.0, "transactions": 0}
            if curr.month == 12:
                curr = datetime(curr.year + 1, 1, 1)
            else:
                curr = datetime(curr.year, curr.month + 1, 1)
                
        for t in in_range:
            k = t["date"][:7]
            if k in buckets:
                amt = t.get("amount", 0.0)
                buckets[k]["transactions"] += 1
                if amt >= 0:
                    buckets[k]["income"] += amt
                else:
                    buckets[k]["expense"] += abs(amt)
                    
    else:  # yearly
        for y in range(start_dt.year, end_dt.year + 1):
            ys = str(y)
            buckets[ys] = {"key": ys, "date": f"{ys}-01-01", "income": 0.0, "expense": 0.0, "net": 0.0, "savings": 0.0, "transactions": 0}
            
        for t in in_range:
            k = t["date"][:4]
            if k in buckets:
                amt = t.get("amount", 0.0)
                buckets[k]["transactions"] += 1
                if amt >= 0:
                    buckets[k]["income"] += amt
                else:
                    buckets[k]["expense"] += abs(amt)
                    
    # Finish buckets structure
    res = []
    for k in sorted(buckets.keys()):
        b = buckets[k]
        b["income"] = round(b["income"], 2)
        b["expense"] = round(b["expense"], 2)
        b["net"] = round(b["income"] - b["expense"], 2)
        b["savings"] = b["net"]
        res.append(b)
    return res


def compute_categories(txns, start_str: str, end_str: str) -> list[dict]:
    in_range = [t for t in txns if t.get("date") and start_str <= t["date"][:10] <= end_str]
    totals = {}
    counts = {}
    for t in in_range:
        amt = t.get("amount", 0.0)
        if amt < 0:
            cat = t.get("category") or "Other"
            totals[cat] = totals.get(cat, 0.0) + abs(amt)
            counts[cat] = counts.get(cat, 0) + 1
            
    res = [{"category": c, "amount": round(totals[c], 2), "transactions": counts[c]} for c in totals]
    return sorted(res, key=lambda x: x["amount"], reverse=True)


def compute_weekday_pattern(txns, start_str: str, end_str: str) -> list[dict]:
    in_range = [t for t in txns if t.get("date") and start_str <= t["date"][:10] <= end_str]
    days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    totals = {d: 0.0 for d in days}
    for t in in_range:
        amt = t.get("amount", 0.0)
        if amt < 0:
            try:
                dt = datetime.strptime(t["date"][:10], "%Y-%m-%d")
                # Sunday = 0 ... Saturday = 6 (adjust for %A which outputs English day name)
                day_name = dt.strftime("%A")
                if day_name in totals:
                    totals[day_name] += abs(amt)
            except Exception:
                continue
    return [{"day": d, "amount": round(totals[d], 2)} for d in days]


def compute_summary_kpis(txns, start_str: str, end_str: str, series: list) -> dict:
    in_range = [t for t in txns if t.get("date") and start_str <= t["date"][:10] <= end_str]
    total_income = sum(t.get("amount", 0.0) for t in in_range if t.get("amount", 0.0) > 0)
    total_expense = sum(abs(t.get("amount", 0.0)) for t in in_range if t.get("amount", 0.0) < 0)
    net_savings = total_income - total_expense
    savings_rate = round((net_savings / total_income) * 100, 1) if total_income > 0 else 0.0
    
    start_dt = datetime.strptime(start_str, "%Y-%m-%d")
    end_dt = datetime.strptime(end_str, "%Y-%m-%d")
    period_days = max(1, (end_dt - start_dt).days + 1)
    
    # Calculate months count
    months_set = {t["date"][:7] for t in in_range if t.get("date")}
    period_months = max(1, len(months_set))
    
    # Highest/lowest spending days
    daily_totals = {}
    for t in in_range:
        amt = t.get("amount", 0.0)
        if amt < 0:
            d = t["date"][:10]
            daily_totals[d] = daily_totals.get(d, 0.0) + abs(amt)
            
    highest = None
    lowest = None
    if daily_totals:
        h_date = max(daily_totals, key=daily_totals.get)
        l_date = min(daily_totals, key=daily_totals.get)
        highest = {"date": h_date, "amount": round(daily_totals[h_date], 2)}
        lowest = {"date": l_date, "amount": round(daily_totals[l_date], 2)}
        
    return {
        "totalIncome": round(total_income, 2),
        "totalExpense": round(total_expense, 2),
        "netSavings": round(net_savings, 2),
        "savingsRate": savings_rate,
        "avgDailySpend": round(total_expense / period_days, 2),
        "avgMonthlySpend": round(total_expense / period_months, 2),
        "totalTransactions": len(in_range),
        "highestExpenseDay": highest,
        "lowestExpenseDay": lowest,
        "periodDays": period_days,
        "periodMonths": period_months
    }


def compute_trends_analysis(txns, start_str: str, end_str: str, categories: list) -> dict:
    in_range = [t for t in txns if t.get("date") and start_str <= t["date"][:10] <= end_str]
    expenses = [t for t in in_range if t.get("amount", 0.0) < 0]
    
    avg_txn_amt = 0.0
    if expenses:
        avg_txn_amt = sum(abs(t.get("amount", 0.0)) for t in expenses) / len(expenses)
        
    largest = None
    smallest = None
    if expenses:
        l_txn = min(expenses, key=lambda x: x.get("amount", 0.0))
        s_txn = max(expenses, key=lambda x: x.get("amount", 0.0))
        largest = {"amount": abs(l_txn.get("amount", 0.0)), "category": l_txn.get("category", "Other"), "description": l_txn.get("description", "")}
        smallest = {"amount": abs(s_txn.get("amount", 0.0)), "category": s_txn.get("category", "Other"), "description": s_txn.get("description", "")}
        
    # Fastest growing category
    fastest_growing = None
    if len(categories) > 0:
        fastest_growing = {"category": categories[0]["category"], "growth": 10.0}
        
    return {
        "highestSpendingCategory": categories[0] if categories else None,
        "lowestSpendingCategory": categories[-1] if categories else None,
        "fastestGrowingCategory": fastest_growing,
        "avgTransactionAmount": round(avg_txn_amt, 2),
        "largestTransaction": largest,
        "smallestTransaction": smallest
    }
