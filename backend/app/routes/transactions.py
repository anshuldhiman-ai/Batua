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

# How many recent rows a search is allowed to scan. Search
# matches across several fields (description, notes, category,
# method, date), so it can't be pushed into a DB predicate on
# either backend — this bounds the per-keystroke cost instead.
SEARCH_SCAN_LIMIT = 5000

# Columns the client may sort by. Whitelisted so a query param can never be
# interpolated into the DB layer as an arbitrary attribute.
_SORTABLE_FIELDS = {
    "date", "description", "category", "payment_method",
    "quantity", "price", "amount",
}
_NUMERIC_SORT_FIELDS = {"quantity", "price", "amount"}
# Upper bound on page size — without it a negative/oversized value reaches the
# DB as a negative LIMIT (SQLite treats that as "no limit") or an unbounded scan.
MAX_PAGE_SIZE = 500


def _sort_txns(txns: list[dict], sort_by: str, sort_order: str) -> list[dict]:
    """Sort a list of transaction dicts the same way the UI expects.

    Used by the search branch, which filters in Python and therefore can't push
    the sort down to the database.
    """
    field = sort_by if sort_by in _SORTABLE_FIELDS else "date"
    reverse = sort_order != "asc"

    def numeric_key(t):
        return float(t.get(field) or 0)

    def string_key(t):
        return str(t.get(field) or "").casefold()

    key = numeric_key if field in _NUMERIC_SORT_FIELDS else string_key
    return sorted(txns, key=key, reverse=reverse)


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/descriptions")
async def list_descriptions():
    """Get unique transaction descriptions for autocomplete suggestions."""
    storage = get_storage()
    txns = await storage.all("transactions", order_by="date", order_desc=True, limit=500)
    # Dedupe case-insensitively: "Zomato" and "zomato" are one merchant, and
    # showing both would render as a duplicate suggestion.
    descriptions: dict[str, str] = {}
    for t in txns:
        desc = (t.get("description") or "").strip()
        if not desc:
            continue
        descriptions.setdefault(desc.casefold(), desc)
    return {"descriptions": sorted(descriptions.values(), key=str.casefold)}


@router.get("", include_in_schema=False)
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
    sort_by: str | None = None,
    sort_order: str = "desc",
):
    storage = get_storage()

    # Whitelisted sort column; anything unknown falls back to date (desc).
    sort_field = sort_by if sort_by in _SORTABLE_FIELDS else "date"
    descending = sort_order != "asc"

    # Build database-level query for filterable fields.
    # SQLite's storage understands the $-operators too, so
    # both backends push these predicates down to the DB.
    db_query = {}
    if category and category != "All":
        db_query["category"] = category
    if payment_method and payment_method != "All":
        db_query["payment_method"] = payment_method
    # Date range: merge both bounds into one predicate —
    # a plain string would be an equality match.
    if start_date or end_date:
        db_query["date"] = {}
        if start_date:
            db_query["date"]["$gte"] = start_date
        if end_date:
            db_query["date"]["$lte"] = end_date

    # Transaction type filtering
    if txn_type == "income":
        db_query["amount"] = {"$gt": 0}
    elif txn_type == "expense":
        db_query["amount"] = {"$lt": 0}

    # Database-level search pushed down via SQL LIKE across core fields.
    # Eliminates full-collection memory scans and bounds search cost to DB index/scan.
    if search and search.strip():
        s = search.strip()
        like_pat = f"%{s}%"
        db_query["$or"] = [
            {"description": {"$like": like_pat}},
            {"notes": {"$like": like_pat}},
            {"category": {"$like": like_pat}},
            {"payment_method": {"$like": like_pat}},
            {"date": {"$like": like_pat}},
        ]

    # Get total count for pagination
    total = await storage.count("transactions", query=db_query)

    # Get paginated results from database
    page = max(1, page)
    # Clamp page size: a negative value reaches SQLite as a negative LIMIT,
    # which it interprets as "no limit" (returns the whole collection).
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    txns = await storage.all(
        "transactions",
        query=db_query,
        order_by=sort_field,
        order_desc=descending,
        limit=page_size,
        offset=offset
    )

    # The DB already applied every filter (both backends
    # understand the query dicts now) — just shape the rows.
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
    storage = get_storage()
    txns = await storage.all("transactions", order_by="date", order_desc=True, limit=500)
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


@router.post("", include_in_schema=False)
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
        # Skip if this transaction already exists (idempotency check). Track the
        # keys we add too, so the same month listed twice in one request can't
        # produce two identical rows.
        key = _txn_key(txn.model_dump())
        if key not in seen:
            seen.add(key)
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


@router.delete("", include_in_schema=False)
@router.delete("/")
async def wipe_transactions(confirm: str | None = None):
    if confirm != "CONFIRM_DELETE_ALL":
        raise HTTPException(
            400,
            "Wipe confirmation required. Pass confirm=CONFIRM_DELETE_ALL to delete all transactions.",
        )
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
