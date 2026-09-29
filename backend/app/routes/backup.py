"""Full-data backup and restore."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from pydantic import ValidationError

from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache
from app.models import Budget, Transaction, Goal, PersonEntry

logger = logging.getLogger("batua.backup")

router = APIRouter()
BACKUP_VERSION = 1
COLLECTIONS = ("transactions", "budgets", "goals", "people", "custom_categories")


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
    """Restore validated data with atomic per-collection replacement and enhanced safety."""
    supplied = payload.model_fields_set
    if not any(getattr(payload, name) for name in COLLECTIONS):
        raise HTTPException(400, "Backup contains no data")

    # Validate all data before making any changes
    txns, budgets, goals, people, custom_categories = [], [], [], [], []
    skipped = 0
    for row in payload.transactions:
        try:
            txns.append(Transaction(**row).model_dump())
        except ValidationError:
            skipped += 1
            logger.warning("Backup row rejected for transactions: %s", row.get("id", "<no-id>"))
        except (TypeError, ValueError) as exc:
            skipped += 1
            logger.warning("Backup row bad shape for transactions: %s", exc)
    for row in payload.budgets:
        try:
            budgets.append(Budget(**row).model_dump())
        except ValidationError:
            skipped += 1
            logger.warning("Backup row rejected for budgets: %s", row.get("id", "<no-id>"))
        except (TypeError, ValueError) as exc:
            skipped += 1
            logger.warning("Backup row bad shape for budgets: %s", exc)
    for row in payload.goals:
        try:
            goals.append(Goal(**row).model_dump())
        except ValidationError:
            skipped += 1
            logger.warning("Backup row rejected for goals: %s", row.get("id", "<no-id>"))
        except (TypeError, ValueError) as exc:
            skipped += 1
            logger.warning("Backup row bad shape for goals: %s", exc)
    for row in payload.people:
        try:
            people.append(PersonEntry(**row).model_dump())
        except ValidationError:
            skipped += 1
            logger.warning("Backup row rejected for people: %s", row.get("id", "<no-id>"))
        except (TypeError, ValueError) as exc:
            skipped += 1
            logger.warning("Backup row bad shape for people: %s", exc)
    for row in payload.custom_categories:
        name = str(row.get("name", "")).strip() if isinstance(row, dict) else ""
        if name:
            custom_categories.append({"id": row.get("id") or name, "name": name})
        else:
            skipped += 1

    if not any((txns, budgets, goals, people, custom_categories)):
        raise HTTPException(400, "No valid rows found in this backup file")

    storage = get_storage()
    
    # Store current data for rollback - create backup before any changes
    previous = {collection: await storage.all(collection) for collection in COLLECTIONS}
    rows_by_collection = {
        "transactions": txns,
        "budgets": budgets,
        "goals": goals,
        "people": people,
        "custom_categories": custom_categories,
    }
    invalid_only_collections = {
        collection for collection, rows in rows_by_collection.items()
        if collection in supplied and getattr(payload, collection) and not rows
    }

    # Only collections the backup file actually carries may be replaced
    touched: list[str] = []
    try:
        if replace:
            # Clear collections first, then insert new data
            for collection in COLLECTIONS:
                if collection in supplied and collection not in invalid_only_collections:
                    await storage.clear(collection)
                    touched.append(collection)
            # Then insert new data
            for collection, rows in rows_by_collection.items():
                if rows and collection in supplied and collection not in invalid_only_collections:
                    await storage.insert_many(collection, rows)
        else:
            # Append mode: only insert new data without clearing
            for collection, rows in rows_by_collection.items():
                if rows and collection in supplied:
                    await storage.insert_many(collection, rows)
                    if collection not in touched:
                        touched.append(collection)
    except (RuntimeError, ValueError, TypeError, KeyError) as exc:
        logger.error("Restore failed; rolling back %s", touched or "nothing", exc_info=True)
        # Roll back defensively: whatever broke the restore may well break the rollback too
        unrecovered = []
        for collection in touched:
            try:
                await storage.clear(collection)
                if previous[collection]:
                    await storage.insert_many(collection, previous[collection])
            except (RuntimeError, ValueError, TypeError, KeyError):
                logger.critical("Rollback failed for %r — data may be lost", collection, exc_info=True)
                unrecovered.append(collection)
        invalidate_analytics_cache()
        if unrecovered:
            raise HTTPException(
                500,
                "Restore failed and these collections could not be rolled back: "
                f"{', '.join(unrecovered)}. Re-import your most recent backup file.",
            ) from exc
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
        "preserved_invalid_collections": sorted(invalid_only_collections),
    }
