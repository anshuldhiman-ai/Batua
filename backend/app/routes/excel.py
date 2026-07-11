"""Excel upload routes."""
import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile

import excel_loader
from app.dependencies import get_storage
from app.helpers import _txn_key
from app.cache import invalidate_analytics_cache
from app.upload_progress import (
    STAGE_CATEGORIZING,
    STAGE_READING,
    STAGE_SAVING,
    get_store,
)

logger = logging.getLogger("batua.excel")

router = APIRouter()

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB limit


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.post("/upload-excel/preview")
async def upload_preview(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    try:
        return excel_loader.detect_columns(content, file.filename or "")
    except Exception as exc:
        logger.warning("Could not read uploaded file %r: %s", file.filename, exc)
        raise HTTPException(
            400,
            "Could not read the file. Make sure it's a valid .xlsx or .csv "
            "spreadsheet and not password-protected or corrupted.",
        )


@router.post("/upload-excel")
async def upload_excel(
    file: UploadFile = File(...),
    replace: bool = Query(False),
    use_ai: bool = Query(False),
):
    """Synchronous upload — kept for backward compatibility.

    New callers should prefer /upload-excel/start + /upload-progress/{task_id}
    so the UI can show staged progress while parsing runs.
    """
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")

    try:
        rows = excel_loader.try_load_excel(content, file.filename or "", use_ai=use_ai)
    except Exception as exc:
        logger.error("Error parsing Excel file %r: %s", file.filename, exc)
        raise HTTPException(
            400,
            "Could not parse the file. Make sure it has a date column and an "
            "amount (or debit/credit) column, and isn't corrupted.",
        )

    if not rows:
        raise HTTPException(
            400,
            "No transactions found. The file may be empty or in an unrecognised "
            "layout — make sure it has a date column and an amount (or debit/credit) column.",
        )

    storage = get_storage()
    if replace:
        await storage.clear("transactions")
        new_rows = rows
        skipped = 0
    else:
        existing = await get_all_txns()
        seen = {_txn_key(t) for t in existing}
        new_rows = [r for r in rows if _txn_key(r) not in seen]
        skipped = len(rows) - len(new_rows)

    inserted = await storage.insert_many("transactions", new_rows)
    invalidate_analytics_cache()

    return {"inserted": inserted, "replaced": replace, "skipped": skipped}


# --------------------------------------------------------------------------- #
# Staged upload (preferred for UI)
# --------------------------------------------------------------------------- #


@router.post("/upload-excel/start")
async def upload_excel_start(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    replace: bool = Query(True),
    use_ai: bool = Query(False),
):
    """Start an upload + parse job in the background; return a task_id.

    The frontend then polls /upload-progress/{task_id} to drive the staged
    progress bar (uploading → reading → categorizing → saving → complete).
    """
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    if not content:
        raise HTTPException(400, "Empty file")

    store = get_store()
    task_id = store.create()
    # Move to "reading" immediately — the file bytes are already in hand, so
    # we're past the network stage.
    store.update(task_id, stage=STAGE_READING)

    background_tasks.add_task(
        _run_upload_task,
        task_id,
        content,
        file.filename or "",
        bool(replace),
        bool(use_ai),
    )

    return {"task_id": task_id, "filename": file.filename, "size": len(content)}


@router.get("/upload-progress/{task_id}")
async def upload_progress(task_id: str):
    """Return the current stage of an in-flight upload."""
    store = get_store()
    state = store.get(task_id)
    if state is None:
        # Treat unknown ids as "not started / expired" so the UI can reset.
        raise HTTPException(404, "Unknown or expired task")
    return state


async def _run_upload_task(task_id: str, content: bytes, filename: str,
                            replace: bool, use_ai: bool) -> None:
    """Background task that runs the heavy lifting and reports progress."""
    store = get_store()
    try:
        # ── Reading ─────────────────────────────────────────────────────
        # Parsing is CPU-bound; offload to a thread so we don't block the
        # event loop and so the polling endpoint stays responsive.
        store.update(task_id, stage=STAGE_READING)
        loop = asyncio.get_event_loop()

        # Drive the progress bar smoothly through reading + categorizing.
        # The callback fires from the worker thread; ProgressStore mutations
        # are simple dict writes, so this is safe enough for our purposes.
        def _on_progress(stage: str, fraction: float) -> None:
            if stage == "reading":
                lo, hi = 25, 55
            else:  # "categorizing"
                lo, hi = 55, 85
            store.update(
                task_id,
                stage=STAGE_READING if stage == "reading" else STAGE_CATEGORIZING,
                progress=int(lo + (hi - lo) * max(0.0, min(1.0, fraction))),
            )

        rows = await loop.run_in_executor(
            None,
            lambda: excel_loader.try_load_excel(
                content, filename, use_ai, progress_cb=_on_progress
            ),
        )
        if not rows:
            store.fail(
                task_id,
                "No transactions found. The file may be empty or in an unrecognised "
                "layout — make sure it has a date column and an amount (or debit/credit) column.",
            )
            return

        # Categorization done — settle at the top of its band before saving.
        store.update(task_id, stage=STAGE_CATEGORIZING, progress=85)

        # ── Saving ──────────────────────────────────────────────────────
        store.update(task_id, stage=STAGE_SAVING, progress=85)
        storage = get_storage()
        if replace:
            await storage.clear("transactions")
            new_rows = rows
            skipped = 0
        else:
            # De-duplicate by content fingerprint so re-uploading the same
            # file is idempotent. We can't use filter_existing() here because
            # that matches on the UUID `id` column, whereas incoming rows are
            # matched by their (date, desc, amount, category, method) key.
            existing = await get_all_txns()
            seen = {_txn_key(t) for t in existing}
            new_rows = [r for r in rows if _txn_key(r) not in seen]
            skipped = len(rows) - len(new_rows)

        # Insert in batches with progress updates
        total_rows = len(new_rows)
        inserted_count = 0
        
        def save_progress_cb(fraction: float) -> None:
            nonlocal inserted_count
            save_progress = int(85 + (100 - 85) * min(1.0, fraction))
            store.update(
                task_id,
                stage=STAGE_SAVING,
                progress=save_progress,
                message=f"Saving to your database… ({int(fraction * total_rows)}/{total_rows} rows)",
            )
        
        inserted_count = await storage.insert_many("transactions", new_rows, progress_cb=save_progress_cb)
        
        invalidate_analytics_cache()

        store.complete(
            task_id,
            {
                "inserted": inserted_count,
                "replaced": replace,
                "skipped": skipped,
                "parsed": len(rows),
            },
        )
    except Exception:  # pragma: no cover - defensive
        # Full detail (incl. traceback) goes to the server log only; the
        # polling client gets a generic message so internals never leak.
        logger.exception("Background upload failed for task %s", task_id)
        store.fail(
            task_id,
            "Something went wrong while importing this file. Please check the "
            "file and try again.",
        )
