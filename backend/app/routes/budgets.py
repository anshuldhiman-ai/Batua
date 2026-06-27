"""Budget routes."""
from fastapi import APIRouter, HTTPException
from collections import defaultdict
from app.models import Budget, BudgetCreate
from app.helpers import month_key, _default_month
from app.dependencies import get_storage

router = APIRouter()


@router.get("/")
async def list_budgets():
    storage = get_storage()
    return {"budgets": await storage.all("budgets")}


@router.post("/")
async def upsert_budget(payload: BudgetCreate):
    storage = get_storage()
    existing = await storage.all("budgets", {"category": payload.category})
    if existing:
        updated = await storage.update("budgets", existing[0]["id"], {"limit": payload.limit})
        return updated
    budget = Budget(category=payload.category, limit=payload.limit)
    await storage.insert("budgets", budget.model_dump())
    return budget.model_dump()


@router.delete("/{budget_id}")
async def delete_budget(budget_id: str):
    storage = get_storage()
    ok = await storage.delete("budgets", budget_id)
    if not ok:
        raise HTTPException(404, "Budget not found")
    return {"deleted": 1}


@router.get("/status")
async def budget_status(month: str | None = None):
    storage = get_storage()
    budgets = await storage.all("budgets")
    txns = await storage.all("transactions")
    if not month:
        months = sorted({month_key(t["date"]) for t in txns if t.get("date")})
        month = _default_month(months)

    spent: dict[str, float] = defaultdict(float)
    for t in txns:
        if month_key(t.get("date", "")) == month and t["amount"] < 0:
            spent[t.get("category", "Other")] += -t["amount"]

    rows = []
    for b in budgets:
        used = round(spent.get(b["category"], 0.0), 2)
        limit = b["limit"]
        pct = round(used / limit * 100, 1) if limit > 0 else 0.0
        rows.append({
            "id": b["id"],
            "category": b["category"],
            "limit": limit,
            "spent": used,
            "remaining": round(limit - used, 2),
            "pct": pct,
            "status": "over" if pct > 100 else ("warn" if pct >= 80 else "ok"),
        })
    rows.sort(key=lambda r: r["pct"], reverse=True)
    return {"month": month, "rows": rows}
