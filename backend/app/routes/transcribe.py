"""Offline voice transcription route.

Records made in the browser are uploaded here and transcribed locally with
faster-whisper, then fed through the same Hinglish voice parser used by the
Web Speech path. This makes voice input work on networks where the browser's
cloud recognizer (Google) is unreachable.
"""
import logging
import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

import transcribe as stt
from parser import parse_voice_input

logger = logging.getLogger("batua.transcribe")

router = APIRouter()

MAX_AUDIO_SIZE = 15 * 1024 * 1024  # 15MB — plenty for a short voice note


@router.get("/transcribe/status")
async def transcribe_status():
    """Report whether offline transcription is available.

    The frontend calls this once to decide between backend transcription and
    the browser Web Speech API. Cheap: does not force the model download.
    """
    return {"available": stt.is_enabled(), "model": stt.model_name()}


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe an uploaded audio clip and parse it into transactions.

    Returns {text, items} where items is the same shape as /parse-nl/voice.
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

    # faster-whisper reads from a path (it decodes via PyAV/ffmpeg), so spool
    # the upload to a temp file. Suffix helps the decoder pick a demuxer.
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp_path = None
    try:
        # Save a copy to scratch/ for debugging
        scratch_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "scratch")
        os.makedirs(scratch_dir, exist_ok=True)
        debug_path = os.path.join(scratch_dir, "last_voice" + suffix)
        with open(debug_path, "wb") as f:
            f.write(content)
        logger.info("Saved copy of voice upload to %s (%d bytes)", debug_path, len(content))

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        text = await run_in_threadpool(stt.transcribe_file, tmp_path)
    except Exception as exc:
        logger.warning("Transcription error: %s", exc)
        raise HTTPException(500, "Could not transcribe the audio. Please try again.")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    if not text:
        return {"text": "", "items": []}

    items = parse_voice_input(text)
    return {"text": text, "items": items}
