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
