"""Transaction CRUD routes."""
from fastapi import APIRouter, HTTPException
from app.models import Transaction, TransactionCreate, TransactionUpdate, BulkCreate, BulkDelete, RecurringCreate
from app.helpers import _require_valid_date, _kind, _with_kind, _txn_key
from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache
import calendar

router = APIRouter()


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/")
async def list_transactions(
    search: str | None = None,
    category: str | None = None,
    payment_method: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    txn_type: str | None = None,  # income | expense
    page: int = 1,
    page_size: int = 25,
):
    txns = await get_all_txns()

    if search:
        s = search.lower().strip()

        def _match_txn(t):
            from datetime import datetime
            parts = [
                t.get("description", ""), t.get("notes", ""),
                t.get("category", ""), t.get("payment_method", ""),
                (t.get("date", "") or "")[:10],
            ]
            hay = " ".join(p for p in parts if p).lower()
            try:
                dt = datetime.strptime((t.get("date") or "")[:10], "%Y-%m-%d")
                hay += " " + dt.strftime("%d %b %Y %B %A").lower()
            except Exception:
                pass
            return s in hay

        txns = [t for t in txns if _match_txn(t)]
    if category and category != "All":
        txns = [t for t in txns if t.get("category") == category]
    if payment_method and payment_method != "All":
        txns = [t for t in txns if t.get("payment_method") == payment_method]
    if start_date:
        txns = [t for t in txns if t.get("date", "") >= start_date]
    if end_date:
        txns = [t for t in txns if t.get("date", "") <= end_date]
    if txn_type == "income":
        txns = [t for t in txns if t.get("amount", 0) > 0]
    elif txn_type == "expense":
        txns = [t for t in txns if t.get("amount", 0) < 0]

    txns.sort(key=lambda t: (t.get("date", ""), t.get("created_at", "")), reverse=True)

    total = len(txns)
    page = max(1, page)
    start = (page - 1) * page_size
    items = [_with_kind(t) for t in txns[start : start + page_size]]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size else 1,
    }


@router.post("/")
async def create_transaction(payload: TransactionCreate):
    _require_valid_date(payload.date)
    txn = Transaction(**payload.model_dump())
    txn.txn_type = _kind(txn.amount)
    storage = get_storage()
    await storage.insert("transactions", txn.model_dump())
    invalidate_analytics_cache()  # Invalidate cache on insert
    return txn.model_dump()


@router.post("/bulk")
async def bulk_create(payload: BulkCreate):
    docs = []
    for item in payload.items:
        _require_valid_date(item.date)
        txn = Transaction(**item.model_dump())
        txn.txn_type = _kind(txn.amount)
        docs.append(txn.model_dump())
    storage = get_storage()
    inserted = await storage.insert_many("transactions", docs)
    invalidate_analytics_cache()  # Invalidate cache on bulk insert
    return {"inserted": inserted}


@router.post("/recurring")
async def create_recurring(payload: RecurringCreate):
    if not payload.months:
        raise HTTPException(400, "Select at least one month")
    
    storage = get_storage()
    existing = await get_all_txns()
    seen = {_txn_key(t) for t in existing}
    
    docs = []
    for ym in payload.months:
        try:
            y, m = int(ym[:4]), int(ym[5:7])
            last = calendar.monthrange(y, m)[1]
            day = min(max(payload.day, 1), last)
            date_str = f"{y:04d}-{m:02d}-{day:02d}"
        except Exception:
            continue
        txn = Transaction(
            date=date_str,
            description=payload.description,
            amount=payload.amount,
            category=payload.category,
            payment_method=payload.payment_method,
            notes=payload.notes,
        )
        txn.txn_type = _kind(txn.amount)
        # Skip if this transaction already exists (idempotency check)
        if _txn_key(txn.model_dump()) not in seen:
            docs.append(txn.model_dump())
    
    inserted = await storage.insert_many("transactions", docs)
    invalidate_analytics_cache()  # Invalidate cache on recurring insert
    return {"inserted": inserted, "months": len(docs), "skipped": len(payload.months) - len(docs)}


@router.put("/{txn_id}")
async def update_transaction(txn_id: str, payload: TransactionUpdate):
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "date" in patch:
        _require_valid_date(patch["date"])
    if not patch:
        storage = get_storage()
        existing = await storage.get("transactions", txn_id)
        if not existing:
            raise HTTPException(404, "Transaction not found")
        return _with_kind(existing)
    if "amount" in patch:
        patch["txn_type"] = _kind(patch["amount"])
    storage = get_storage()
    updated = await storage.update("transactions", txn_id, patch)
    if not updated:
        raise HTTPException(404, "Transaction not found")
    invalidate_analytics_cache()  # Invalidate cache on update
    return _with_kind(updated)


@router.post("/bulk-delete")
async def bulk_delete(payload: BulkDelete):
    storage = get_storage()
    removed = await storage.delete_many("transactions", payload.ids)
    invalidate_analytics_cache()  # Invalidate cache on bulk delete
    return {"deleted": removed}


@router.delete("/{txn_id}")
async def delete_transaction(txn_id: str):
    storage = get_storage()
    ok = await storage.delete("transactions", txn_id)
    if not ok:
        raise HTTPException(404, "Transaction not found")
    invalidate_analytics_cache()  # Invalidate cache on delete
    return {"deleted": 1}


@router.delete("/")
async def wipe_transactions():
    storage = get_storage()
    n = await storage.clear("transactions")
    invalidate_analytics_cache()  # Invalidate cache on wipe
    return {"deleted": n}
