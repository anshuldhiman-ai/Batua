"""Track upload progress for staged Excel imports.

The frontend POSTs a file and immediately polls this endpoint to see which
stage the backend is currently in (uploading / reading / categorizing /
saving). This lets us show the user what's happening instead of leaving
them staring at a single spinner.
"""
import time
import uuid
from typing import Any

# Stage constants — keep in sync with the frontend component.
STAGE_UPLOADING = "uploading"
STAGE_READING = "reading"
STAGE_CATEGORIZING = "categorizing"
STAGE_SAVING = "saving"
STAGE_COMPLETE = "complete"
STAGE_ERROR = "error"

# Per-stage progress bounds (0..100). Used as the smooth ramped value the
# frontend should show while a stage is in flight.
STAGE_BOUNDS = {
    STAGE_UPLOADING: (0, 25),
    STAGE_READING: (25, 55),
    STAGE_CATEGORIZING: (55, 85),
    STAGE_SAVING: (85, 100),
    STAGE_COMPLETE: (100, 100),
    STAGE_ERROR: (0, 0),
}

# Friendly label per stage — what the user actually sees.
STAGE_LABELS = {
    STAGE_UPLOADING: "Uploading your file…",
    STAGE_READING: "Reading your file…",
    STAGE_CATEGORIZING: "Smart-categorizing transactions…",
    STAGE_SAVING: "Saving to your database…",
    STAGE_COMPLETE: "Done!",
    STAGE_ERROR: "Something went wrong",
}


class ProgressStore:
    """Tiny in-memory store of in-flight upload tasks."""

    def __init__(self) -> None:
        # task_id -> {"stage": str, "progress": int, "message": str,
        #             "result": Any, "error": str, "updated_at": float}
        self._tasks: dict[str, dict] = {}

    def create(self) -> str:
        """Allocate a new task id and seed it as uploading."""
        task_id = uuid.uuid4().hex
        self._tasks[task_id] = {
            "stage": STAGE_UPLOADING,
            "progress": STAGE_BOUNDS[STAGE_UPLOADING][0],
            "message": STAGE_LABELS[STAGE_UPLOADING],
            "result": None,
            "error": None,
            "updated_at": time.time(),
        }
        return task_id

    def update(self, task_id: str, *, stage: str, progress: int | None = None,
               message: str | None = None) -> None:
        """Move a task to a new stage; clamps progress to the stage bounds."""
        task = self._tasks.get(task_id)
        if not task:
            return
        lo, hi = STAGE_BOUNDS.get(stage, (0, 100))
        if progress is None:
            # Default to the start of the stage band unless we're already past it.
            progress = max(task.get("progress", lo), lo)
        else:
            progress = max(lo, min(hi, progress))
        task["stage"] = stage
        task["progress"] = progress
        task["message"] = message or STAGE_LABELS.get(stage, task["message"])
        task["updated_at"] = time.time()

    def complete(self, task_id: str, result: Any) -> None:
        task = self._tasks.get(task_id)
        if not task:
            return
        task["stage"] = STAGE_COMPLETE
        task["progress"] = 100
        task["message"] = STAGE_LABELS[STAGE_COMPLETE]
        task["result"] = result
        task["updated_at"] = time.time()

    def fail(self, task_id: str, error: str) -> None:
        task = self._tasks.get(task_id)
        if not task:
            return
        task["stage"] = STAGE_ERROR
        task["message"] = STAGE_LABELS[STAGE_ERROR]
        task["error"] = error
        task["updated_at"] = time.time()

    def get(self, task_id: str) -> dict | None:
        task = self._tasks.get(task_id)
        if not task:
            return None
        # If a task hasn't been touched in a while, it's stale — drop it so
        # the dict doesn't grow without bound.
        if time.time() - task["updated_at"] > 600:  # 10 minutes
            self._tasks.pop(task_id, None)
            return None
        return {
            "stage": task["stage"],
            "progress": task["progress"],
            "message": task["message"],
            "result": task["result"],
            "error": task["error"],
        }

    def cleanup(self, task_id: str) -> None:
        self._tasks.pop(task_id, None)


# Single global store. FastAPI runs handlers on a thread pool but we only
# mutate this dict from those handlers, so a plain dict is safe enough.
_progress_store = ProgressStore()


def get_store() -> ProgressStore:
    return _progress_store
