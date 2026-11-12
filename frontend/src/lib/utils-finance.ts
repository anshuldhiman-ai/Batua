import axios from "axios";

// Normalise a trailing slash so `http://host:8001/` + "/api" never becomes
// `http://host:8001//api` (which Axios/proxies can 404 or double-route).
const baseUrl = String((import.meta as any).env.VITE_BACKEND_URL || "").trim();
const BASE = baseUrl.replace(/\/+$/, "") + "/api";

export const api = axios.create({ 
  baseURL: BASE,
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  }
});

// The server requires the session token on every /api call
// except the auth flow itself (register/login/recovery).
// The token lives in sessionStorage (see Auth.tsx); an
// interceptor attaches it here so every request carries it,
// including ones fired from pages that don't use the
// Auth context. 401s bubble up to the caller — Auth.tsx's
// boot probe handles the "session revoked" case by
// dropping the token.
const TOKEN_KEY = "batua-session-token";
api.interceptors.request.use((config) => {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    /* sessionStorage unavailable (private mode) */
  }
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Backend reachability, broadcast so a global banner can say
// "server not running" instead of every page spinning on its own.
// Only transitions are emitted, so listeners re-render once.
export const BACKEND_STATUS_EVENT = "batua:backend-status";
let backendOnline = true;
const setBackendOnline = (online: boolean) => {
  if (online === backendOnline) return;
  backendOnline = online;
  window.dispatchEvent(new CustomEvent(BACKEND_STATUS_EVENT, { detail: { online } }));
};
export const isBackendOnline = () => backendOnline;

// A dead backend behind a proxy still yields an HTTP response: nginx
// answers 502/503/504, the Vite dev proxy a bodiless 500. FastAPI's own
// errors always carry a JSON body, so those are "server up".
const isGatewayFailure = (res?: { status: number; data?: unknown }) =>
  !!res &&
  ([502, 503, 504].includes(res.status) ||
    (res.status === 500 && (res.data === "" || res.data == null)));

// Response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    setBackendOnline(true);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    // An app-level HTTP error proves the server is up; a gateway failure
    // means the proxy couldn't reach it. Cancelled requests say nothing.
    if (error.response) setBackendOnline(!isGatewayFailure(error.response));

    // Don't retry if it's an auth error or we've already retried
    if (error.response?.status === 401 || originalRequest?._retry) {
      if (!error.response && !axios.isCancel(error)) setBackendOnline(false);
      return Promise.reject(error);
    }
    
    // Retry on network errors or 5xx errors (max 2 retries)
    if (axios.isCancel(error) || !originalRequest) return Promise.reject(error);
    if (!error.response && !originalRequest._retryCount) {
      originalRequest._retry = true;
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      
      if (originalRequest._retryCount <= 2) {
        // Exponential backoff: 1s, 2s
        const delay = Math.pow(2, originalRequest._retryCount - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return api(originalRequest);
      }
    }
    
    return Promise.reject(error);
  }
);

// Build an absolute API URL (used for file downloads / window.open).
export const apiUrl = (path) => `${BASE}${path}`;

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY";

export interface CurrencyConfig {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: "INR", label: "Indian Rupee", symbol: "₹", locale: "en-IN", flag: "🇮🇳" },
  { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB", flag: "🇬🇧" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$", locale: "en-CA", flag: "🇨🇦" },
  { code: "AUD", label: "Australian Dollar", symbol: "AU$", locale: "en-AU", flag: "🇦🇺" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", locale: "ja-JP", flag: "🇯🇵" },
];

const CURRENCY_STORAGE_KEY = "batua-preferred-currency";

export function getActiveCurrency(): CurrencyConfig {
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    const found = SUPPORTED_CURRENCIES.find((c) => c.code === saved);
    if (found) return found;
  } catch {
    // ignore
  }
  return SUPPORTED_CURRENCIES[0];
}

export function setActiveCurrency(code: CurrencyCode): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("batua-currency-change"));
    }
  } catch {
    // ignore
  }
}

