"""Batua — FastAPI backend. All routes mounted under /api."""
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load the single project-root .env (shared by backend + frontend) before
# importing any module that reads env vars at import time (e.g. ai.py).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, APIRouter  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import storage as storage_mod  # noqa: E402
import ai  # noqa: E402
from app.dependencies import set_storage  # noqa: E402
from app.routes import (  # noqa: E402
    transactions,
    analytics,
    dashboard,
    budgets,
    insights,
    excel,
    export,
    categories,
    recurring,
    nl_parse,
    ml_features,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("batua")

backend_name = "unknown"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage storage lifecycle."""
    global backend_name
    # Startup
    storage, backend_name = await storage_mod.create_storage()
    set_storage(storage)
    logger.info(f"Backend initialized with {backend_name} storage")
    
    yield
    
    # Shutdown
    if storage:
        await storage.close()
        logger.info("Storage closed")


app = FastAPI(title="Batua", lifespan=lifespan)
api = APIRouter()


# Health check
@api.get("/")
async def health():
    return {"app": "Batua", "status": "live", "storage": backend_name, "ai": ai.is_enabled()}


# Include route modules
api.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api.include_router(insights.router, prefix="/insights", tags=["insights"])
api.include_router(excel.router, tags=["excel"])
api.include_router(export.router, tags=["export"])
api.include_router(categories.router, prefix="/categories", tags=["categories"])
api.include_router(recurring.router, prefix="/recurring", tags=["recurring"])
api.include_router(nl_parse.router, tags=["nl-parse"])
api.include_router(ml_features.router, prefix="/ml", tags=["ml-features"])

# Mount API router
app.include_router(api, prefix="/api")


# CORS middleware
@app.middleware("http")
async def _no_cache(request, call_next):
    """Prevent the browser from serving stale API data."""
    response = await call_next(request)
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


_origins = os.environ.get("CORS_ORIGINS", "*")
_allow_all = _origins.strip() == "*"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else [o.strip() for o in _origins.split(",")],
    # A wildcard origin and credentials are mutually exclusive per the CORS
    # spec; browsers reject the response (surfacing as a generic "Network
    # Error") if both are set. This app uses no cookies/auth, so only enable
    # credentials when the origins are explicitly listed.
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
