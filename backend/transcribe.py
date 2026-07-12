"""Offline speech-to-text using faster-whisper.

Chrome/Edge do speech recognition in Google's cloud, so the browser Web Speech
API fails with a "network" error on networks that can't reach that endpoint.
This module transcribes audio locally instead — no internet needed once the
model is downloaded — so voice input works fully offline.

It fails soft, exactly like ``ai.py`` / ``local_llm.py``: if the package or
model isn't available, ``is_enabled()`` returns False and callers fall back to
the browser API.

Config via environment:
    WHISPER_MODEL     default "medium"  (tiny|base|small|medium|large-v3)
    WHISPER_DEVICE    default "cpu"     ("cuda" if you have a GPU)
    WHISPER_COMPUTE   default "int8"    (int8 is fast/small on CPU)
    WHISPER_LANGUAGE  default "hi"      (Hindi; handles Hinglish well too)

The model is loaded lazily on first use and cached, so importing this module is
cheap and startup stays fast.
"""
from __future__ import annotations

import logging
import os
import threading

logger = logging.getLogger("batua.transcribe")

_MODEL_SIZE = os.environ.get("WHISPER_MODEL", "medium").strip() or "medium"
_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu").strip() or "cpu"
_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8").strip() or "int8"
_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "hi").strip() or "hi"
_ENABLED_FLAG = os.environ.get("WHISPER_ENABLED", "1").strip() not in ("0", "false", "no", "")

_model = None
_load_failed = False
_lock = threading.Lock()  # model load + inference are not thread-safe


def _package_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def is_enabled() -> bool:
    """True if offline transcription can be attempted.

    Only checks the flag and that the package imports — it does NOT force the
    (large) model download, so this stays cheap to call from a status endpoint.
    """
    if not _ENABLED_FLAG or _load_failed:
        return False
    return _package_available()


def model_name() -> str:
    return _MODEL_SIZE


def _get_model():
    """Lazily load and cache the Whisper model. Returns None on any failure."""
    global _model, _load_failed
    if _model is not None:
        return _model
    if _load_failed or not _ENABLED_FLAG:
        return None
    with _lock:
        if _model is not None:
            return _model
        if _load_failed:
            return None
        try:
            from faster_whisper import WhisperModel

            logger.info(
                "Loading Whisper model '%s' (device=%s, compute=%s). "
                "First run downloads the model (~once).",
                _MODEL_SIZE, _DEVICE, _COMPUTE,
            )
            _model = WhisperModel(_MODEL_SIZE, device=_DEVICE, compute_type=_COMPUTE)
            logger.info("Whisper model '%s' ready", _MODEL_SIZE)
            return _model
        except Exception as exc:  # pragma: no cover - depends on env/download
            logger.warning("Whisper model unavailable: %s", exc)
            _load_failed = True
            return None


def transcribe_file(path: str) -> str | None:
    """Transcribe an audio file to text. Returns the text, or None on failure.

    Blocking and CPU-heavy — callers should run this in a threadpool so the
    event loop is not stalled. Serialized behind a lock because CTranslate2
    inference on one model instance is not safe to call concurrently.
    """
    model = _get_model()
    if model is None:
        return None
    try:
        with _lock:
            lang = None if _LANGUAGE.lower() == "auto" else _LANGUAGE
            segments, _info = model.transcribe(
                path,
                language=lang,
                beam_size=5,
                vad_filter=False,
            )
            text = " ".join(seg.text for seg in segments).strip()
        return text or None
    except Exception as exc:  # pragma: no cover - runtime/audio decode
        logger.warning("Whisper transcription failed: %s", exc)
        return None
