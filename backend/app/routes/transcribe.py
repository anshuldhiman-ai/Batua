"""Offline voice transcription route.

Records made in the browser are uploaded here and transcribed locally with
faster-whisper, then fed through the same Hinglish voice parser used by the
Web Speech path. This makes voice input work on networks where the browser's
cloud recognizer (Google) is unreachable.
"""
import asyncio
import base64
import logging
import os
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

import ai
import transcribe as stt
from parser import parse_voice_input

logger = logging.getLogger("batua.transcribe")

router = APIRouter()

MAX_AUDIO_SIZE = 15 * 1024 * 1024  # 15MB — plenty for a short voice note


async def _gemini_transcribe(content: bytes, mime_type: str = "audio/webm") -> str | None:
    """Fallback audio transcription via Google Gemini Multimodal when available."""
    if not ai.is_enabled():
        return None
    try:
        b64 = base64.b64encode(content).decode("ascii")
        prompt = (
            "You are an accurate audio transcriber for a personal finance app. "
            "Transcribe this short expense voice clip verbatim into English or Hinglish. "
            "Return ONLY the exact spoken transcript without any explanations, timestamps, quotes, or markdown formatting."
        )
        payload = {
            "contents": [
                {
                    "parts": [
                        {"inline_data": {"mime_type": mime_type, "data": b64}},
                        {"text": prompt},
                    ]
                }
            ],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 150},
        }
        res = await asyncio.to_thread(ai._post, f"models/{ai.model_name()}:generateContent", payload)
        if res and "candidates" in res:
            text = ai._extract_text(res)
            return text.strip() if text else None
    except Exception as exc:
        logger.warning("Gemini audio transcription fallback failed: %s", exc)
    return None


@router.get("/transcribe/status")
async def transcribe_status():
    """Report whether offline or cloud transcription is available.

    The frontend calls this once to decide between backend transcription and
    the browser Web Speech API. Cheap: does not force the model download. Also
    powers the Settings mic-test panel (model picker + which are loaded).
    """
    return {
        "available": stt.is_enabled(),
        "model": stt.model_name(),
        "models": stt.available_models(),
        "loaded": stt.loaded_models(),
        "whisper_available": stt.is_enabled(),
        "gemini_available": ai.is_enabled(),
    }


class ModelChoice(BaseModel):
    model: str


@router.post("/transcribe/model")
async def set_transcribe_model(choice: ModelChoice):
    """Switch the app-wide Whisper model and persist the choice.

    The new model downloads/loads lazily on the next transcription, so this
    returns immediately even for a multi-GB model.
    """
    if not stt.is_enabled():
        raise HTTPException(503, "Offline transcription isn't available on the server.")
    try:
        active = stt.set_active_model(choice.model)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"model": active, "models": stt.available_models(), "loaded": stt.loaded_models()}


@router.post("/transcribe/warm")
async def warm_transcribe_model(choice: ModelChoice | None = None):
    """Preload a model (downloading on first use) so the next test is fast.

    Lets the UI show a distinct "Loading model…" step instead of a mysteriously
    slow first transcription. Defaults to the active model.
    """
    if not stt.is_enabled():
        raise HTTPException(503, "Offline transcription isn't available on the server.")
    size = (choice.model if choice else None) or stt.model_name()
    if size not in stt.available_models():
        raise HTTPException(400, f"Unknown model '{size}'.")
    ok = await run_in_threadpool(stt.warm_model, size)
    if not ok:
        raise HTTPException(500, f"Could not load model '{size}'.")
    return {"model": size, "loaded": stt.loaded_models()}


@router.post("/transcribe/test")
async def transcribe_test(
    file: UploadFile = File(...),
    model: str | None = Form(default=None),
):
    """Transcribe a mic-test clip and return the raw text + detection details.

    Unlike ``POST /transcribe`` this does NOT parse the text into transactions —
    it's the Settings "check your microphone" tool. ``model`` optionally
    overrides the active model just for this test.
    """
    if not stt.is_enabled():
        raise HTTPException(503, "Offline transcription isn't available on the server.")
    if model and model not in stt.available_models():
        raise HTTPException(400, f"Unknown model '{model}'.")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty audio upload")
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(
            400, f"Audio too large. Maximum size is {MAX_AUDIO_SIZE // (1024 * 1024)}MB"
        )

    raw_suffix = os.path.splitext(file.filename or "")[1].lower()
    suffix = raw_suffix if raw_suffix in {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".flac"} else ".webm"
    mime_type = "audio/webm"
    if suffix == ".wav":
        mime_type = "audio/wav"
    elif suffix == ".mp3":
        mime_type = "audio/mp3"
    elif suffix == ".ogg":
        mime_type = "audio/ogg"

    details = None
    if stt.is_enabled():
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            details = await run_in_threadpool(stt.transcribe_details, tmp_path, model)
        except Exception as exc:
            logger.warning("Mic-test transcription error: %s", exc)
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    # Fallback to Gemini if Whisper failed or was unavailable
    if (not details or not details.get("text")) and ai.is_enabled():
        gemini_text = await _gemini_transcribe(content, mime_type=mime_type)
        if gemini_text:
            details = {
                "text": gemini_text,
                "model": f"gemini-{ai.model_name()}",
                "language": "en",
                "language_probability": 0.95,
                "duration_ms": 500,
            }

    if not details:
        raise HTTPException(500, "Could not transcribe the audio. Please speak louder and try again.")
    return details


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe an uploaded audio clip and parse it into transactions.

    Returns {text, items, engine} where items is the same shape as /parse-nl/voice.
    """
    if not stt.is_enabled():
        raise HTTPException(
            503,
            "Offline transcription isn't available. Install faster-whisper on "
            "the server, or use the browser's built-in voice input.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty audio upload")
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(
            400, f"Audio too large. Maximum size is {MAX_AUDIO_SIZE // (1024 * 1024)}MB"
        )

    text = None
    engine_used = None

    raw_suffix = os.path.splitext(file.filename or "")[1].lower()
    suffix = raw_suffix if raw_suffix in {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".flac"} else ".webm"
    mime_type = "audio/webm"
    if suffix == ".wav":
        mime_type = "audio/wav"
    elif suffix == ".mp3":
        mime_type = "audio/mp3"
    elif suffix == ".ogg":
        mime_type = "audio/ogg"

    # 1. Try local Whisper first (100% offline, local-first)
    if stt.is_enabled():
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            text = await run_in_threadpool(stt.transcribe_file, tmp_path)
            if text and text.strip():
                text = text.strip()
                engine_used = f"whisper-{stt.model_name()}"
        except Exception as exc:
            logger.warning("Whisper transcription error: %s", exc)
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    # 2. Fall back to Gemini Multimodal Audio if Whisper was empty or failed
    if (not text or not text.strip()) and ai.is_enabled():
        try:
            gemini_text = await _gemini_transcribe(content, mime_type=mime_type)
            if gemini_text and gemini_text.strip():
                text = gemini_text.strip()
                engine_used = f"gemini-{ai.model_name()}"
        except Exception as exc:
            logger.warning("Gemini audio transcription error: %s", exc)

    if not text:
        return {"text": "", "items": [], "engine": None}

    items = parse_voice_input(text)
    return {"text": text, "items": items, "engine": engine_used}
