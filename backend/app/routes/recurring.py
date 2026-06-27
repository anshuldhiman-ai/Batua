"""Recurring expense detection route."""
from fastapi import APIRouter
from collections import defaultdict
from app.helpers import month_key
from app.dependencies import get_storage

router = APIRouter()


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/")
async def recurring():
    txns = await get_all_txns()
    by_merchant: dict[str, dict] = defaultdict(lambda: {"months": set(), "total": 0.0, "count": 0})
    for t in txns:
        if t["amount"] >= 0:
            continue
        key = t.get("description", "Unknown").strip().lower()
        rec = by_merchant[key]
        rec["months"].add(month_key(t.get("date", "")))
        rec["total"] += -t["amount"]
        rec["count"] += 1
        rec["label"] = t.get("description", "Unknown")
        rec["category"] = t.get("category", "Other")

    rows = []
    for rec in by_merchant.values():
        if len(rec["months"]) >= 3:
            rows.append({
                "merchant": rec.get("label", "Unknown"),
                "category": rec.get("category", "Other"),
                "months": len(rec["months"]),
                "occurrences": rec["count"],
                "total": round(rec["total"], 2),
                "avg": round(rec["total"] / rec["count"], 2),
            })
    rows.sort(key=lambda r: r["total"], reverse=True)
    return {"recurring": rows}
