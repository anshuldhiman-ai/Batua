import axios from "axios";

// Normalise a trailing slash so `http://host:8001/` + "/api" never becomes
// `http://host:8001//api` (which Axios/proxies can 404 or double-route).
const baseUrl = String((import.meta as any).env.VITE_BACKEND_URL || "").trim();
const BASE = baseUrl.replace(/\/+$/, "") + "/api";

export const api = axios.create({ baseURL: BASE });

// Build an absolute API URL (used for file downloads / window.open).
export const apiUrl = (path) => `${BASE}${path}`;

export function formatINR(value, { compact = false } = {}) {
  const n = Number(value) || 0;
  if (compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

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
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${s});`)();
    return Number.isFinite(val) && val > 0 ? val : null;
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
