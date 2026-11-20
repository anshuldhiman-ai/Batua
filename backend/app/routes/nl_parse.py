"""Natural language parsing routes.

The parser helpers are synchronous and offloaded to worker threads so the
FastAPI event loop remains completely non-blocking.
"""
import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from app.models import NLRequest, BulkNLRequest
from parser import parse_nl_input, parse_bulk_lines, parse_recurring, parse_voice_input

logger = logging.getLogger("batua.routes.nl_parse")
router = APIRouter()


@router.post("/parse-nl")
async def parse_nl(payload: NLRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(400, "Empty input")
    try:
        if payload.force_recurring:
            return await asyncio.to_thread(parse_recurring, text)
        return await asyncio.to_thread(parse_nl_input, text)
    except Exception as exc:
        logger.error("Error parsing NL text %r: %s", text[:60], exc, exc_info=True)
        return {
            "kind": "single",
            "description": text[:60],
            "amount": 0.0,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "category": "Other",
            "payment_method": "",
            "quantity": 1,
            "txn_type": "debit",
        }


@router.post("/parse-nl/bulk")
async def parse_nl_bulk(payload: BulkNLRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(400, "Empty input")
    try:
        items = await asyncio.to_thread(parse_bulk_lines, text)
        return {"items": items}
    except Exception as exc:
        logger.error("Error parsing bulk NL text: %s", exc, exc_info=True)
        return {"items": []}


@router.post("/parse-nl/voice")
async def parse_nl_voice(payload: BulkNLRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(400, "Empty input")
    try:
        items = await asyncio.to_thread(parse_voice_input, text)
        return {"items": items}
    except Exception as exc:
        logger.error("Error parsing voice NL text: %s", exc, exc_info=True)
        return {"items": []}
