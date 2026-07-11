# Skills & Competencies — Batua

A map of the engineering skills this project demonstrates, with concrete pointers to where each shows up in the codebase. Intended as a companion to the [README](README.md) for reviewers and hiring managers.

---

## 🧭 At a Glance

| Domain | Depth |
|---|---|
| Backend / API design (FastAPI, async Python) | ●●●●● |
| Data modelling & storage abstraction | ●●●●○ |
| Applied ML / NLP | ●●●●○ |
| LLM integration (local + cloud, RAG) | ●●●●○ |
| Frontend (React 19, TypeScript, Vite) | ●●●●○ |
| Data visualisation | ●●●●○ |
| Security & production hardening | ●●●●○ |
| Testing & CI/CD | ●●●○○ |
| DevEx & documentation | ●●●●○ |

---

## 🐍 Backend Engineering

**FastAPI, async Python, Pydantic v2**

- **Modular router architecture** — one router module per domain (`transactions`, `analytics`, `budgets`, `insights`, `ml_features`, …) mounted under a single `/api` prefix, keeping each concern isolated and independently testable.
  → `backend/server.py`, `backend/app/routes/`
- **Lifespan-managed resources** — storage is initialised in an async `lifespan` context and injected via a dependency, so tests and routes share one lifecycle.
  → `backend/server.py`, `backend/app/dependencies.py`
- **Strict typed contracts** — Pydantic v2 models with `extra="ignore"` guard every request/response boundary; derived fields (e.g. `txn_type` from amount sign) are computed, not trusted from the client.
  → `backend/app/models.py`
- **Background tasks & progress streaming** — Excel imports run off the event loop with a polled progress endpoint driving a staged UI bar.
  → `backend/app/routes/excel.py`, `backend/app/upload_progress.py`

## 🗄 Data & Storage Architecture

**MongoDB, SQLite, SQLModel, async I/O**

- **Storage-controller abstraction** — a single interface (`all / get / insert / update / delete / …`) implemented by both a Motor-backed `MongoStorage` and an `aiosqlite`/SQLModel `SQLiteStorage`. Routes are storage-agnostic.
  → `backend/storage.py`
- **Transparent failover** — a 1.5 s Mongo ping decides the backend at startup; unreachable Mongo silently falls back to embedded SQLite (WAL journaling), so the app runs anywhere with zero setup.
- **Idempotent writes** — content-fingerprint de-duplication makes re-importing the same file or re-creating recurring entries safe.
  → `backend/app/helpers.py` (`_txn_key`), `backend/app/routes/transactions.py`
- **Performance** — single-pass month bucketing plus a TTL cache with mutation-bound invalidation keeps analytics fast as data grows.
  → `backend/app/cache.py`

## 🤖 Applied ML & NLP

**scikit-learn, spaCy, pandas**

- **Hybrid NL parser** — deterministic regex/heuristic extraction of amount, date, merchant, and payment method, with a trained classifier for categorisation.
  → `backend/parser.py`, `backend/ml_nlp.py`
- **Model lifecycle** — training data is built from a script, the classifier is fingerprinted and persisted (`joblib`), and stale models retrain automatically.
  → `backend/scripts/build_training_data.py`, `backend/ml_nlp.py`
- **Analytical ML** — cash-flow forecasting, spending-pattern clustering, budget optimisation, and anomaly detection over transaction history.
  → `backend/ml_analytics.py`, `backend/ml_goals.py`

## 🧠 LLM Integration & RAG

**Ollama (local), Google Gemini, prompt engineering**

- **Local-first RAG** — verified figures are computed from the user's data, wrapped in a strict grounding prompt that forbids inventing numbers, then reworded by a local Llama model. Nothing leaves the device.
  → `backend/ml_rag.py`, `backend/local_llm.py`
- **Conversational state** — multi-turn session memory with follow-up resolution ("what about last month?") and turn summarisation to bound context size.
  → `backend/chat_engine.py`
- **Graceful degradation everywhere** — every LLM call returns `None` on failure and callers fall back to deterministic logic, so no external service is ever a hard dependency.
  → `backend/ai.py`, `backend/local_llm.py`

## ⚛️ Frontend Engineering

**React 19, TypeScript, Vite, Tailwind**

- **Typed component architecture** — pages, feature components, and a hand-rolled `ui/` primitive layer (button, dialog, tabs, select, …) built on `class-variance-authority` — no heavyweight component library.
  → `frontend/src/components/`, `frontend/src/pages/`
- **Server-state management** — TanStack Query for caching and revalidation; Axios client centralised against `VITE_BACKEND_URL`.
  → `frontend/src/lib/`, `frontend/src/hooks/`
- **Custom hooks** — `useLocalStorage`, `useDebounce`, `useAnalyticsData` encapsulate cross-cutting behaviour.
  → `frontend/src/hooks/`
- **UX polish** — Framer Motion transitions, Sonner toasts, drag-and-drop uploads (`react-dropzone`), voice input, and an error boundary.
  → `frontend/src/components/`

## 📊 Data Visualisation

**Recharts**

- Spending timelines, category breakdowns, top-merchant charts, payment-method mix, treemaps, and a GitHub-style calendar heatmap — all responsive and theme-aware.
  → `frontend/src/components/analytics/`, `frontend/src/components/Charts.tsx`

## 🔐 Security & Production Hardening

- **Security headers** on every response (`nosniff`, `X-Frame-Options: DENY`, CSP, HSTS-over-HTTPS) plus a `script-src 'self'` CSP for the deployed SPA.
  → `backend/server.py`, `frontend/vercel.json`
- **Attack-surface reduction** — API docs gated behind `ENABLE_DOCS`; sanitised error responses that return a `correlation_id` instead of stack traces.
  → `backend/server.py`, `backend/app/routes/ml_features.py`
- **Secrets hygiene** — all credentials in git-ignored `.env`, a committed `.env.example`, and documented key-rotation guidance.
- **CORS discipline** — wildcard only for local use; credentials enabled solely for explicitly listed origins.

## ✅ Testing & CI/CD

**Pytest, Ruff, GitHub Actions**

- Unit tests across the parser, storage (both backends), chat engine, ML features, Excel loader, and route handlers.
  → `backend/tests/`
- CI lints (Ruff), rebuilds training data, runs the backend suite, and builds the frontend on every push/PR.
  → `.github/workflows/ci.yml`

## 🛠 Developer Experience & Docs

- One-command startup scripts (`run-backend.bat`, `run-frontend.bat`, `run-all.bat`), a single shared root `.env`, and Vite `/api` proxying for a frictionless local loop.
- Thorough documentation: architecture diagram, API surface, deployment blueprint (`render.yaml`, `DEPLOYMENT.md`), and this competency map.

---

## 🧩 Transferable Themes

Three principles recur throughout Batua and generalise beyond it:

1. **Degrade, never fail.** Every optional dependency — Mongo, Gemini, Ollama, spaCy — has a graceful fallback. The app always runs.
2. **One interface, many implementations.** The storage controller and the LLM wrappers hide their backends behind stable contracts, so swapping or adding one touches no call sites.
3. **Fast by construction.** Single-pass aggregation, mutation-bound caching, and off-event-loop heavy work keep the experience responsive without premature complexity.
