/** Heuristic structure for receipt OCR when Gemini is unavailable. */

export type ReceiptItem = {
  name: string;
  amount: number;
  quantity?: number;
};

export type ParsedReceipt = {
  description: string;
  amount: number;
  date: string;
  category: string;
  payment_method: string;
  quantity: number;
  price: number;
  notes: string;
  items: ReceiptItem[];
  rawText: string;
};

const TOTAL_RE =
  /(?:grand\s*)?(?:total|amount\s*due|net\s*amount|balance\s*due|payable|to\s*pay)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;

const MONEY_RE = /(?:rs\.?|inr|₹)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi;
const BARE_MONEY_RE = /(?<![\d./])(\d{1,6}(?:\.\d{1,2})?)(?!\d)/g;

const DATE_RES = [
  /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/,
  /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{2,4})\b/i,
];

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
};

const SKIP_LINE =
  /^(gst|cgst|sgst|igst|vat|tax|sub\s*total|subtotal|discount|change|cash|card|upi|thank|visit|phone|tel|invoice|bill|receipt|qty|item|rate|#)/i;

const JUNK = /^(www\.|http|@|[-=_*]{3,}|\d{6,})$/i;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toNum(raw: string) {
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function pad2(n: string | number) {
  return String(n).padStart(2, "0");
}

function normalizeDate(y: number, m: number, d: number) {
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function extractDate(text: string) {
  const iso = text.match(DATE_RES[0]);
  if (iso) return normalizeDate(+iso[1], +iso[2], +iso[3]);
  const dmy = text.match(DATE_RES[1]);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    const y = +dmy[3];
    // Prefer dd/mm for Indian receipts when both parts are <= 12.
    if (a > 12) return normalizeDate(y, b, a);
    if (b > 12) return normalizeDate(y, a, b);
    return normalizeDate(y, b, a);
  }
  const named = text.match(DATE_RES[2]);
  if (named) {
    const mon = MONTHS[named[2].toLowerCase()] || "01";
    return normalizeDate(+named[3], +mon, +named[1]);
  }
  return "";
}

function extractPayment(text: string) {
  const t = text.toLowerCase();
  if (/\bupi\b|gpay|phonepe|paytm|bhim/.test(t)) return "UPI";
  if (/\bcash\b/.test(t)) return "Cash";
  if (/credit\s*card/.test(t)) return "Credit Card";
  if (/debit\s*card/.test(t)) return "Debit Card";
  if (/\bcard\b|visa|mastercard|rupay/.test(t)) return "Card";
  if (/net\s*banking|neft|imps|rtgs/.test(t)) return "Net Banking";
  return "";
}

function guessCategory(merchant: string, text: string) {
  const t = `${merchant} ${text}`.toLowerCase();
  if (/swiggy|zomato|dominos|pizza|restaurant|cafe|dine/.test(t)) return "Food & Dining";
  if (/grocery|kirana|mart|supermarket|dmart|big bazaar/.test(t)) return "Groceries";
  if (/petrol|fuel|hpcl|bpcl|iocl/.test(t)) return "Fuel";
  if (/pharmacy|medical|apollo|1mg/.test(t)) return "Health";
  if (/uber|ola|metro|irctc/.test(t)) return "Transportation";
  if (/amazon|flipkart|myntra|ajio/.test(t)) return "Shopping";
  return "Other";
}

function extractMerchant(lines: string[]) {
  for (const line of lines.slice(0, 8)) {
    const clean = line.replace(/[^A-Za-z0-9 &.'-]/g, "").trim();
    if (clean.length < 3 || SKIP_LINE.test(clean) || JUNK.test(clean)) continue;
    if (/^\d/.test(clean)) continue;
    return clean.slice(0, 80);
  }
  return "Receipt purchase";
}

function extractTotal(text: string, lines: string[]) {
  const labeled = text.match(TOTAL_RE);
  if (labeled) {
    const n = toNum(labeled[1]);
    if (n > 0) return n;
  }
  const marked: number[] = [];
  let m: RegExpExecArray | null;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text))) {
    const n = toNum(m[1]);
    if (n > 0) marked.push(n);
  }
  if (marked.length) return Math.max(...marked);

  const tail = lines.slice(-8).join(" ");
  const nums: number[] = [];
  BARE_MONEY_RE.lastIndex = 0;
  while ((m = BARE_MONEY_RE.exec(tail))) {
    const n = toNum(m[1]);
    if (n >= 10) nums.push(n);
  }
  return nums.length ? Math.max(...nums) : 0;
}

function extractItems(lines: string[], total: number): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  for (const line of lines) {
    if (SKIP_LINE.test(line) || JUNK.test(line)) continue;
    if (TOTAL_RE.test(line)) continue;
    const money = [...line.matchAll(/(?:rs\.?|inr|₹)?\s*(\d{1,6}(?:\.\d{1,2})?)\s*$/gi)];
    if (!money.length) continue;
    const amount = toNum(money[money.length - 1][1]);
    if (!(amount > 0) || (total > 0 && amount >= total * 0.98)) continue;
    const name = line
      .replace(/(?:rs\.?|inr|₹)\s*\d[\d,.]*\s*$/i, "")
      .replace(/\s+\d+(?:\.\d{1,2})?\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (name.length < 2 || !/[A-Za-z]/.test(name)) continue;
    const qtyMatch = name.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i);
    items.push(
      qtyMatch
        ? { name: qtyMatch[2].trim(), amount, quantity: parseInt(qtyMatch[1], 10) || 1 }
        : { name, amount }
    );
    if (items.length >= 12) break;
  }
  return items;
}

export function parseReceiptText(raw: string): ParsedReceipt {
  const text = String(raw || "").replace(/\r/g, "");
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const description = extractMerchant(lines);
  const amountMag = extractTotal(text, lines);
  const items = extractItems(lines, amountMag);
  const date = extractDate(text) || todayISO();
  const payment_method = extractPayment(text);
  const notes = items.length
    ? items.map((it) => (it.quantity && it.quantity > 1 ? `${it.quantity}× ${it.name} ₹${it.amount}` : `${it.name} ₹${it.amount}`)).join(", ")
    : text.slice(0, 400);
  const quantity = items.length > 1 ? 1 : items[0]?.quantity || 1;
  return {
    description,
    amount: amountMag ? -Math.abs(amountMag) : 0,
    date,
    category: guessCategory(description, text),
    payment_method,
    quantity,
    price: amountMag ? Math.abs(amountMag) / (quantity || 1) : 0,
    notes,
    items,
    rawText: text,
  };
}

export function receiptFromApi(data: Record<string, unknown>, rawText = ""): ParsedReceipt {
  const amountRaw = Number(data.amount ?? 0);
  const amount = amountRaw === 0 ? 0 : -Math.abs(amountRaw);
  const notes = Array.isArray(data.notes)
    ? data.notes.join(", ")
    : String(data.notes || "");
  const items: ReceiptItem[] = Array.isArray(data.items)
    ? (data.items as Record<string, unknown>[])
        .map((it) => ({
          name: String(it.name || it.description || "").trim(),
          amount: Math.abs(Number(it.amount || it.price || 0)),
          quantity: Number(it.quantity || 1) || 1,
        }))
        .filter((it) => it.name && it.amount > 0)
    : [];
  return {
    description: String(data.description || "Receipt purchase"),
    amount,
    date: String(data.date || todayISO()).slice(0, 10),
    category: String(data.category || "Other"),
    payment_method: String(data.payment_method || ""),
    quantity: Number(data.quantity || 1) || 1,
    price: Number(data.price || Math.abs(amount)) || 0,
    notes,
    items,
    rawText,
  };
}
