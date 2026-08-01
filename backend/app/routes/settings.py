"""Runtime settings routes (API key management etc.)."""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import ai

logger = logging.getLogger("batua.settings")

router = APIRouter()


class GeminiKeyUpdate(BaseModel):
    api_key: str


@router.get("/settings/gemini-key")
async def gemini_key_status():
    """Whether a Gemini API key is configured (never reveals the key itself)."""
    return {"configured": ai.is_enabled()}


@router.put("/settings/gemini-key")
async def update_gemini_key(payload: GeminiKeyUpdate):
    """Set the Gemini API key at runtime — updates the process env + .env file."""
    key = (payload.api_key or "").strip()
    if not key:
        raise HTTPException(400, "API key cannot be empty")
    ai.set_api_key(key)
    return {"updated": True, "configured": True}
