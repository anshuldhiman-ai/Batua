# Batua API Reference

Base URL: `http://localhost:8001/api/` (dev) · all routes are mounted under `/api`.

> **Last updated:** 2026-08-02 · Reflects the code at the latest working tree on `main`.
> This doc describes **intended** behavior; where current behavior deviates (known bugs),
> the affected rows carry a `⚠️` note pointing to the CLAUDE.md audit entry. Docs drift —
> check `/openapi.json` (with `ENABLE_DOCS=1`) for the live source of truth.

> **Interactive docs:** run the backend with `ENABLE_DOCS=1`, then open
> `/docs` (Swagger UI), `/redoc`, or `/openapi.json`.

Every response is JSON. Errors return a sanitised `{ detail, correlation_id }` — stack
traces stay in server logs only.

---

## Transactions — `/api/transactions`

| Method | Path | Description |
|---|---|---|
| GET | `/api/transactions` | List transactions. Query params: `q` (search), `category`, `month` (`YYYY-MM`), `type` (`expense`/`income`), `people` |
| POST | `/api/transactions` | Create a single transaction |
| POST | `/api/transactions/bulk` | Create multiple transactions from an array |
| POST | `/api/transactions/recurring` | Replicate one transaction across selected months (idempotent dedup). Payload: `{ txn, months: [] }` |
| PUT | `/api/transactions/{txn_id}` | Update a transaction |
| POST | `/api/transactions/bulk-delete` | Delete by ids: `{ ids: [] }` |
| DELETE | `/api/transactions/{txn_id}` | Delete one transaction |
| DELETE | `/api/transactions` | Delete all (query `?category=` optional) |
| POST | `/api/transactions/scan-receipt` | OCR a receipt image → parsed transaction (tesseract.js) |

### Transaction object

```json
{
  "id": "…",
  "date": "2026-07-28",
  "description": "zomato 450",
  "amount": 450.0,
  "category": "Food & Dining",
  "transaction_type": "expense",
  "payment_method": "upi",
  "price_eval": null,
  "meta": {}
}
```

---

## Analytics — `/api/analytics`

| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/timeline` | Spending timeline `?granularity=daily\|weekly\|monthly\|yearly` |
| GET | `/api/analytics/category-breakdown` | Spend per category |
| GET | `/api/analytics/top-merchants` | Top merchants by amount |
| GET | `/api/analytics/heatmap` | GitHub-style calendar heatmap |
| GET | `/api/analytics/payment-method` | Payment-method mix |
| GET | `/api/analytics/treemap` | Treemap hierarchy data |
| GET | `/api/analytics/summary` | Consolidated analytics summary |

---

## Dashboard — `/api/dashboard`

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/metrics` | KPIs: income, expense, net, savings-rate with MoM deltas |

---

## Budgets — `/api/budgets`

| Method | Path | Description |
|---|---|---|
| GET | `/budgets` | List budgets |
| POST | `/budgets` | Create budget `{ category, limit, period }` |
| DELETE | `/budgets/{budget_id}` | Delete a budget |
| GET | `/budgets/status` | Live budget health per category |

---

## Goals — `/api/goals`

| Method | Path | Description |
|---|---|---|
| GET | `/goals` | List savings goals |
| POST | `/goals` | Create goal `{ name, target_amount, target_date }` |
| PUT | `/goals/{goal_id}` | Update a goal |
| DELETE | `/goals/{goal_id}` | Delete a goal |
| POST | `/goals/{goal_id}/contribute` | Record a contribution |

---

## ML Features — `/api/ml`

| Method | Path | Description |
|---|---|---|
| POST | `/ml/parse-local` | Rule/local classify a description |
| POST | `/ml/classify` | ML classification of a description |
| POST | `/ml/recategorize` | Recategorise a transaction |
| GET | `/ml/ml-status` | Availability of ML/LLM layers |
| GET | `/ml/spending-patterns` | KMeans spending clusters |
| GET | `/ml/cash-flow-forecast` | ARIMA cash-flow forecast |
| POST | `/ml/optimize-budget` | Budget optimisation suggestions |
| GET | `/ml/goals` | Goal recommendations |
| GET | `/ml/recommendations` | Savings recommendations |
| GET | `/ml/anomalies` | Isolation-Forest anomaly detection |
| POST | `/ml/qa` | Ask the grounded Q&A assistant `{ query, session_id }` |
| GET | `/ml/qa/suggestions` | Question suggestions |
| GET | `/ml/chat/{session_id}` | Chat history |
| DELETE | `/ml/chat/{session_id}` | Clear chat memory. ⚠️ Frontend `clearChatMemory()` (Settings.tsx) guards on `if (chatSessionId)` — if no session id exists it skips the call entirely and shows a success toast regardless. That's **H14** in the CLAUDE.md audit; the endpoint itself is clean |

---

## People — `/api/people`

| Method | Path | Description |
|---|---|---|
| GET | `/people` | List people/IOU entries |
| POST | `/people` | Create entry (direction: `gave`/`took`) |
| GET | `/people/summary` | Net owed / total on each side |
| PUT | `/people/{entry_id}` | Update an entry |
| DELETE | `/people/{entry_id}` | Delete an entry |

---

## Natural-Language & Voice

| Method | Path | Description |
|---|---|---|
| POST | `/parse-nl` | Parse one entry: `"zomato 450 upi"` |
| POST | `/parse-nl/bulk` | Parse multiple lines at once |
| POST | `/parse-nl/voice` | Parse a spoken dictation string |
| GET | `/transcribe/status` | Whisper/transcription availability |
| POST | `/transcribe/model` | Set transcription model |
| POST | `/transcribe/warm` | Warm/load the model |
| POST | `/transcribe/test` | Round-trip test audio |
| POST | `/transcribe` | Transcribe audio → parsed transactions |

---

## Import / Export

| Method | Path | Description |
|---|---|---|
| POST | `/upload-excel/preview` | Upload file, preview auto-detected columns |
| POST | `/upload-excel/start` | Start staged upload (guide) |
| GET | `/upload-progress/{task_id}` | Poll import progress |
| POST | `/upload-excel` | Commit the import |
| GET | `/export/csv` | Download all transactions as CSV |
| GET | `/export/excel` | Download all transactions as XLSX |

---

## Categories — `/api/categories`

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List categories |
| POST | `/categories/add` | Add category |
| POST | `/categories/rename` | Rename a category |
| POST | `/categories/delete` | Delete a category |

---

## Insights, Recurring, Backup, Settings

| Method | Path | Description |
|---|---|---|
| GET | `/insights` | Rule-based coaching insights |
| POST | `/insights/refresh` | Force refresh insights |
| GET | `/recurring` | List recurring templates |
| GET | `/backup` | Export full JSON backup |
| POST | `/restore` | Restore from JSON backup |
| GET | `/settings/gemini-key` | Get Gemini key presence (never the key itself) |
| PUT | `/settings/gemini-key` | Set Gemini key — **validated live** against the Gemini API before persisting; `400`/`502` on failure, so a bad key is rejected rather than silently stored. ⚠️ Validation is a network call at write time; it does *not* guarantee the key still works later, and `configured` is only `True` on success |
| POST | `/settings/gemini-key/test` | Validate the currently configured key against the live API |
| GET | `/settings/system-metrics` | Server/process metrics (psutil; `null` fields if unavailable) |

---

## Config-driven toggles

- Docs (`/docs`, `/redoc`, `/openapi.json`) are **disabled by default**; enable with `ENABLE_DOCS=1`.
- Parsing falls back rule-based → local ML → Gemini as configured; every external layer is optional.