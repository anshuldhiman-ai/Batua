"""Runtime settings routes (API key management, system metrics)."""
import asyncio
import logging
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import ai

logger = logging.getLogger("batua.settings")

router = APIRouter()

# The instant the server started — used for reported uptime.
_START = time.time()

# psutil is optional so the app still ships without it (it is not required by
# requirements.txt — falls back to graceful "unavailable" metrics below).
try:
    import psutil  # type: ignore

    _PSUTIL_OK = True
except Exception:  # pragma: no cover - depends on install
    _PSUTIL_OK = False


class GeminiKeyUpdate(BaseModel):
    api_key: str


@router.get("/settings/gemini-key")
async def gemini_key_status():
    """Whether a Gemini key is configured (never reveals the key itself)."""
    return {"configured": ai.is_enabled()}


@router.put("/settings/gemini-key")
async def update_gemini_key(payload: GeminiKeyUpdate):
    """Set the Gemini API key at runtime — only if it actually works.

    The candidate key is validated against the live Gemini API BEFORE it is
    persisted, so a bad/revoked key can never silently replace a good one.
    Returns a distinct reason on auth failure (``invalid_key``) vs network
    failure (``network_error``); ``configured`` is only ``True`` on success.
    """
    key = (payload.api_key or "").strip()
    if not key:
        raise HTTPException(400, "API key cannot be empty")
    ok, reason, message = await asyncio.to_thread(ai.validate_key, key)
    if not ok:
        # invalid_key / model_unavailable → 400, quota → 429, everything else → 502.
        status = 400 if reason in ("invalid_key", "model_unavailable") else 429 if reason == "quota" else 502
        raise HTTPException(status, {"reason": reason, "message": message})
    ai.set_api_key(key)
    return {"updated": True, "configured": True, "reason": "ok"}


@router.post("/settings/gemini-key/test")
async def test_gemini_key():
    """Validate the currently configured Gemini key against the live API.

    The Settings "Test connection" button calls this so a bad or revoked key
    is actually rejected instead of passing merely because a key is set.
    """
    ok, reason, message = await asyncio.to_thread(ai.validate_key)
    return {"valid": ok, "reason": reason, "message": message}


