"""Regression tests: blocking work must not run on the event loop.

The parser, the receipt scanner and the Excel loader are all synchronous, and
when Gemini is configured each makes a blocking HTTPS call (15-30s timeout).
Calling them straight from an ``async def`` handler freezes the *entire*
server — every other request stalls until the call returns.

These tests pin the fix two ways:
  1. the sync helper is executed on a worker thread, not the loop thread;
  2. the loop keeps making progress while that helper is busy.

Both assertions fail against the pre-fix code, which called the helpers
directly.
"""
import asyncio
import threading
import time
from unittest.mock import patch

import pytest

from app.models import BulkNLRequest, NLRequest
from app.routes import excel as excel_route
from app.routes import nl_parse
from app.routes import transactions as txn_route


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _recording_stub(return_value, *, sleep: float = 0.0):
    """A sync callable that records the thread it ran on."""
    seen = {"thread": None, "calls": 0}

    def stub(*_args, **_kwargs):
        seen["thread"] = threading.get_ident()
        seen["calls"] += 1
        if sleep:
            time.sleep(sleep)  # deliberately blocking
        return return_value

    return stub, seen


def _run(coro_factory):
    """Run a coroutine, returning (result, loop_thread_ident)."""
    box = {}

    async def main():
        box["loop_thread"] = threading.get_ident()
        return await coro_factory()

    result = asyncio.run(main())
    return result, box["loop_thread"]


class _FakeUpload:
    """Minimal stand-in for fastapi UploadFile."""

    def __init__(self, content=b"\x89PNG fake", content_type="image/png", filename="r.png"):
        self._content = content
        self.content_type = content_type
        self.filename = filename

    async def read(self):
        return self._content


# --------------------------------------------------------------------------- #
# 1. Sync helpers run off the event loop thread
# --------------------------------------------------------------------------- #

def test_parse_nl_offloads_parser_to_worker_thread():
    stub, seen = _recording_stub({"description": "Chai", "amount": -10.0})
    with patch.object(nl_parse, "parse_nl_input", stub):
        result, loop_thread = _run(lambda: nl_parse.parse_nl(NLRequest(text="chai 10")))

    assert result == {"description": "Chai", "amount": -10.0}
    assert seen["calls"] == 1
    assert seen["thread"] is not None
    assert seen["thread"] != loop_thread, "parse_nl_input ran on the event loop thread"


def test_parse_nl_recurring_offloads_to_worker_thread():
    stub, seen = _recording_stub({"items": []})
    with patch.object(nl_parse, "parse_recurring", stub):
        _, loop_thread = _run(
            lambda: nl_parse.parse_nl(NLRequest(text="rent 15000 monthly", force_recurring=True))
        )

    assert seen["calls"] == 1
    assert seen["thread"] != loop_thread


def test_parse_nl_bulk_offloads_to_worker_thread():
    stub, seen = _recording_stub([{"description": "Chai"}])
    with patch.object(nl_parse, "parse_bulk_lines", stub):
        result, loop_thread = _run(
            lambda: nl_parse.parse_nl_bulk(BulkNLRequest(text="chai 10\nsamosa 20"))
        )

    assert result == {"items": [{"description": "Chai"}]}
    assert seen["thread"] != loop_thread


def test_parse_nl_voice_offloads_to_worker_thread():
    stub, seen = _recording_stub([{"description": "Lays"}])
    with patch.object(nl_parse, "parse_voice_input", stub):
        result, loop_thread = _run(
            lambda: nl_parse.parse_nl_voice(BulkNLRequest(text="aaj lays 10 aur chai 10"))
        )

    assert result == {"items": [{"description": "Lays"}]}
    assert seen["thread"] != loop_thread


def test_scan_receipt_offloads_gemini_call_to_worker_thread():
    stub, seen = _recording_stub({"amount": -450.0, "description": "Zomato"})
    with patch.object(txn_route.ai, "is_enabled", return_value=True), \
         patch.object(txn_route.ai, "analyze_receipt", stub):
        result, loop_thread = _run(lambda: txn_route.scan_receipt(_FakeUpload()))

    assert result == {"amount": -450.0, "description": "Zomato"}
    assert seen["thread"] != loop_thread, "ai.analyze_receipt ran on the event loop thread"


def test_upload_preview_offloads_column_detection_to_worker_thread():
    stub, seen = _recording_stub({"mapping": {"date": "Date"}, "columns": ["Date"]})
    with patch.object(excel_route.excel_loader, "detect_columns", stub):
        result, loop_thread = _run(lambda: excel_route.upload_preview(_FakeUpload(b"a,b\n1,2", filename="x.csv")))

    assert result == {"mapping": {"date": "Date"}, "columns": ["Date"]}
    assert seen["thread"] != loop_thread


# --------------------------------------------------------------------------- #
# 2. The event loop stays responsive while the blocking helper runs
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "target,route_call",
    [
        ("parse_nl_input", lambda: nl_parse.parse_nl(NLRequest(text="chai 10"))),
        ("parse_bulk_lines", lambda: nl_parse.parse_nl_bulk(BulkNLRequest(text="chai 10"))),
        ("parse_voice_input", lambda: nl_parse.parse_nl_voice(BulkNLRequest(text="chai 10"))),
    ],
)
def test_event_loop_keeps_running_during_blocking_parse(target, route_call):
    """A slow parse must not starve other coroutines.

    Pre-fix this ticked exactly 0 times, because ``time.sleep`` held the loop.
    """
    stub, _seen = _recording_stub({"description": "Chai"}, sleep=0.25)
    ticks = {"n": 0}

    async def main():
        async def ticker():
            while True:
                await asyncio.sleep(0.01)
                ticks["n"] += 1

        task = asyncio.create_task(ticker())
        await asyncio.sleep(0)  # let the ticker reach its first await
        await route_call()
        task.cancel()

    with patch.object(nl_parse, target, stub):
        asyncio.run(main())

    assert ticks["n"] > 0, "event loop was blocked for the whole parse"
