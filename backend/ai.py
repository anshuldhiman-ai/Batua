"""Thin wrapper around Google Gemini via direct REST API.

Replaces the ``google-generativeai`` SDK with plain ``requests`` calls so
the mobile APK doesn't need the ``grpcio``/``protobuf`` native dependencies
that have no Chaquopy Android wheels.  All calls degrade gracefully: if no
key is configured or the call fails, helpers return ``None`` and callers
fall back to rule-based logic.
"""
import os
import json
import base64
import logging
from pathlib import Path

import requests

logger = logging.getLogger("batua.ai")

_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def is_enabled() -> bool:
    return bool(_API_KEY)


def model_name() -> str:
    """The Gemini model currently configured (for display in Settings)."""
    return _MODEL


def validate_key(candidate: str | None = None) -> tuple[bool, str, str]:
    """Check a Gemini API key against the live API.

    ``candidate`` is normally ``None`` — validate the currently configured key.
    Passing an explicit string validates that key instead (so the Settings
    "Test connection" button can check a typed-but-unsaved key).

    Returns ``(valid, reason, message)`` where ``reason`` is one of
    ``"ok"``, ``"no_key"``, ``"invalid_key"``, ``"model_unavailable"``,
    ``"quota"``, or ``"network_error"``. Never raises.

    A valid key on a flaky network must not be rejected: transient failures
    (connection errors, HTTP 429/5xx) are retried once before giving up.
    Raw exceptions are logged, never shown to the user.
    """
    key = (candidate or "").strip() or _API_KEY
    if not key:
        return False, "no_key", "No API key configured — add one to enable Gemini."

    # (valid, reason, message) for the most recent attempt.
    last: tuple[bool, str, str] | None = None
    for attempt in range(2):
        try:
            resp = requests.get(f"{_API_BASE}/models/{_MODEL}?key={key}", timeout=15)
        except Exception as exc:
            logger.debug("Gemini validation network failure: %s", exc)
            last = (False, "network_error", "Could not reach Gemini — check your internet connection and try again.")
            continue  # connection blip — retry once
        if resp.status_code == 200:
            return True, "ok", "Key is valid — Gemini is reachable."
        if resp.status_code in (400, 401, 403):
            # Auth failure is authoritative — never retried, never silently
            # replaces a working key.
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            err = body.get("error", {}) if isinstance(body, dict) else {}
            detail = err.get("message", "") if isinstance(err, dict) else ""
            snippet = f" — {detail}" if detail else ""
            return False, "invalid_key", f"Key rejected (HTTP {resp.status_code}){snippet}"
        if resp.status_code == 404:
            # The key is valid but this model isn't available to it.
            return False, "model_unavailable", (
                f"The key is valid, but the model '{_MODEL}' isn't available to it — "
                "check the GEMINI_MODEL setting or your Google AI plan."
            )
        if resp.status_code == 429:
            last = (False, "quota", "Gemini rate limit reached (HTTP 429) — wait a minute and try again.")
        elif resp.status_code >= 500:
            last = (False, "network_error", "Gemini is temporarily unavailable — try again in a moment.")
            continue  # transient server error — retry once
        else:
            last = (False, "network_error", f"Gemini answered with HTTP {resp.status_code}.")
    return last or (False, "network_error", "Could not reach Gemini.")


def set_api_key(key: str) -> None:
    """Update the Gemini API key at runtime.

    Reflects immediately in this process (module var + ``os.environ``) and is
    persisted to the project-root ``.env`` so it survives a restart.
    """
    global _API_KEY
    key = (key or "").strip()
    _API_KEY = key
    os.environ["GOOGLE_API_KEY"] = key
    try:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
        out: list[str] = []
        replaced = False
        prefix = "GOOGLE_API_KEY="
        for line in lines:
            if line.strip().startswith(prefix):
                out.append(f"{prefix}{key}")
                replaced = True
            else:
                out.append(line)
        if not replaced:
            out.append(f"{prefix}{key}")
        env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    except Exception:
        logger.warning("Could not persist GOOGLE_API_KEY to .env", exc_info=True)


def _post(path: str, payload: dict) -> dict | None:
    """POST to the Gemini REST API and return the JSON response, or None."""
    if not _API_KEY:
        return None
    url = f"{_API_BASE}/{path}?key={_API_KEY}"
    try:
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("Gemini API call failed (%s): %s", path, exc)
        return None


def _extract_text(data: dict | None) -> str | None:
    """Pull the text out of a Gemini ``generateContent`` response."""
    if not data:
        return None
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except (KeyError, IndexError, TypeError):
        return None


def chat(system_message: str, user_text: str) -> str | None:
    """Send a single-turn message. Returns text or None on any failure."""
    payload = {
        "contents": [{"parts": [{"text": f"{system_message}\n\n{user_text}"}]}],
        "generationConfig": {"temperature": 0.4},
    }
    data = _post(f"models/{_MODEL}:generateContent", payload)
    return _extract_text(data)


def chat_json(system_message: str, user_text: str) -> dict | None:
    """Send a message expecting JSON back; parse and return a dict or None."""
    raw = chat(
        system_message
        + " Respond with ONLY valid minified JSON, no markdown fences, no prose.",
        user_text,
    )
    if not raw:
        return None
    text = raw.strip()
    # Strip accidental markdown fences.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    # Grab the outermost {...} if there is surrounding noise.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    try:
        return json.loads(text)
    except Exception:
        return None


def analyze_receipt(file_bytes: bytes, mime_type: str) -> dict | None:
    """Analyze a receipt image and return parsed transaction fields as a dict."""
    b64 = base64.b64encode(file_bytes).decode("ascii")
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime_type, "data": b64}},
                {"text": (
                    "Analyze the attached receipt image and extract the transaction details. "
                    "Return ONLY a JSON object with these exact keys:\n"
                    "- 'date': in YYYY-MM-DD format (if not present or not readable, use null)\n"
                    "- 'description': name of the merchant/shop/vendor\n"
                    "- 'amount': total amount of the transaction as a negative number "
                    "(e.g. -450.50 if the total spent was 450.50)\n"
                    "- 'category': guess one of: Groceries, Food Delivery, Shopping, "
                    "Entertainment, Subscriptions, Utilities, Travel, Investments, Other\n"
                    "- 'payment_method': guess one of: UPI, Cash, Card, Bank Transfer, Other\n"
                    "- 'quantity': number of items purchased (default 1)\n"
                    "- 'price': price per item (total amount divided by quantity; default absolute amount)\n"
                    "- 'notes': brief bullet points of major items bought\n\n"
                    "Respond with ONLY valid minified JSON, no markdown code blocks, "
                    "no ```json wrapper, and no surrounding text."
                )},
            ],
        }],
        "generationConfig": {"temperature": 0.2},
    }
    data = _post(f"models/{_MODEL}:generateContent", payload)
    raw_text = _extract_text(data)
    if not raw_text:
        return None

    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    try:
        return json.loads(text)
    except Exception:
        return None