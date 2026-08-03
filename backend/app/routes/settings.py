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
        status = 400 if reason == "invalid_key" else 502
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


def _fill_na(payload: dict, schema) -> None:
    for k in schema:
        payload.setdefault(k, None)
