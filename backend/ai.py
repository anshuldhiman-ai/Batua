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

import requests

logger = logging.getLogger("batua.ai")

_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def is_enabled() -> bool:
    return bool(_API_KEY)


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