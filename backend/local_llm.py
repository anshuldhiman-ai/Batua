"""Thin client for a LOCAL LLM served by Ollama (http://localhost:11434).

This is deliberately dependency-free (stdlib ``urllib``) and fails soft: if the
Ollama server isn't running or the model isn't pulled, every helper returns
``None`` so callers transparently fall back to deterministic templates.

Setup for the user:
    1. Install Ollama       → https://ollama.com/download
    2. Pull a small model   → ``ollama pull llama3.2``   (≈2 GB, fast on CPU)
    3. Ollama serves on 11434 automatically.

Config via environment:
    LOCAL_LLM_URL     default http://localhost:11434
    LOCAL_LLM_MODEL   default llama3.2
    LOCAL_LLM_ENABLED default "1"  (set to "0" to force the template fallback)
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request

logger = logging.getLogger("batua.local_llm")

_URL = os.environ.get("LOCAL_LLM_URL", "http://localhost:11434").rstrip("/")
_MODEL = os.environ.get("LOCAL_LLM_MODEL", "llama3.2").strip() or "llama3.2"
_ENABLED_FLAG = os.environ.get("LOCAL_LLM_ENABLED", "1").strip() not in ("0", "false", "no", "")

# Cache the reachability probe so we don't hit the network on every question.
_avail_cache: dict[str, float | bool] = {"ok": False, "checked_at": 0.0}
_AVAIL_TTL = 30.0  # seconds


def _probe() -> bool:
    """Return True if the Ollama server answers within a short timeout."""
    try:
        req = urllib.request.Request(f"{_URL}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def is_enabled() -> bool:
    """Cheap, cached check for whether the local LLM is usable."""
    if not _ENABLED_FLAG:
        return False
    now = time.time()
    if now - float(_avail_cache["checked_at"]) < _AVAIL_TTL:
        return bool(_avail_cache["ok"])
    ok = _probe()
    _avail_cache["ok"] = ok
    _avail_cache["checked_at"] = now
    if not ok:
        logger.debug("Local LLM not reachable at %s", _URL)
    return ok


def model_name() -> str:
    return _MODEL


def _call_ollama(messages: list[dict], *, temperature: float, timeout: float,
                  num_predict: int = 220) -> str | None:
    """POST a full message list to Ollama's /api/chat. Returns the reply
    text, or None on any failure (unreachable server, bad model, timeout)."""
    if not _ENABLED_FLAG:
        return None
    payload = {
        "model": _MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            "top_p": 0.9,
            "num_predict": num_predict,
        },
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{_URL}/api/chat", data=data,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        text = (body.get("message", {}) or {}).get("content", "")
        text = (text or "").strip()
        # Mark availability true on success so is_enabled() stays warm.
        _avail_cache["ok"] = True
        _avail_cache["checked_at"] = time.time()
        return text or None
    except urllib.error.URLError as exc:
        logger.warning("Local LLM call failed (%s). Falling back to templates.", exc)
        _avail_cache["ok"] = False
        _avail_cache["checked_at"] = time.time()
        return None
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Local LLM unexpected error: %s", exc)
        return None


def chat(system_message: str, user_text: str, *, temperature: float = 0.8,
         timeout: float = 45.0) -> str | None:
    """Single-turn chat against the local model.

    ``temperature`` defaults high so successive answers to the same question
    are phrased differently. Returns the reply text, or None on any failure.
    """
    return _call_ollama(
        [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_text},
        ],
        temperature=temperature, timeout=timeout,
    )


def chat_messages(messages: list[dict], *, temperature: float = 0.7,
                   timeout: float = 45.0, num_predict: int = 260) -> str | None:
    """Multi-turn chat: ``messages`` is a full ``[{role, content}, ...]`` list
    (system message + prior turns + the current user turn). Used for
    conversational replies that need earlier turns for context; single-turn
    callers should keep using ``chat()``. Returns the reply text, or None on
    any failure."""
    return _call_ollama(messages, temperature=temperature, timeout=timeout,
                         num_predict=num_predict)