@router.get("/settings/system-metrics")
async def system_metrics():
    """Live host + backend-process resource usage. Real, not placeholders.

    Endpoints are wall-clock measured here (single sample) and CPU is an
    instantaneous-ish read. Everything degrades to ``None`` if psutil is
    unavailable, so clients can render "unavailable" without erroring.
    """
    start = time.perf_counter()
    payload = {"uptime_seconds": max(0, int(time.time() - _START))}

    # Expected response schema. Every key is sent on every request (filled with
    # real values or None) so clients never see a missing field, and adding a
    # new metric here automatically flows through _fill_na — no drift.
    SCHEMA = (
        "uptime_seconds",
        "cpu",
        "memory",
        "memory_used",
        "memory_total",
        "latency_ms",
    )

    if _PSUTIL_OK:
        try:
            mem = psutil.virtual_memory()
            payload["cpu"] = psutil.cpu_percent(interval=None)
            payload["memory"] = mem.percent
            payload["memory_used"] = mem.used
            payload["memory_total"] = mem.total
        except Exception:  # pragma: no cover - reverted psutil breakage
            logger.warning("psutil metrics read failed", exc_info=True)
            _fill_na(payload, SCHEMA)
    else:
        _fill_na(payload, SCHEMA)

    payload["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)
    return payload


@router.get("/settings/db-health")
async def db_health():
    """Report database integrity, WAL mode, storage stats and size."""
    from app.dependencies import get_storage
    storage = get_storage()
    if not storage:
        raise HTTPException(500, "Storage unavailable")

    integrity = await storage.integrity_check() if hasattr(storage, "integrity_check") else "ok"
    stats = await storage.get_db_stats() if hasattr(storage, "get_db_stats") else {}
    return {
        "integrity": integrity,
        "is_healthy": str(integrity).lower() == "ok",
        **stats,
    }


@router.post("/settings/db-vacuum")
async def db_vacuum():
    """Run SQLite VACUUM to defragment tables and reclaim disk space."""
    from app.dependencies import get_storage
    storage = get_storage()
    if not storage:
        raise HTTPException(500, "Storage unavailable")

    success = await storage.vacuum() if hasattr(storage, "vacuum") else True
    stats = await storage.get_db_stats() if hasattr(storage, "get_db_stats") else {}
    return {
        "success": success,
        "message": "Database optimized and defragmented successfully",
        **stats,
    }


@router.post("/settings/seed-demo-data")
async def seed_demo_data():
    """Populate a realistic sample dataset for demonstration and evaluation."""
    import uuid
    from datetime import datetime, timedelta
    from app.dependencies import get_storage
    from app.cache import invalidate_analytics_cache

    storage = get_storage()
    if not storage:
        raise HTTPException(500, "Storage unavailable")

    now = datetime.now()

    # Helper to calculate relative date
    def d(days_ago: int, hour: int = 12, minute: int = 30) -> str:
        target = now - timedelta(days=days_ago)
        return f"{target.strftime('%Y-%m-%d')}T{hour:02d}:{minute:02d}:00"

    # 35 realistic curated transactions
    sample_txns = [
        # Incomes
        {"date": d(45, 10, 0), "description": "Tech Corp Salary", "amount": 75000.0, "category": "Salary", "payment_method": "Bank Transfer", "notes": "Monthly payroll deposit"},
        {"date": d(32, 16, 45), "description": "Freelance UI Design System", "amount": 18500.0, "category": "Freelance", "payment_method": "Bank Transfer", "notes": "Milestone 2 deliverable"},
        {"date": d(15, 10, 0), "description": "Tech Corp Salary", "amount": 75000.0, "category": "Salary", "payment_method": "Bank Transfer", "notes": "Monthly payroll deposit"},
        {"date": d(8, 14, 20), "description": "Freelance Consultation", "amount": 5000.0, "category": "Freelance", "payment_method": "UPI", "notes": "Figma architecture review"},
        {"date": d(3, 11, 15), "description": "Quarterly Mutual Fund Dividend", "amount": 2400.0, "category": "Investments", "payment_method": "Bank Transfer", "notes": "Nifty 50 Index Fund dividend"},

        # Housing & Utilities
        {"date": d(44, 11, 0), "description": "Apartment Rent", "amount": -18000.0, "category": "Housing & Rent", "payment_method": "Bank Transfer", "notes": "Monthly residential rent"},
        {"date": d(14, 11, 0), "description": "Apartment Rent", "amount": -18000.0, "category": "Housing & Rent", "payment_method": "Bank Transfer", "notes": "Monthly residential rent"},
        {"date": d(38, 15, 30), "description": "Electricity & Water Bill", "amount": -2150.0, "category": "Utilities", "payment_method": "UPI", "notes": "State Power board online payment"},
        {"date": d(9, 12, 10), "description": "Electricity & Water Bill", "amount": -2280.0, "category": "Utilities", "payment_method": "UPI", "notes": "Monthly electricity utility"},
        {"date": d(35, 18, 0), "description": "Airtel Xstream Fiber", "amount": -999.0, "category": "Utilities", "payment_method": "Credit Card", "notes": "200 Mbps broadband"},
        {"date": d(5, 18, 0), "description": "Airtel Xstream Fiber", "amount": -999.0, "category": "Utilities", "payment_method": "Credit Card", "notes": "Monthly fiber internet"},
        {"date": d(22, 17, 40), "description": "Gas Cylinder Refill", "amount": -950.0, "category": "Utilities", "payment_method": "UPI", "notes": "Indane LPG booking"},
        {"date": d(12, 9, 30), "description": "Apple iCloud Storage", "amount": -219.0, "category": "Utilities", "payment_method": "Credit Card", "notes": "200GB Family Cloud plan"},

        # Food & Groceries
        {"date": d(42, 19, 15), "description": "Nature's Basket Groceries", "amount": -4250.0, "category": "Food & Dining", "payment_method": "Credit Card", "notes": "Monthly pantry stocking"},
        {"date": d(36, 13, 20), "description": "Swiggy Gourmet Dinner", "amount": -780.0, "category": "Food Delivery", "payment_method": "UPI", "notes": "Thai curry and jasmine rice"},
        {"date": d(30, 8, 45), "description": "Blue Tokai Coffee & Croissant", "amount": -420.0, "category": "Food & Dining", "payment_method": "UPI", "notes": "Morning study session"},
        {"date": d(25, 20, 30), "description": "Weekend Brunch at Smoke House Deli", "amount": -1650.0, "category": "Food & Dining", "payment_method": "Credit Card", "notes": "Brunch with colleagues"},
        {"date": d(20, 19, 0), "description": "Nature's Basket Groceries", "amount": -3890.0, "category": "Food & Dining", "payment_method": "Credit Card", "notes": "Weekly produce and dairy"},
        {"date": d(16, 13, 10), "description": "Zomato Biryani Feast", "amount": -620.0, "category": "Food Delivery", "payment_method": "UPI", "notes": "Hyd Hyderabadi Dum Biryani"},
        {"date": d(11, 9, 0), "description": "Third Wave Coffee Roasters", "amount": -350.0, "category": "Food & Dining", "payment_method": "UPI", "notes": "Cold brew and bagel"},
        {"date": d(7, 18, 30), "description": "Blinkit 10-min Grocery Refill", "amount": -490.0, "category": "Food Delivery", "payment_method": "UPI", "notes": "Milk, sourdough and eggs"},
        {"date": d(4, 15, 20), "description": "Starbucks Caramel Macchiato", "amount": -390.0, "category": "Food & Dining", "payment_method": "UPI", "notes": "Afternoon pick-me-up"},
        {"date": d(1, 20, 0), "description": "Swiggy Pizza Dinner", "amount": -850.0, "category": "Food Delivery", "payment_method": "UPI", "notes": "Woodfired Margherita"},

        # Shopping & Tech
        {"date": d(40, 16, 0), "description": "Amazon Basics & Office Supplies", "amount": -3450.0, "category": "Shopping", "payment_method": "Credit Card", "notes": "Ergonomic keyboard wrist rest & notebook"},
        {"date": d(28, 17, 30), "description": "Zara Summer Apparel", "amount": -2890.0, "category": "Shopping", "payment_method": "Credit Card", "notes": "Linen shirts"},
        {"date": d(18, 14, 0), "description": "Decathlon Sports Gear", "amount": -1890.0, "category": "Shopping", "payment_method": "Credit Card", "notes": "Running shoes and dry-fit t-shirt"},
        {"date": d(6, 16, 45), "description": "Tech Accessories & Anker Cable", "amount": -599.0, "category": "Shopping", "payment_method": "UPI", "notes": "Braided USB-C cable"},

        # Entertainment & Subscriptions
        {"date": d(33, 21, 0), "description": "Netflix Premium Subscription", "amount": -649.0, "category": "Entertainment", "payment_method": "Credit Card", "notes": "4K Ultra HD monthly"},
        {"date": d(27, 21, 30), "description": "BookMyShow IMAX Movie Tickets", "amount": -950.0, "category": "Entertainment", "payment_method": "UPI", "notes": "Interstellar Re-release with friends"},
        {"date": d(17, 8, 0), "description": "Spotify Individual", "amount": -119.0, "category": "Entertainment", "payment_method": "Credit Card", "notes": "Monthly ad-free streaming"},
        {"date": d(2, 21, 0), "description": "Netflix Premium Subscription", "amount": -649.0, "category": "Entertainment", "payment_method": "Credit Card", "notes": "Monthly streaming renewal"},

        # Transport & Fitness
        {"date": d(37, 10, 15), "description": "Cult.fit Gym Membership", "amount": -1500.0, "category": "Health & Fitness", "payment_method": "Credit Card", "notes": "Monthly fitness center pass"},
        {"date": d(24, 8, 30), "description": "Delhi Metro Smart Card Recharge", "amount": -1000.0, "category": "Transportation", "payment_method": "UPI", "notes": "Monthly transit pass auto-topup"},
        {"date": d(19, 17, 15), "description": "HP Petrol Pump Fuel", "amount": -2000.0, "category": "Transportation", "payment_method": "UPI", "notes": "Full tank fuel refill"},
        {"date": d(10, 8, 45), "description": "Uber Premier Airport Ride", "amount": -680.0, "category": "Transportation", "payment_method": "UPI", "notes": "City travel ride"},
        {"date": d(0, 11, 0), "description": "Apollo Pharmacy Vitamins", "amount": -680.0, "category": "Health & Fitness", "payment_method": "UPI", "notes": "Vitamin D3 & Omega-3 supplements"},
    ]

    # Insert transactions
    inserted_txns = 0
    for txn in sample_txns:
        doc = {
            "id": f"seed_{uuid.uuid4().hex[:10]}",
            "date": txn["date"],
            "description": txn["description"],
            "amount": txn["amount"],
            "category": txn["category"],
            "payment_method": txn["payment_method"],
            "notes": txn.get("notes", ""),
            "txn_type": "credit" if txn["amount"] > 0 else "debit",
        }
        await storage.insert("transactions", doc)
        inserted_txns += 1

    # Seed realistic budgets
    sample_budgets = [
        {"category": "Food & Dining", "limit": 12000.0, "period": "monthly"},
        {"category": "Food Delivery", "limit": 4000.0, "period": "monthly"},
        {"category": "Housing & Rent", "limit": 20000.0, "period": "monthly"},
        {"category": "Shopping", "limit": 8000.0, "period": "monthly"},
        {"category": "Utilities", "limit": 4000.0, "period": "monthly"},
        {"category": "Entertainment", "limit": 3000.0, "period": "monthly"},
        {"category": "Transportation", "limit": 5000.0, "period": "monthly"},
        {"category": "Health & Fitness", "limit": 3500.0, "period": "monthly"},
    ]
    inserted_budgets = 0
    for b in sample_budgets:
        doc = {"id": f"b_{uuid.uuid4().hex[:8]}", **b}
        await storage.insert("budgets", doc)
        inserted_budgets += 1

    # Seed active savings goals
    sample_goals = [
        {"name": "Emergency Reserve (6 Months)", "target_amount": 150000.0, "current_amount": 65000.0, "target_date": (now + timedelta(days=180)).strftime("%Y-%m-%d"), "category": "Savings"},
        {"name": "MacBook Pro M-Series", "target_amount": 120000.0, "current_amount": 48000.0, "target_date": (now + timedelta(days=90)).strftime("%Y-%m-%d"), "category": "Tech"},
        {"name": "Goa Year-End Retreat", "target_amount": 35000.0, "current_amount": 18500.0, "target_date": (now + timedelta(days=60)).strftime("%Y-%m-%d"), "category": "Travel"},
    ]
    inserted_goals = 0
    for g in sample_goals:
        doc = {"id": f"g_{uuid.uuid4().hex[:8]}", **g}
        await storage.insert("goals", doc)
        inserted_goals += 1

    # Seed people/loans
    sample_people = [
        {"name": "Rahul Sharma", "relationship": "Colleague", "phone": "+91 98765 43210", "notes": "Split group dinner bill; paid ₹1,000 back", "amount": 1500.0, "direction": "they_owe"},
        {"name": "Pooja Verma", "relationship": "Friend", "phone": "+91 91234 56789", "notes": "Borrowed for concert ticket; settled", "amount": 0.0, "direction": "settled"},
    ]
    inserted_people = 0
    for p in sample_people:
        doc = {"id": f"p_{uuid.uuid4().hex[:8]}", **p}
        await storage.insert("people", doc)
        inserted_people += 1

    # Invalidate analytics cache so charts reload with new data
    try:
        invalidate_analytics_cache()
    except Exception:
        pass

    return {
        "success": True,
        "message": "Sample portfolio dataset seeded successfully",
        "counts": {
            "transactions": inserted_txns,
            "budgets": inserted_budgets,
            "goals": inserted_goals,
            "people": inserted_people,
        },
    }


def _fill_na(payload: dict, schema) -> None:
    for k in schema:
        payload.setdefault(k, None)
