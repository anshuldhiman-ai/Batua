"""Categories route."""
from fastapi import APIRouter
from parser import CATEGORIES
from app.dependencies import get_storage

router = APIRouter()

DEFAULT_CATEGORIES = list(CATEGORIES.keys()) + ["Other"]


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/")
async def categories():
    txns = await get_all_txns()
    used = {t.get("category", "Other") for t in txns}
    allc = list(dict.fromkeys(DEFAULT_CATEGORIES + sorted(used)))
    return {"categories": allc}
