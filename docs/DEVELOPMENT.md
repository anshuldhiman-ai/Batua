# Batua — Developer Documentation

This document is the working guide for anyone building on or extending **Batua**.
It covers architecture, the request lifecycle, how to add a feature, and how storage,
parsing, and the AI layers fit together. For the API surface, see [`API.md`](API.md);
for production, see [`DEPLOYMENT.md`](../DEPLOYMENT.md).

> **Last updated:** 2026-08-02 · This guide reflects **intended** architecture. Where
> current behavior deviates (known bugs), the code may differ from the happy path
> described here — see §9 and the authoritative audit in `CLAUDE.md` → *Known Issues*.

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
2. **`_detect_category`** maps keywords → category.
3. Highest-confidence path wins; ambiguous input may fall through to local ML
   (`ml_nlp.py`) and then Gemini (`ai.py`). Every layer degrades gracefully.

> ⚠️ `parser.py` and `ml_nlp.py` keep near-duplicate category keyword maps. When you add
> a merchant/category, update **both** or parsing will be inconsistent.

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

The authoritative, full audit (critical/high/medium/low, ~50 findings) lives in
`CLAUDE.md` → **Known Issues**. That is the source of truth and **will outdate this
section** — check it before editing any of the files flagged below. The ones that most
affect day-to-day development (IDs match the CLAUDE.md audit):

- **Critical**
  - C1 — `pytest-asyncio==1.4.0` pin in `requirements.txt` is a version that never
    existed; CI pre-installs separately to work around it.
  - C2 — no `test` script in `frontend/package.json`; CI never runs frontend tests.
  - C3 — the `"credit"` keyword in `INCOME_WORDS` misclassifies credit-card expenses as
    income. **Fix this first if you touch the parser.**
  - C4 — race condition in analytics cache expiry (`app/cache.py`) — don't reintroduce
    the double-`del`.
  - C5 — 70+ bare `except Exception:` handlers across the backend silently swallow bugs.
  - C7 — Excel import sends `undefined` as the file (`Transactions.tsx:518`).
- **High**
  - H1 — every endpoint loads all txns into memory via `get_all_txns()`; fine for a
    personal ledger, will struggle past ~50 k rows.
  - H7 — `parser.py` vs `ml_nlp.py` category maps can drift — keep in sync.
  - H14 — `clearChatMemory()` (Settings.tsx) no-ops with a success toast when no chat
    session id exists.
- **Medium**
  - M1 — `local_llm.py` uses a sync `httpx.Client()` in async FastAPI.
  - M7 — frontend BASE URL can double-slash (`http://localhost:8001//api`).
  - M8 — `test_chat_engine.py` uses clock-dependent dates → non-deterministic tests.
  - M13 — `fastest_growing` analytics stub always returns `10.0`.
- **Other constraint:** the Android/Chaquopy spike is **blocked** on `pydantic-core`
  (Rust) having no Android wheel — don't add heavy mandatory deps that would deepen it.