"""Full-data backup & restore.

One JSON file carries everything the user owns (transactions + budgets), so
the privacy-first story is complete: your data can leave with you and come
back on any machine, regardless of which storage backend is live.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache
from app.models import Budget, Transaction

router = APIRouter()

BACKUP_VERSION = 1


class BackupPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transactions: list[dict] = []
    budgets: list[dict] = []


@router.get("/backup")
async def download_backup():
    """Everything the user owns, in one restorable JSON document."""
    storage = get_storage()
    return {
        "app": "batua",
        "version": BACKUP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "transactions": await storage.all("transactions"),
        "budgets": await storage.all("budgets"),
    }


@router.post("/restore")
async def restore_backup(payload: BackupPayload, replace: bool = True):
    """Load a backup file. ``replace=true`` (default) swaps out current data.

    Rows are re-validated through the Pydantic models so a hand-edited or
    partially-corrupt file restores what it can instead of failing whole.
    """
    if not payload.transactions and not payload.budgets:
        raise HTTPException(400, "Backup contains no data")

    txns, bad_txns = [], 0
    for t in payload.transactions:
        try:
            txns.append(Transaction(**t).model_dump())
        except Exception:
            bad_txns += 1
    budgets, bad_budgets = [], 0
    for b in payload.budgets:
        try:
            budgets.append(Budget(**b).model_dump())
        except Exception:
            bad_budgets += 1

    if not txns and not budgets:
        raise HTTPException(400, "No valid rows found in this backup file")

    storage = get_storage()
    if replace:
        await storage.clear("transactions")
        await storage.clear("budgets")
    if txns:
        await storage.insert_many("transactions", txns)
    if budgets:
        await storage.insert_many("budgets", budgets)
    invalidate_analytics_cache()

    return {
        "transactions": len(txns),
        "budgets": len(budgets),
        "skipped": bad_txns + bad_budgets,
        "replaced": replace,
    }
