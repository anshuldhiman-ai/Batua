"""Natural language parsing routes.

The parser helpers are synchronous and, when Gemini is configured, make a
blocking HTTPS call (up to 30s) per line. Calling them directly from an async
handler would freeze the event loop for every other request, so each one is
offloaded to a worker thread — same pattern as the staged Excel import and the
insights routes.
"""
import asyncio

from fastapi import APIRouter, HTTPException
from app.models import NLRequest, BulkNLRequest
from parser import parse_nl_input, parse_bulk_lines, parse_recurring, parse_voice_input

router = APIRouter()


@router.post("/parse-nl")
async def parse_nl(payload: NLRequest):
    if not payload.text.strip():
        raise HTTPException(400, "Empty input")
    if payload.force_recurring:
        return await asyncio.to_thread(parse_recurring, payload.text)
    return await asyncio.to_thread(parse_nl_input, payload.text)


@router.post("/parse-nl/bulk")
async def parse_nl_bulk(payload: BulkNLRequest):
    if not payload.text.strip():
        raise HTTPException(400, "Empty input")
    items = await asyncio.to_thread(parse_bulk_lines, payload.text)
    return {"items": items}


@router.post("/parse-nl/voice")
async def parse_nl_voice(payload: BulkNLRequest):
    if not payload.text.strip():
        raise HTTPException(400, "Empty input")
    items = await asyncio.to_thread(parse_voice_input, payload.text)
    return {"items": items}
