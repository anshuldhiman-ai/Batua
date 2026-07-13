"""Offline speech-to-text using faster-whisper.

Chrome/Edge do speech recognition in Google's cloud, so the browser Web Speech
API fails with a "network" error on networks that can't reach that endpoint.
This module transcribes audio locally instead — no internet needed once the
model is downloaded — so voice input works fully offline.

It fails soft, exactly like ``ai.py`` / ``local_llm.py``: if the package or
model isn't available, ``is_enabled()`` returns False and callers fall back to
the browser API.

Config via environment (the model is also settable at runtime from Settings —
see ``set_active_model`` — and that choice is persisted, overriding the env):
    WHISPER_MODEL     default "small"   (tiny|base|small|medium|large-v3)
    WHISPER_DEVICE    default "cpu"     ("cuda" if you have a GPU)
    WHISPER_COMPUTE   default "int8"    (int8 is fast/small on CPU)
    WHISPER_LANGUAGE  default "auto"    (auto-detect; forcing "hi" can garble
                                         Hinglish/English speech — see below)

Models are loaded lazily on first use and cached per size, so importing this
module is cheap and startup stays fast. Switching models in Settings keeps
previously-loaded ones cached, so switching back is instant.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path

logger = logging.getLogger("batua.transcribe")

# Model sizes faster-whisper can download, smallest/fastest → largest/most
# accurate. Exposed to the UI so the picker and the backend agree.
AVAILABLE_MODELS = ["tiny", "base", "small", "medium", "large-v3"]

_ENV_MODEL = os.environ.get("WHISPER_MODEL", "small").strip() or "small"
_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu").strip() or "cpu"
_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8").strip() or "int8"


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


# Decoding width. beam_size=1 (greedy) is noticeably faster than the classic 5
# with little quality loss for short, clear expense clips — a better default for
# a CPU-bound local app. Bump WHISPER_BEAM to 5 if you want max accuracy.
_BEAM = max(1, _int_env("WHISPER_BEAM", 1))
# CTranslate2 defaults to a conservative thread count; using all logical cores
# is ~35% faster on CPU here. Override with WHISPER_CPU_THREADS.
_CPU_THREADS = max(1, _int_env("WHISPER_CPU_THREADS", os.cpu_count() or 4))
# Language: a code like "hi"/"en", or "auto"/"" to let Whisper detect it.
# faster-whisper wants None (not the string "auto") for auto-detection.
_lang_env = os.environ.get("WHISPER_LANGUAGE", "auto").strip().lower()
_LANGUAGE = None if _lang_env in ("", "auto", "none", "detect") else _lang_env
_ENABLED_FLAG = os.environ.get("WHISPER_ENABLED", "1").strip() not in ("0", "false", "no", "")

# The model choice picked in Settings persists here so it survives restarts and
# overrides WHISPER_MODEL. Kept next to the other runtime data (SQLite, etc.).
_SETTINGS_PATH = Path(__file__).parent / "data" / "whisper_settings.json"

_models: dict[str, object] = {}   # size -> loaded WhisperModel (cache)
_load_failed = False              # True once a load hard-fails (package missing)
_lock = threading.Lock()          # model load + inference are not thread-safe


def _read_active_model() -> str:
    """Active model size: the persisted choice if any, else the env default.

    Falls back to the env default when the file is missing, corrupt, or names a
    size we don't recognise — so a hand-edited or stale file can't wedge STT.
    """
    try:
        data = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
        name = str(data.get("model", "")).strip().lower()
        if name in AVAILABLE_MODELS:
            return name
    except (OSError, ValueError, TypeError):
        pass
    return _ENV_MODEL


_active_model = _read_active_model()


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
    """The currently active model size (persisted choice or env default)."""
    return _active_model


def available_models() -> list[str]:
    return list(AVAILABLE_MODELS)


def loaded_models() -> list[str]:
    """Sizes already downloaded + loaded into memory (switching to these is instant)."""
    return sorted(_models.keys())


def set_active_model(name: str) -> str:
    """Switch the app-wide model and persist the choice. Returns the active size.

    The new model isn't downloaded here — it loads lazily on the next
    transcription — so this stays fast and can't block on a multi-GB download.
    Raises ValueError for an unknown size so the route can 400.
    """
    global _active_model
    name = (name or "").strip().lower()
    if name not in AVAILABLE_MODELS:
        raise ValueError(f"Unknown model '{name}'. Choose one of: {', '.join(AVAILABLE_MODELS)}")
    _active_model = name
    try:
        _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SETTINGS_PATH.write_text(json.dumps({"model": name}), encoding="utf-8")
    except OSError as exc:  # non-fatal: choice still applies for this process
        logger.warning("Could not persist Whisper model choice: %s", exc)
    logger.info("Whisper model switched to '%s'", name)
    return _active_model


def warm_model(size: str | None = None) -> bool:
    """Load (downloading on first use) a model so a later transcription is fast.

    Lets the UI pay the load/download cost as an explicit "Loading model…" step
    instead of hiding it inside the first transcription. Blocking — call via a
    threadpool. Returns True once the model is ready.
    """
    return _get_model(size) is not None


def _get_model(size: str | None = None):
    """Lazily load and cache the Whisper model for ``size``. None on any failure."""
    global _load_failed
    size = (size or _active_model)
    if size in _models:
        return _models[size]
    if _load_failed or not _ENABLED_FLAG:
        return None
    with _lock:
        if size in _models:
            return _models[size]
        if _load_failed:
            return None
        try:
            from faster_whisper import WhisperModel

            logger.info(
                "Loading Whisper model '%s' (device=%s, compute=%s). "
                "First run downloads the model (~once).",
                size, _DEVICE, _COMPUTE,
            )
            model = WhisperModel(
                size, device=_DEVICE, compute_type=_COMPUTE, cpu_threads=_CPU_THREADS
            )
            _models[size] = model
            logger.info("Whisper model '%s' ready", size)
            return model
        except Exception as exc:  # pragma: no cover - depends on env/download
            logger.warning("Whisper model '%s' unavailable: %s", size, exc)
            # A bad size shouldn't permanently disable STT for the good default;
            # only flag a hard failure when even the active model can't load.
            if size == _active_model:
                _load_failed = True
            return None


def transcribe_details(path: str, model_size: str | None = None) -> dict | None:
    """Transcribe an audio file, returning text plus detection metadata.

    Returns ``{text, model, language, language_probability, duration_ms}`` or
    None on failure. ``model_size`` overrides the active model for this one call
    (used by the Settings mic test); omit it to use the app-wide model.

    Blocking and CPU-heavy — callers should run this in a threadpool. Serialized
    behind a lock because CTranslate2 inference on one instance isn't concurrent.
    """
    size = model_size or _active_model
    model = _get_model(size)
    if model is None:
        return None
    try:
        with _lock:
            started = time.perf_counter()
            # _LANGUAGE is None for auto-detect (normalized at import); passing
            # None lets Whisper detect the language, which is far more robust
            # than forcing one (forcing "hi" garbles Hinglish/English).
            segments, info = model.transcribe(
                path,
                language=_LANGUAGE,
                beam_size=_BEAM,
                vad_filter=False,
            )
            text = " ".join(seg.text for seg in segments).strip()
            elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {
            "text": text,
            "model": size,
            "language": getattr(info, "language", None),
            "language_probability": round(float(getattr(info, "language_probability", 0.0)), 3),
            "duration_ms": elapsed_ms,
        }
    except Exception as exc:  # pragma: no cover - runtime/audio decode
        logger.warning("Whisper transcription failed: %s", exc)
        return None


def transcribe_file(path: str, model_size: str | None = None) -> str | None:
    """Transcribe an audio file to text. Returns the text, or None on failure.

    Thin wrapper over :func:`transcribe_details` for callers that only need the
    text (the main voice-input path).
    """
    details = transcribe_details(path, model_size=model_size)
    if not details:
        return None
    return details["text"] or None
