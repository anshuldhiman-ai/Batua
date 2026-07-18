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
    granularity: str = Query("monthly", description="Time granularity: daily, weekly, monthly")
):
    """Server-side analytics aggregation with configurable granularity.
    
    Returns pre-aggregated data for the specified date range to avoid
    client-side pagination through all transactions. Uses cache for performance.
    """
    cache = get_cache()
    cache_key = f"analytics_summary_{start}_{end}_{granularity}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    storage = get_storage()
    txns = await storage.all("transactions")
    
    # Filter by date range
    filtered = []
    for t in txns:
        date_str = t.get("date", "")
        if not date_str or not _valid_date(date_str[:10]):
            continue
        if start and date_str < start:
            continue
        if end and date_str > end:
            continue
        filtered.append(t)
    
    # Aggregate based on granularity
    if granularity == "daily":
        buckets = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
        for t in filtered:
            date_str = t.get("date", "")[:10]
            amount = t.get("amount", 0)
            if amount > 0:
                buckets[date_str]["income"] += amount
            else:
                buckets[date_str]["expense"] += -amount
        
        series = [
            {"date": d, "income": round(v["income"], 2), "expense": round(v["expense"], 2)}
            for d, v in sorted(buckets.items())
        ]
        
    elif granularity == "weekly":
        buckets = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
        for t in filtered:
            date_str = t.get("date", "")
            if not date_str:
                continue
            try:
                dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
                week_key = dt.strftime("%Y-W%W")  # ISO week
                amount = t.get("amount", 0)
                if amount > 0:
                    buckets[week_key]["income"] += amount
                else:
                    buckets[week_key]["expense"] += -amount
            except ValueError:
                continue
        
        series = [
            {"week": w, "income": round(v["income"], 2), "expense": round(v["expense"], 2)}
            for w, v in sorted(buckets.items())
        ]
        
    else:  # monthly (default)
        buckets = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
        for t in filtered:
            date_str = t.get("date", "")
            if not date_str or len(date_str) < 7:
                continue
            month = date_str[:7]
            amount = t.get("amount", 0)
            if amount > 0:
                buckets[month]["income"] += amount
            else:
                buckets[month]["expense"] += -amount
        
        series = [
            {"month": m, "income": round(v["income"], 2), "expense": round(v["expense"], 2)}
            for m, v in sorted(buckets.items())
        ]
    
    result = {
        "granularity": granularity,
        "start": start,
        "end": end,
        "series": series,
        "total_transactions": len(filtered)
    }
    cache.set(cache_key, result, ttl=120)  # 2 minute cache
    return result
