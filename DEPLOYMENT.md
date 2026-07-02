# Deploying Batua (live on the web)

Batua is a **full-stack** app, so "going live" means hosting three things and
wiring them together. GitHub stores the code; it does **not** run the backend.

```
 ┌────────────┐        ┌──────────────┐        ┌────────────────┐
 │  Frontend  │  HTTPS │   Backend    │  driver│  MongoDB Atlas │
 │ (Vercel)   │───────▶│  (Render)    │───────▶│   (free M0)    │
 │ React build│        │ FastAPI      │        │  persistent DB │
 └────────────┘        └──────────────┘        └────────────────┘
```

All three have free tiers. Total cost: **$0**. Rough time: **20–30 min**.

---

## 1. Database — MongoDB Atlas (free)

The backend can fall back to SQLite, but on a free host the disk is wiped on
every restart, so your data would vanish. Use Atlas for real persistence.

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. Create a **free M0** cluster (any provider/region).
3. **Database Access** → *Add New Database User* → username + password (save it).
4. **Network Access** → *Add IP Address* → **Allow access from anywhere**
   (`0.0.0.0/0`) — Render's IPs are dynamic.
5. **Clusters → Connect → Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<user>` and `<password>` with the ones from step 3. Keep this — it's
   your `MONGO_URL`.

---

## 2. Backend — Render (free)

The repo already contains **`render.yaml`**, a Blueprint that configures this.

1. Sign up at <https://render.com> and connect your GitHub account.
2. **New +** → **Blueprint** → pick the `Batua` repo → **Apply**.
   Render reads `render.yaml` and creates the `batua-api` web service.
3. Open the service → **Environment** and set the secret values:
   | Key | Value |
   |-----|-------|
   | `MONGO_URL` | the Atlas string from step 1 |
   | `CORS_ORIGINS` | your frontend URL (fill in after step 3 — e.g. `https://batua.vercel.app`) |
   | `GOOGLE_API_KEY` | *(optional)* Gemini key from <https://aistudio.google.com/app/apikey> |
4. **Manual Deploy → Deploy latest commit**. Wait for "Live".
5. Test it: open `https://<your-service>.onrender.com/api/` — you should see
   ```json
   {"app":"Batua","status":"live","storage":"mongodb", ...}
   ```
   `"storage":"mongodb"` confirms Atlas is connected. Copy this base URL
   (`https://<your-service>.onrender.com`) — it's your `REACT_APP_BACKEND_URL`.

> **Free-tier note:** Render free services sleep after ~15 min idle; the first
> request then takes ~30–60 s to wake. Fine for a demo/portfolio.

---

## 3. Frontend — Vercel (free)

1. Sign up at <https://vercel.com> and connect GitHub.
2. **Add New… → Project** → import the `Batua` repo.
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Create React App (auto-detected)
   - **Build Command:** `yarn build` · **Output Directory:** `build` (defaults are fine)
4. **Environment Variables** → add:
   | Key | Value |
   |-----|-------|
   | `REACT_APP_BACKEND_URL` | your Render URL from step 2 (no trailing slash) |
5. **Deploy**. You get a URL like `https://batua.vercel.app`.

---

## 4. Close the loop (CORS)

Go back to **Render → Environment** and set `CORS_ORIGINS` to your exact Vercel
URL (e.g. `https://batua.vercel.app`), then redeploy the backend. Without this
the browser blocks the frontend's API calls with a CORS error.

Open your Vercel URL — Batua is live. 🎉

---

## Redeploys

Both hosts auto-deploy on every `git push` to `main`:
- Push backend changes → Render rebuilds automatically.
- Push frontend changes → Vercel rebuilds automatically.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Frontend loads but every call fails ("Network Error") | `REACT_APP_BACKEND_URL` wrong, or `CORS_ORIGINS` doesn't exactly match the Vercel URL. |
| `/api/` shows `"storage":"sqlite"` | `MONGO_URL` missing/incorrect — data won't persist. Fix the Atlas string + IP allowlist. |
| First request very slow | Render free tier waking from sleep — normal. |
| Build fails on Render | Check the build log; ensure `PYTHON_VERSION` is 3.11.x (set in `render.yaml`). |
