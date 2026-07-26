"""Unit tests for app/upload_progress.py — ProgressStore."""
from app.upload_progress import ProgressStore, STAGE_BOUNDS, STAGE_LABELS, get_store


class TestProgressStore:
    def test_create_returns_task_id(self):
        store = ProgressStore()
        task_id = store.create()
        assert task_id is not None
        assert len(task_id) > 0

    def test_get_returns_task_after_create(self):
        store = ProgressStore()
        task_id = store.create()
        status = store.get(task_id)
        assert status is not None
        assert status["stage"] == "uploading"
        assert status["progress"] == 0
        assert status["result"] is None
        assert status["error"] is None

    def test_get_returns_none_for_unknown_task(self):
        store = ProgressStore()
        assert store.get("nonexistent") is None

    def test_update_changes_stage(self):
        store = ProgressStore()
        task_id = store.create()
        store.update(task_id, stage="reading")
        status = store.get(task_id)
        assert status["stage"] == "reading"

    def test_update_clamps_progress_to_stage_bounds(self):
        store = ProgressStore()
        task_id = store.create()
        # Try to set progress to 50 while still in uploading stage (bounds 0-25)
        store.update(task_id, stage="uploading", progress=50)
        status = store.get(task_id)
        assert status["progress"] <= 25

    def test_update_without_progress_defaults_to_stage_lower_bound(self):
        store = ProgressStore()
        task_id = store.create()
        store.update(task_id, stage="reading", progress=30)
        store.update(task_id, stage="categorizing")  # no progress → should clamp
        status = store.get(task_id)
        assert status["progress"] >= 55  # categorizing lower bound

    def test_complete_sets_100_and_result(self):
        store = ProgressStore()
        task_id = store.create()
        store.complete(task_id, {"inserted": 42})
        status = store.get(task_id)
        assert status["stage"] == "complete"
        assert status["progress"] == 100
        assert status["result"] == {"inserted": 42}

    def test_fail_sets_error(self):
        store = ProgressStore()
        task_id = store.create()
        store.fail(task_id, "Something broke")
        status = store.get(task_id)
        assert status["stage"] == "error"
        assert status["error"] == "Something broke"

    def test_cleanup_removes_task(self):
        store = ProgressStore()
        task_id = store.create()
        store.cleanup(task_id)
        assert store.get(task_id) is None

    def test_update_does_nothing_for_nonexistent_task(self):
        store = ProgressStore()
        # Should not raise
        store.update("ghost", stage="reading")
        store.complete("ghost", {})
        store.fail("ghost", "err")

    def test_stage_labels_are_descriptive(self):
        assert "Uploading" in STAGE_LABELS["uploading"]
        assert "Reading" in STAGE_LABELS["reading"]
        assert "Saving" in STAGE_LABELS["saving"]

    def test_stage_bounds_are_valid_ranges(self):
        for stage, (lo, hi) in STAGE_BOUNDS.items():
            assert 0 <= lo <= hi <= 100, f"{stage}: {lo}->{hi}"

    def test_get_store_returns_singleton(self):
        s1 = get_store()
        s2 = get_store()
        assert s1 is s2
