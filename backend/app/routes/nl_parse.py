"""Natural language parsing routes."""
from fastapi import APIRouter, HTTPException
from app.models import NLRequest, BulkNLRequest
from parser import parse_nl_input, parse_bulk_lines, parse_recurring, parse_voice_input

router = APIRouter()


@router.post("/parse-nl")
async def parse_nl(payload: NLRequest):
    if not payload.text.strip():
        raise HTTPException(400, "Empty input")
    if payload.force_recurring:
        return parse_recurring(payload.text)
    return parse_nl_input(payload.text)


@router.post("/parse-nl/bulk")
async def parse_nl_bulk(payload: BulkNLRequest):
    if not payload.text.strip():
        raise HTTPException(400, "Empty input")
    return {"items": parse_bulk_lines(payload.text)}


@router.post("/parse-nl/voice")
async def parse_nl_voice(payload: BulkNLRequest):
    if not payload.text.strip():
        raise HTTPException(400, "Empty input")
    return {"items": parse_voice_input(payload.text)}
