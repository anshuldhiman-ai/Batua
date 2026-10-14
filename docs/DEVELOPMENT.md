# Batua — Developer Documentation

This document is the working guide for anyone building on or extending **Batua**.
It covers architecture, the request lifecycle, how to add a feature, and how storage,
parsing, and the AI layers fit together. For the API surface, see [`API.md`](API.md);
for production, see [`DEPLOYMENT.md`](../DEPLOYMENT.md).

> **Last updated:** 2026-10-14 · Critical bugs from the Oct 2026 audit have been fixed
> (SQLite schema migration, auth session flow, fixed-position dialog portaling). See
> `CLAUDE.md` → *Bug & Issue Audit* for the current state of open findings.

---

## 1. High-level architecture

```
┌────────────────────────────────────────────────────────────┐
│                      Browser (SPA)                          │
│  React 19 · TS · Vite · Tailwind · Recharts · TanStack     │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ NL input bar │ │ Dashboard    │ │ Analytics / Charts   │ │
│  │ + voice      │ │ KPIs + graphs│ │ + heatmap / treemap  │ │
│  └─────────────┘ └──────────────┘ └──────────────────────┘ │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTP  /api/*   (:3000 →proxy→ :8001)
┌──────────────────────────▼─────────────────────────────────┐
│                  FastAPI backend (uvicorn)                  │
│  server.py  →  APIRouter (prefix /api)                      │
│  └─ one router module per domain in app/routes/             │
│       transactions · analytics · dashboard · budgets · goals│
│       insights · people · categories · recurring · settings │
│       ml_features · nl_parse · transcribe · excel · export  │
│       backup                                                │
│  core services: parser.py · chat_engine.py · ml_*.py        │
│               excel_loader.py · storage.py                  │
└──────────────────────────┬─────────────────────────────────┘
                           │ async storage interface
                ┌──────────▼──────────┐
                │ storage controller  │  MongoDB (primary) ⇄ SQLite (failover)
                └─────────────────────┘
```

The frontend never talks to a database — it talks to the API only. Decoupling the two
is deliberate: the same API powers the SPA, the future Android/Capacitor shell, and any
third-party tool.

---

## 2. How a request flows

1. **Frontend** calls a single centralized axios instance in
   `src/lib/utils-finance.ts` (keyed off `VITE_BACKEND_URL`).
2. **Vite dev proxy** forwards `/api` → `http://localhost:8001`.
3. **`server.py`** mounts every domain router under `/api` and applies CORS + security
   headers.
4. The **router handler** pulls data through `storage` (async all/get/insert/update/
   delete), computes, caches, and returns JSON.
5. Writes call `invalidate_analytics_cache()` so the TTL metrics cache stays fresh.

---

## 3. Storage (no database to provision)

`backend/storage.py` presents **one async interface**. Mongo is probed once at startup
with a 1.5 s budget; if unreachable, the app hot-fails-over to SQLite (WAL). Routes never
import a DB driver directly — they depend on the injected `storage` object
(`app/dependencies.py`).

**Adding a new collection/type** requires registering a model in the storage controller
so `get_all_txns()`-style loads and `_MODEL_MAP` stay consistent.

---

## 4. Natural-language parsing pipeline

`backend/parser.py` is the heart. It resolves an entry like `zomato 450 yesterday upi`
into a structured transaction in stages:

1. Tokenize + detect **amount** (incl. formula cells like `₹15*2+₹20`), **merchant**,
   **date** (yesterday / weekday / DD/MM vs MM/DD), **payment method** (upi/cash/card).
2. **Sign resolution** — an explicit `+`/`-` typed next to the amount always wins
   (`gift -500` → debit, `salary +85000` → credit); with no sign, income keywords
   (`salary`/`gift`/`refund`/…) or the `Income` category make it a credit, otherwise
   a debit. A debit is never allowed to sit in the `Income` category.
3. **`_detect_category`** maps keywords → category.
4. Highest-confidence path wins; ambiguous input may fall through to local ML
   (`ml_nlp.py`) and then Gemini (`ai.py`). Every layer degrades gracefully.

