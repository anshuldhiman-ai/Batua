"""Full-data backup and restore."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache
from app.models import Budget, Transaction, Goal, PersonEntry

router = APIRouter()
BACKUP_VERSION = 1


class BackupPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transactions: list[dict] = []
    budgets: list[dict] = []
    goals: list[dict] = []
    people: list[dict] = []
    custom_categories: list[dict] = []


@router.get("/backup")
async def download_backup():
    """Return every user-owned collection in one restorable JSON document."""
    storage = get_storage()
    return {
        "app": "batua",
        "version": BACKUP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "transactions": await storage.all("transactions"),
        "budgets": await storage.all("budgets"),
        "goals": await storage.all("goals"),
        "people": await storage.all("people"),
        "custom_categories": await storage.all("custom_categories"),
    }


@router.post("/restore")
async def restore_backup(payload: BackupPayload, replace: bool = True):
    """Restore validated data without silently losing omitted legacy collections."""
    supplied = payload.model_fields_set
    if not any(getattr(payload, name) for name in ("transactions", "budgets", "goals", "people", "custom_categories")):
        raise HTTPException(400, "Backup contains no data")

    txns, budgets, goals, people, custom_categories = [], [], [], [], []
    skipped = 0
    for row in payload.transactions:
        try:
            txns.append(Transaction(**row).model_dump())
        except Exception:
            skipped += 1
    for row in payload.budgets:
        try:
            budgets.append(Budget(**row).model_dump())
        except Exception:
            skipped += 1
    for row in payload.goals:
        try:
            goals.append(Goal(**row).model_dump())
        except Exception:
            skipped += 1
    for row in payload.people:
        try:
            people.append(PersonEntry(**row).model_dump())
        except Exception:
            skipped += 1
    for row in payload.custom_categories:
        name = str(row.get("name", "")).strip() if isinstance(row, dict) else ""
        if name:
            custom_categories.append({"id": row.get("id") or name, "name": name})
        else:
            skipped += 1

    if not any((txns, budgets, goals, people, custom_categories)):
        raise HTTPException(400, "No valid rows found in this backup file")

    storage = get_storage()
    previous = {
        collection: await storage.all(collection)
        for collection in ("transactions", "budgets", "goals", "people", "custom_categories")
    }
    replaceable = ("transactions", "budgets", "goals", "people", "custom_categories")
    try:
        if replace:
            # Old backups do not contain the two newer collections; preserve them.
            for collection in replaceable:
                if collection in supplied or collection in ("transactions", "budgets", "goals"):
                    await storage.clear(collection)
        rows_by_collection = {
            "transactions": txns,
            "budgets": budgets,
            "goals": goals,
            "people": people,
            "custom_categories": custom_categories,
        }
        for collection, rows in rows_by_collection.items():
            if rows:
                await storage.insert_many(collection, rows)
    except Exception as exc:
        if replace:
            for collection in replaceable:
                await storage.clear(collection)
                if previous[collection]:
                    await storage.insert_many(collection, previous[collection])
        raise HTTPException(500, "Restore failed; previous data was preserved") from exc

    invalidate_analytics_cache()
    return {
        "transactions": len(txns),
        "budgets": len(budgets),
        "goals": len(goals),
        "people": len(people),
        "custom_categories": len(custom_categories),
        "skipped": skipped,
        "replaced": replace,
    }