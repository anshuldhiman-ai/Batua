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
from fastapi.responses import JSONResponse  # noqa: E402
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
    transcribe,
    backup,
    people,
    goals,
    settings,
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


# Interactive API docs (/docs, /redoc) and the OpenAPI schema are handy in
# development but expose the full API surface publicly. Gate them behind a
# flag that defaults OFF so a production deploy is closed by default; set
# ENABLE_DOCS=1 locally (or in a trusted environment) to turn them back on.
_docs_enabled = os.environ.get("ENABLE_DOCS", "0").strip() not in ("0", "false", "no", "")

app = FastAPI(
    title="Batua",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
api = APIRouter()


# The frontend's in-app API docs page (/api-docs) fetches the OpenAPI schema
# through the same /api proxy/URL as every other endpoint. Gated behind the
# same ENABLE_DOCS flag as /docs and /openapi.json so production stays closed
# by default.
if _docs_enabled:

    @api.get("/openapi.json", include_in_schema=False)
    async def api_openapi():
        return JSONResponse(app.openapi())


# Health check
@api.get("/")
async def health():
    return {
        "app": "Batua",
        "status": "live",
        "storage": backend_name,
        "ai": ai.is_enabled(),
        "ai_model": ai.model_name() if ai.is_enabled() else None,
    }


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
api.include_router(transcribe.router, tags=["transcribe"])
api.include_router(people.router, prefix="/people", tags=["people"])
api.include_router(backup.router, tags=["backup"])
api.include_router(goals.router, prefix="/goals", tags=["goals"])
api.include_router(settings.router, tags=["settings"])

# Mount API router
app.include_router(api, prefix="/api")


# Security headers + cache control.
#
# The API returns JSON (never HTML), so a strict Content-Security-Policy that
# forbids any active content is a cheap, safe default: even if a response were
# ever mis-rendered as a document, nothing could execute. HSTS is only sent
# over HTTPS (it's meaningless and can lock out local http:// dev otherwise).
# A stricter CSP for the JSON API: it never renders HTML, so forbidding any
# active content is safe.
_API_CSP = "default-src 'none'; frame-ancestors 'none'"
# Swagger/ReDoc pages (only reachable when ENABLE_DOCS=1) render real HTML and
# need to load the UI bundle + styles from jsDelivr, fetch /openapi.json, and
# run their inline bootstrapping script. Scope the CSP to exactly those sources.
_DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "font-src 'self' data: https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)


@app.middleware("http")
async def _security_headers(request, call_next):
    """Attach security headers to every response and disable API caching."""
    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path in ("/docs", "/redoc", "/openapi.json"):
        response.headers.setdefault("Content-Security-Policy", _DOCS_CSP)
    else:
        response.headers.setdefault("Content-Security-Policy", _API_CSP)
    # Only advertise HSTS when the request actually arrived over TLS, so local
    # http development isn't pinned to https by the browser.
    if request.url.scheme == "https":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )

    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


_origins = os.environ.get("CORS_ORIGINS", "")
_allow_all = _origins.strip() == "*"
if not _origins.strip() or _allow_all:
    logger.warning("CORS_ORIGINS is wildcard/empty; set an explicit frontend origin before production.")
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
    # Hosts (Render, Railway, Fly, …) inject the port to bind via $PORT.
    # Fall back to 8001 for local development.
    port = int(os.environ.get("PORT", "8001"))
    # Auto-reload only during local development; keep it off in production
    # (e.g. `PORT=8000 BATUA_DEV=0 python server.py` or a `gunicorn` wrapper).
    reload = os.environ.get("BATUA_DEV", "1") == "1"
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=reload)
