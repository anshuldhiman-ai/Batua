"""Transaction CRUD routes."""
from fastapi import APIRouter, HTTPException, UploadFile, File
from app.models import Transaction, TransactionCreate, TransactionUpdate, BulkCreate, BulkDelete, RecurringCreate
from app.helpers import _require_valid_date, _clamp_date, _kind, _with_kind, _txn_key
from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache
import asyncio
import calendar
import ai

router = APIRouter()


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/descriptions")
async def list_descriptions():
    """Get unique transaction descriptions for autocomplete suggestions."""
    txns = await get_all_txns()
    # Dedupe case-insensitively: "Zomato" and "zomato" are one merchant, and
    # showing both would render as a duplicate suggestion.
    descriptions: dict[str, str] = {}
    for t in txns:
        desc = (t.get("description") or "").strip()
        if not desc:
            continue
        descriptions.setdefault(desc.casefold(), desc)
    return {"descriptions": sorted(descriptions.values(), key=str.casefold)}


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
    storage = get_storage()
    
    # Build database-level query for filterable fields
    db_query = {}
    if category and category != "All":
        db_query["category"] = category
    if payment_method and payment_method != "All":
        db_query["payment_method"] = payment_method
    if start_date:
        db_query["date"] = {"$gte": start_date} if storage.__class__.__name__ == "MongoStorage" else start_date
    if end_date:
        if storage.__class__.__name__ == "MongoStorage":
            if "date" in db_query and isinstance(db_query["date"], dict):
                db_query["date"]["$lte"] = end_date
            else:
                db_query["date"] = {"$lte": end_date}
        else:
            # SQLite doesn't support complex queries, will handle in application layer
            pass
    
    # Transaction type filtering
    if txn_type == "income":
        if storage.__class__.__name__ == "MongoStorage":
            db_query["amount"] = {"$gt": 0}
        else:
            # SQLite: will filter in application layer
            pass
    elif txn_type == "expense":
        if storage.__class__.__name__ == "MongoStorage":
            db_query["amount"] = {"$lt": 0}
        else:
            # SQLite: will filter in application layer
            pass
    
    # Get total count for pagination
    total = await storage.count("transactions", query=db_query)
    
    # Get paginated results from database
    page = max(1, page)
    offset = (page - 1) * page_size
    
    txns = await storage.all(
        "transactions", 
        query=db_query,
        order_by="date",
        order_desc=True,
        limit=page_size,
        offset=offset
    )
    
    # Apply remaining filters that couldn't be done at database level
    if search:
        s = search.lower().strip()
        from datetime import datetime
        
        def _match_txn(t):
            parts = [
                t.get("description", ""), t.get("notes", ""),
                t.get("category", ""), t.get("payment_method", ""),
                (t.get("date", "") or "")[:10],
            ]
            hay = " ".join(p for p in parts if p).lower()
            try:
                dt = datetime.strptime((t.get("date") or "")[:10], "%Y-%m-%d")
                hay += " " + dt.strftime("%d %b %Y %B %A").lower()
            except (ValueError, TypeError):
                pass
            return s in hay
        
        txns = [t for t in txns if _match_txn(t)]
    
    # Apply SQLite-specific filters
    if storage.__class__.__name__ != "MongoStorage":
        if end_date:
            txns = [t for t in txns if t.get("date", "") <= end_date]
        if txn_type == "income":
            txns = [t for t in txns if t.get("amount", 0) > 0]
        elif txn_type == "expense":
            txns = [t for t in txns if t.get("amount", 0) < 0]
    
    items = [_with_kind(t) for t in txns]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size else 1,
    }


@router.get("/titles")
async def list_transaction_titles(limit: int = 100):
    """Return recently used, distinct transaction descriptions for quick entry."""
    limit = max(1, min(limit, 100))
    txns = await get_all_txns()
    txns.sort(key=lambda t: (t.get("date", ""), t.get("created_at", "")), reverse=True)

    seen: set[str] = set()
    titles: list[str] = []
    for txn in txns:
        title = (txn.get("description") or "").strip()
        key = title.casefold()
        if not title or key in seen:
            continue
        seen.add(key)
        titles.append(title)
        if len(titles) == limit:
            break

    return {"titles": titles}


@router.post("/")
async def create_transaction(payload: TransactionCreate):
    _require_valid_date(payload.date)
    data = payload.model_dump()
    data["date"] = _clamp_date(data["date"])
    txn = Transaction(**data)
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
        data = item.model_dump()
        data["date"] = _clamp_date(data["date"])
        txn = Transaction(**data)
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
    invalid = 0       # months that couldn't be parsed into a date
    duplicates = 0    # entries skipped because they already exist
    for ym in payload.months:
        try:
            y, m = int(ym[:4]), int(ym[5:7])
            last = calendar.monthrange(y, m)[1]
            day = min(max(payload.day, 1), last)
            date_str = f"{y:04d}-{m:02d}-{day:02d}"
        except (ValueError, TypeError, IndexError):
            invalid += 1
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
        else:
            duplicates += 1

    inserted = await storage.insert_many("transactions", docs)
    invalidate_analytics_cache()  # Invalidate cache on recurring insert
    return {
        "inserted": inserted,
        "months": len(docs),
        "skipped": duplicates,
        "invalid": invalid,
    }


@router.put("/{txn_id}")
async def update_transaction(txn_id: str, payload: TransactionUpdate):
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "date" in patch:
        _require_valid_date(patch["date"])
        patch["date"] = _clamp_date(patch["date"])
    if not patch:
        storage = get_storage()
        existing = await storage.get("transactions", txn_id)
        if not existing:
            raise HTTPException(404, "Transaction not found")
        return _with_kind(existing)
    if "amount" in patch:
        patch["txn_type"] = _kind(patch["amount"])
    storage = get_storage()
    # Keep quantity × price consistent with the (possibly new) total when the
    # caller changed amount/quantity but didn't send an explicit price.
    if ("amount" in patch or "quantity" in patch) and "price" not in patch:
        existing = await storage.get("transactions", txn_id)
        if existing:
            amt = patch.get("amount", existing.get("amount", 0))
            qty = patch.get("quantity", existing.get("quantity", 1)) or 1
            patch["price"] = round(abs(amt) / qty, 2)
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


@router.post("/scan-receipt")
async def scan_receipt(file: UploadFile = File(...)):
    """Analyze a receipt photo using Gemini and return parsed transaction values."""
    if not ai.is_enabled():
        raise HTTPException(400, "Gemini is not configured. Set GOOGLE_API_KEY to enable receipt scanning.")
    
    file_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"

    # ai.analyze_receipt blocks on a synchronous HTTPS call (30s timeout).
    # Run it off the event loop so one receipt scan can't stall the server.
    parsed = await asyncio.to_thread(ai.analyze_receipt, file_bytes, content_type)
    if not parsed:
        raise HTTPException(500, "Failed to analyze receipt image.")
        
    return parsed
