# Batua — Personal Finance Manager

A single-user personal finance manager with a premium SaaS UI, designed for local use.
Currency is INR (₹). Built from the FinanceOS spec and adapted to run locally on
Windows/macOS/Linux.

- **Backend:** FastAPI + MongoDB (with automatic JSON-file fallback) + pandas/Excel + Google Gemini
- **Frontend:** React 19 + React Router 7 (CRA + craco), Tailwind, shadcn-style UI, Recharts, lucide-react

> Adapted from the original Emergent-platform spec: `supervisor` → `uvicorn`,
> `/app` paths → local folders, and the proprietary `emergentintegrations`
> library → the public `google-generativeai` SDK. Every feature is implemented.

---

## Features

- **Natural-language entry** — type `zomato 450 yesterday upi` → parsed to category,
  amount, sign, date and payment method (regex pipeline, Gemini fallback for unknowns).
- **Excel import** — drag & drop. Auto-detects columns on generic exports and parses
  the stacked `Expense Table : MM/YYYY` custom format.
- **Dashboard** — KPI cards (income / expense / net / savings rate) with month-over-month
  arrows, income-vs-expense area chart, category donut, AI insights, top-5 categories.
- **Analytics** — Trend, Categories, Merchants, a custom HTML **Heatmap** (7×24), and Treemap.
- **Budgets** — per-category monthly limits with green / amber / rose progress.
- **Reports** — monthly summary table, recurring-expense detection, CSV/Excel export.
- **Settings** — light/dark theme (persisted), backend/AI status, danger zone.
- **Finance Q&A chatbot** — ask natural-language questions about your own transactions
  (`ml_rag.py`), answered by a pattern-matching engine and optionally reworded by a
  **local LLM via Ollama** (`local_llm.py`, no external API key needed). Runs in `rules`,
  `llm`, or `hybrid` mode (Settings → Insights mode).

---

## Prerequisites

- **Python 3.11+**
- **Node 18+** (Node ships `corepack`, which provides `yarn`)
- **MongoDB** (optional — the app falls back to a local JSON file at
  `backend/data/store.json` if Mongo isn't reachable)

---

## Quick start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend runs at **http://localhost:8001** (API under `/api`). All config —
backend *and* frontend — lives in a single git-ignored `.env` at the project
root (copy `.env.example` → `.env`). It holds the Google Gemini key, Mongo
settings, and `REACT_APP_BACKEND_URL`.

### 2. Frontend

```bash
cd frontend
corepack enable          # one-time: makes `yarn` available
yarn install
yarn start
```

Frontend runs at **http://localhost:3000** and talks to the backend via
`REACT_APP_BACKEND_URL` (read from the root `.env`; craco loads it at build).

> On Windows you can also just double-click `run-backend.bat` then `run-frontend.bat`.

### 3. Try it

- Type `zomato 450 yesterday upi` in the hero bar → **Parse** → **Save**, or
- Go to **Transactions** and drop `sample-data/Expenditure.xlsx` (stacked format)
  or `sample-data/bank-export.xlsx` (generic). Regenerate them with
  `python sample-data/make_samples.py`.

Watch the KPIs, charts and insights populate.

---

## Configuration (root `.env`)

| Key | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection. Falls back to SQLite (`backend/data/store.db`) if unreachable. |
| `DB_NAME` | Mongo database name. |
| `CORS_ORIGINS` | `*` or comma-separated origins. |
| `GOOGLE_API_KEY` | Google Gemini key. Empty → rule-based insights/parsing. |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash`. |
| `REACT_APP_BACKEND_URL` | Frontend → backend URL (default `http://localhost:8001`). |
| `LOCAL_LLM_URL` | Ollama server URL for the Q&A chatbot. Default `http://localhost:11434`. |
| `LOCAL_LLM_MODEL` | Ollama model name. Default `llama3.2`. Pull it with `ollama pull llama3.2`. |
| `LOCAL_LLM_ENABLED` | Set to `0` to force rule-based Q&A even if Ollama is running. Default `1`. |

---

## Project structure

```
batua/
├── backend/
│   ├── server.py         # FastAPI app, all /api routes + models
│   ├── parser.py         # natural-language transaction parser
│   ├── excel_loader.py   # column detection + stacked-format parser
│   ├── storage.py        # MongoDB primary, JSON-file fallback
│   ├── ai.py             # Google Gemini wrapper (graceful fallback)
│   ├── ml_rag.py         # Finance Q&A: pattern-matching + local-LLM rewording
│   ├── local_llm.py      # Ollama client (chat + multi-turn chat_messages)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.js                 # router + theme context + Toaster
│       ├── index.css              # fonts, CSS variables, keyframes
│       ├── lib/utils-finance.js   # api client, formatINR, CATEGORY_COLORS
│       ├── components/            # Layout, NLInputBar, KPICard, Charts, ui/
│       └── pages/                 # Dashboard, Transactions, Analytics, Budgets, Reports, Settings
└── sample-data/          # demo Excel files + generator
```

---

## Notes on the local adaptation

- **No supervisor.** Run `uvicorn` directly (or the `.bat` helpers). Hot reload via `--reload`.
- **MongoDB optional.** Without it, data persists to `backend/data/store.db` (SQLite). The
  Settings page shows which backend is active.
- **AI is optional and safe.** If the Gemini key is missing or a call fails, NL parsing
  and insights fall back to deterministic rules — the app never breaks.
- **Designed for single-user local use.** This project is intended for personal finance tracking
  on a local machine. It does not include authentication, HTTPS, or multi-user support. For
  production deployment, you would need to add these features.