export function formatINR(value: any, { compact = false, currency }: { compact?: boolean; currency?: CurrencyCode } = {}) {
  const n = Number(value) || 0;
  const active = currency
    ? (SUPPORTED_CURRENCIES.find((c) => c.code === currency) || getActiveCurrency())
    : getActiveCurrency();

  if (compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat(active.locale, {
      style: "currency",
      currency: active.code,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat(active.locale, {
    style: "currency",
    currency: active.code,
    maximumFractionDigits: active.code === "JPY" ? 0 : (n % 1 === 0 ? 0 : 2),
  }).format(n);
}

export const formatCurrency = formatINR;

export function formatDate(dateStr) {
  if (!dateStr) return "";
  // "YYYY-MM-DD" → "DD/MM/YYYY" — split manually to avoid timezone shifts.
  const m = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Only digits/operators — never handed to Function() unless it matches this.
const PRICE_EXPR_CHARS = /^[0-9+\-*/(). ]*$/;

function parseMathTokens(tokens: string[]): number | null {
  let pos = 0;

  const parsePrimary = (): number => {
    if (pos >= tokens.length) throw new Error("Unexpected end of expression");
    const token = tokens[pos++];
    if (token === "(") {
      const val = parseExpression();
      if (tokens[pos++] !== ")") throw new Error("Mismatched parentheses");
      return val;
    }
    if (token === "-") {
      return -parsePrimary();
    }
    if (token === "+") {
      return parsePrimary();
    }
    const num = Number(token);
    if (Number.isNaN(num)) throw new Error("Invalid number");
    return num;
  };

  const parseFactor = (): number => {
    let val = parsePrimary();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const next = parsePrimary();
      if (op === "*") {
        val *= next;
      } else {
        if (next === 0) throw new Error("Division by zero");
        val /= next;
      }
    }
    return val;
  };

  const parseExpression = (): number => {
    let val = parseFactor();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const next = parseFactor();
      if (op === "+") {
        val += next;
      } else {
        val -= next;
      }
    }
    return val;
  };

  const val = parseExpression();
  if (pos !== tokens.length) return null;
  return Number.isFinite(val) && val > 0 ? val : null;
}

/**
 * Safely evaluate an arithmetic price breakdown like "10+20+25" or "15*2+20".
 * Returns the numeric value, or null when the string isn't a pure arithmetic
 * expression (or doesn't evaluate to a positive number). Mirrors the backend's
 * arithmetic price-cell parsing.
 */
export function evalPriceExpr(raw) {
  // Strip currency markers / thousands separators (mirrors the backend), so
  // "₹15*2+20" or "1,200+80" evaluate the same as "15*2+20" / "1200+80".
  const s = (raw || "").trim().replace(/[₹$,]/g, "");
  if (!s || !PRICE_EXPR_CHARS.test(s)) return null;

  try {
    const tokens = s.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
    if (!tokens) return null;
    return parseMathTokens(tokens);
  } catch {
    return null;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Turn a Price-field input into { isBare, price, mag } given the quantity.
 *
 * - A bare single number is a per-item price → total = price × quantity.
 * - A multi-term expression (e.g. "12+15+48") is the basket total → total is
 *   the sum itself (NO quantity multiplication), with per-item = total ÷ qty.
 * - Returns null while the input is mid-typing or invalid so callers can keep
 *   showing exactly what was typed without touching the total.
 */
export function priceBreakdown(raw, qty = 1) {
  const s = String(raw ?? "").trim();
  const n = qty > 0 ? qty : 1;
  // A single numeric literal (optionally with a ₹ prefix) = per-item price.
  if (/^₹?\s*\d*\.?\d+$/.test(s)) {
    const price = round2(Math.abs(parseFloat(s.replace(/₹/g, "")) || 0));
    return { isBare: true, price, mag: round2(price * n) };
  }
  const val = evalPriceExpr(s);
  if (val === null) return null;
  return { isBare: false, price: round2(val / n), mag: round2(val) };
}

export function formatMonth(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

// Fixed category color map for charts and badges.
export const CATEGORY_COLORS = {
  Income: "#059669",
  "Food & Dining": "#f59e0b",
  "Fast Food": "#ef4444",
  "Food Delivery": "#fb923c",
  Groceries: "#84cc16",
  Transportation: "#06b6d4",
  Fuel: "#0ea5e9",
  Shopping: "#ec4899",
  Utilities: "#6366f1",
  Subscriptions: "#8b5cf6",
  Entertainment: "#f43f5e",
  Health: "#14b8a6",
  Education: "#eab308",
  "Housing/Rent": "#a855f7",
  "Personal Care": "#22d3ee",
  Snacks: "#f97316",
  Investments: "#0d9488",
  Fruits: "#22c55e",
  Refreshments: "#60a5fa",
  Beverages: "#e879f9",
  Other: "#64748b",
};

export function categoryColor(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
}

/** Build inclusive YYYY-MM list from start to end. */
export function monthRange(startYm, endYm) {
  if (!startYm || !endYm) return [];
  const out = [];
  let [y, m] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  const endIdx = ey * 12 + (em - 1);
  let idx = y * 12 + (m - 1);
  while (idx <= endIdx) {
    const yy = Math.floor(idx / 12);
    const mm = (idx % 12) + 1;
    out.push(`${yy}-${String(mm).padStart(2, "0")}`);
    idx += 1;
  }
  return out;
}

export function monthsInYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function addMonths(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

export function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Friendly label: "This month (Jun 2026)", "Next month", etc. */
export function formatMonthLabel(ym, baseYm = currentYearMonth()) {
  if (!ym) return "";
  if (ym === baseYm) return `This month (${formatMonth(ym)})`;
  if (ym === addMonths(baseYm, 1)) return `Next month (${formatMonth(ym)})`;
  if (ym === addMonths(baseYm, -1)) return `Last month (${formatMonth(ym)})`;
  return formatMonth(ym);
}

/** Next N months starting from current month (inclusive). */
export function upcomingMonths(count = 12, fromYm = currentYearMonth()) {
  return Array.from({ length: count }, (_, i) => addMonths(fromYm, i));
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - wd);
  return copy;
}

function sundayOfWeek(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() + (6 - wd));
  return copy;
}

/** Build GitHub-style week columns for `monthCount` months ending at endYm (YYYY-MM). */
export function buildSpendingWeeks(endYm, monthCount, amountByDate) {
  const [ey, em] = endYm.split("-").map(Number);
  const windowStart = new Date(ey, em - monthCount, 1);
  const windowEnd = new Date(ey, em, 0);
  const gridStart = mondayOf(windowStart);
  const gridEnd = sundayOfWeek(windowEnd);
  const startStr = toISO(windowStart);
  const endStr = toISO(windowEnd);

  const weeks = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = toISO(cur);
      const inWindow = dateStr >= startStr && dateStr <= endStr;
      week.push({
        date: dateStr,
        day: cur.getDate(),
        amount: amountByDate.get(dateStr) || 0,
        inWindow,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const monthLabels = weeks.map((week) => {
    for (const cell of week) {
      if (cell.inWindow && cell.day === 1) {
        return formatMonth(cell.date.slice(0, 7));
      }
    }
    return "";
  });

  return {
    weeks,
    monthLabels,
    rangeLabel: `${formatMonth(`${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, "0")}`)} – ${formatMonth(endYm)}`,
  };
}