> ⚠️ `parser.py` and `ml_nlp.py` keep near-duplicate category keyword maps. When you add
> a merchant/category, update **both** or parsing will be inconsistent.

`excel_loader.py` imports **pandas lazily** (`_ensure_pandas()` + PEP 562
module `__getattr__`) so the app boots fast when pandas isn't installed.
Gotcha: `__getattr__` only fires on *attribute access* (`pd.DataFrame` via
`module.pd`), **not** bare `pd` name references inside functions — every
function that touches `pd` directly must call `_ensure_pandas()` first.

---

## 5. AI & ML stack (all optional)

| Layer | Tech | When used |
|---|---|---|
| Rule-based | regex/heuristics (`parser.py`) | Always-first, immediate certainty |
| Local ML | scikit-learn TF-IDF + Logistic Regression (`ml_nlp.py`) | Ambiguous descriptions |
| Local LLM | Ollama `llama3.2` (`local_llm.py`) | Multi-turn Q&A reword / branding |
| Cloud fallback | Gemini `gemini-2.5-flash` (`ai.py`) | Messy parsing, rewording |

Every external call is optional: unset the key / stop the process / disable the env var,
and the app returns the tier below without erroring.

---

## 6. Adding a new endpoint (recipe)

1. Open (or create) `backend/app/routes/<domain>.py`, define `router = APIRouter()`.
2. Add `@router.get/post/...("/path")`, pull data via the injected `storage`, and return a
   dict / Pydantic model.
3. Mount it in `server.py`: `api.include_router(x.router, prefix="/<domain>", …)`.
4. Call it from the frontend through the client in `lib/utils-finance.ts`.

---

## 7. Frontend structure notes

```
src/pages/       Dashboard · Analytics · Budgets · Transactions · MLInsights · Settings · People · Goals
src/components/   Layout, NLInputBar, ReceiptScanner, charts, chat widget, ui/, analytics/
src/lib/          utils-finance.ts (API client), themes, analytics utils
src/hooks/        useLocalStorage · useDebounce · useAnalyticsData
```

- Theme-aware CSS variables — use `bg-background` / `text-muted-foreground` rather than
  hardcoded grays so dark mode stays consistent.
- Chart colours are semantic (income = emerald, expense = red) and must stay consistent
  with the KPI indicators.

---

## 8. Testing

```bash
cd backend && pytest tests/ -v && ruff check .
cd frontend && yarn build && yarn test
```

- Backend: NL parser, storage (both backends), chat engine, ML, Excel import, routes,
  server integration, insights.
- Frontend: Vitest + Testing Library (KPICard, BudgetHealth, NLInputBar, ErrorBoundary,
  utils, themes).

Live in CI via `.github/workflows/ci.yml` on every push.

---

## 9. Current known issues

The authoritative audit (25 findings across critical/high/performance/frontend) lives in
`CLAUDE.md` → **Bug & Issue Audit — 2026-10-09**. Check it before editing flagged files.

### Fixed (2026-10-09)
- SQLite schema migration — new columns are now ALTER TABLEd in via `_migrate_columns`
- Auth login 404 — the above fix resolved the `login_history` column issue
- Fixed-position dialogs — ManageProfileMenu now portal-rendered to avoid clipping

### Open high-impact items
- **#2** — 78 broad `except Exception:` handlers swallow real errors across 19 files
- **#3** — `_record_login` is a read-modify-write race (auth.py:214-223)
- **#4** — bcrypt runs synchronously on the event loop (wrap in `asyncio.to_thread`)
- **#8** — `GET /categories/` full-scans transactions just to build a `used` set
- **#9** — Navbar/Transactions search loads entire collection before filtering
- **#10** — Every app mount fires 3 unbounded ML endpoints (Layout.tsx:457-473)
- **#13** — Every transaction mutation clears the ENTIRE analytics cache

Performance fixes (#8-#13) would have the biggest user-visible impact. See the full audit
for detailed descriptions and line numbers.

**Android constraint:** the Chaquopy spike is **blocked** on `pydantic-core` (Rust)
having no Android wheel — avoid adding heavy mandatory deps that would deepen it.