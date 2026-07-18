"""Thin wrapper around Google Gemini.

Adapted from the spec's `emergentintegrations` usage to the public
`google-generativeai` SDK. All calls degrade gracefully: if no key is
configured or the call fails, helpers return ``None`` and callers fall back
to rule-based logic.
"""
import os
import json
import logging

logger = logging.getLogger("batua.ai")

_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

_model = None


def _get_model():
    """Lazily configure and cache the Gemini model. Returns None if unavailable."""
    global _model
    if not _API_KEY:
        return None
    if _model is not None:
        return _model
    try:
        import google.generativeai as genai

        genai.configure(api_key=_API_KEY)
        _model = genai.GenerativeModel(_MODEL)
        return _model
    except Exception as exc:  # pragma: no cover - depends on env
        logger.warning("Gemini unavailable: %s", exc)
        return None


def is_enabled() -> bool:
    return bool(_API_KEY)


def chat(system_message: str, user_text: str) -> str | None:
    """Send a single-turn message. Returns text or None on any failure."""
    model = _get_model()
    if model is None:
        return None
    try:
        import google.generativeai as genai

        full = f"{system_message}\n\n{user_text}"
        resp = model.generate_content(
            full,
            generation_config=genai.types.GenerationConfig(temperature=0.4),
        )
        return (resp.text or "").strip() or None
    except Exception as exc:  # pragma: no cover - network/runtime
        logger.warning("Gemini call failed: %s", exc)
        return None


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
    """Analyze a receipt image and return parsed transaction fields as a dictionary."""
    model = _get_model()
    if model is None:
        return None
    try:
        prompt = (
            "Analyze the attached receipt image and extract the transaction details. "
            "Return ONLY a JSON object with these exact keys:\n"
            "- 'date': in YYYY-MM-DD format (if not present or not readable, use null)\n"
            "- 'description': name of the merchant/shop/vendor\n"
            "- 'amount': total amount of the transaction as a negative number (e.g. -450.50 if the total spent was 450.50)\n"
            "- 'category': guess one of: Groceries, Food Delivery, Shopping, Entertainment, Subscriptions, Utilities, Travel, Investments, Other\n"
            "- 'payment_method': guess one of: UPI, Cash, Card, Bank Transfer, Other\n"
            "- 'quantity': number of items purchased (default 1)\n"
            "- 'price': price per item (total amount divided by quantity; default absolute amount)\n"
            "- 'notes': brief bullet points of major items bought\n\n"
            "Respond with ONLY valid minified JSON, no markdown code blocks, no ```json wrapper, and no surrounding text."
        )

        response = model.generate_content([
            {"mime_type": mime_type, "data": file_bytes},
            prompt
        ])
        raw_text = (response.text or "").strip()

        if raw_text.startswith("```"):
            raw_text = raw_text.strip("`")
            if raw_text.lower().startswith("json"):
                raw_text = raw_text[4:]
        
        start, end = raw_text.find("{"), raw_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw_text = raw_text[start : end + 1]

        return json.loads(raw_text)
    except Exception as exc:
        logger.warning("Receipt analysis failed: %s", exc)
        return None
