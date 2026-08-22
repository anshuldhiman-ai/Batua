# AGENTS — Working Instructions for this Repository

Instructions for Claude Code (or any agent) working on **Batua**, the privacy-first,
local-first personal finance manager. Keep this file in sync with `CLAUDE.md` (the
human-facing project doc) whenever the architecture or tooling changes.

---

## 🧭 What Batua Is

`batua` (*wallet* in Hindi) is a decoupled **FastAPI backend + React 19 SPA**
transaction tracker. Its core feature: type a natural-language expense —
`zomato 450 yesterday upi` — and it parses, categorises, stores, and visualises it.

**Guardrail:** privacy-first and local-first is the north star. All data stays on the
machine; the Q&A assistant runs on a **local Ollama** model by default, and Gemini is
only an optional fallback. Don't add features that require a hosted server or send
user data to a cloud service.

---

## Layout

```
backend/                  # FastAPI app (Python 3.11+, async, uvicorn)
  server.py               # entrypoint: lifespan, CORS, security headers, mount routers
  storage.py              # dual MongoDB/SQLite controller (identical async interface)
  parser.py               # regex/heuristic NL transaction parsing
  ml_nlp.py / ml_analytics.py / ml_goals.py / ml_rag.py / ml_features.py
  chat_engine.py          # multi-turn Q&A with follow-up resolution
  local_llm.py            # Ollama client  ·  ai.py = Gemini wrapper
  excel_loader.py         # column auto-detect + Excel/CSV import
  app/routes/             # one router module PER domain
  app/models.py           # Pydantic v2 models  ·  app/cache.py = TTL metrics cache
  tests/                  # pytest suite
frontend/                 React 19 + TS + Vite 6 + Tailwind 3 SPA
  src/pages/              Dashboard · Analytics · Budgets · Transactions · MLInsights · Settings · People · Goals
  src/components/         Layout, NLInputBar, Tour, charts, chat widget, ui/, analytics/
  src/lib/utils-finance.ts  # centralized axios API client (single VITE_BACKEND_URL)
  tour-steps.tsx          # comprehensive onboarding tour with live demos (20+ steps)
  tour-contextual.tsx     # route-based contextual step system
render.yaml               # Render blueprint for the backend
DEPLOYMENT.md             # Render + Vercel deploy walkthrough
docs/API.md               # full REST reference, every endpoint grouped by domain
docs/DEVELOPMENT.md       # build guide: architecture, request flow, adding endpoints
SCREENSHOT_CAPTURE_PROMPT.md  # comprehensive screenshot capture guide
```

---

## Commands

```bash
# Backend (dev)
cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (dev)
cd frontend && yarn dev          # runs on :3000, proxies /api → :8001

# Tests / lint
cd backend && pytest tests/ -v && ruff check .
cd frontend && yarn build && yarn test
```

## Conventions that matter

- **Routes live in `backend/app/routes/<domain>.py`** — one module per domain, mounted
  under `/api`. Don't dump new endpoints into `server.py`.
- **Storage is decoupled.** Never import a Mongo or SQLite driver directly in a route —
  go through the storage controller's async interface (all/get/insert/update/delete).
- **All AI tiers degrade gracefully** — LLM → ML → regex → rule-based. A missing
  dependency must never crash a request.
- **Frontend HTTP goes through one axios instance** in `src/lib/utils-finance.ts`, not
  ad-hoc fetch calls scattered around.
- **Tour system is responsive and crash-safe** — Tour steps support fallback targets,
  `allowInteraction` for user clicks, and contextual adaptation based on route.

---

## Known gotchas to respect (don't reintroduce)

- `parser.py` keeps two category-keyword maps; keep `backend/parser.py` and
  `backend/ml_nlp.py` in sync when adding merchants/categories.
- `pydantic-core` (Rust) has **no prebuilt Android wheel** in Chaquopy's index — the
  in-progress Android/Chaquopy spike is blocked on this. Don't touch `scratch/` for the
  conversion, and don't add new heavy mandatory deps.
- There's a **full audit** in `CLAUDE.md` → *Known Issues* (critical/high/medium/low).
  Check it before editing the flagged files.
- **Backend dependencies** — pytest is pinned to 8.3.4 (not 9.x) due to pytest-asyncio
  compatibility requirements. Don't upgrade without checking compatibility.
- **Tour component** — When adding new tour steps, ensure targets exist with proper
  `data-testid` attributes. Use `allowInteraction: true` for steps requiring user clicks.

---

## Recent Feature Additions (2026-08)

### Tour System Enhancement
- **Comprehensive onboarding tour** with 20+ steps covering all pages
- **Live demo functionality** — auto-types input, waits for user Parse, auto-advances
- **Contextual step system** — route-based steps that adapt to user navigation
- **Crash prevention** — fallback targets when elements not found
- **Interactive steps** — `allowInteraction` flag allows user clicks during tour
- **Responsive behavior** — works across mobile/desktop breakpoints

### Responsive Design Improvements
- **Layout component tests** — comprehensive responsive behavior testing
- **Mobile-first navigation** — adaptive sidebar, safe area insets for notched devices
- **Dynamic page titles** — browser tab titles update based on current route
- **CSS responsive classes** — proper `lg:hidden`, `lg:flex` usage throughout

### Testing Enhancements
- **Frontend test coverage** — Layout.test.tsx with 12 responsive tests
- **Tour component tests** — existing Tour.test.tsx maintained
- **Backend dependency fix** — pytest downgraded to 8.3.4 for compatibility

---

See `CLAUDE.md` for the full architecture, feature list, and the Android APK conversion
roadmap.