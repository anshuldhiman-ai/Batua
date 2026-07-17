"""Universal statement/expense ingestion.

Designed to understand arbitrary files, not one fixed layout:

  * Excel (.xlsx/.xls) — every sheet — and CSV
  * Header row detected anywhere (not just row 1)
  * Bank statements with separate Debit/Credit (or Withdrawal/Deposit) columns,
    a single signed Amount column, or a Dr/Cr "type" column
  * Column-level date-order inference (day-first vs month-first) + the stacked
    "Expense Table : MM/YYYY" swap-correction
  * AI (Gemini) fallback for column mapping when heuristics are unsure
  * AI batched categorisation for unknown merchants

Public API: ``detect_columns(content, filename)`` and
``try_load_excel(content, filename, use_ai)`` — both return / use
Transaction-shaped dicts (negative amount = expense, positive = income).
"""
import io
import re
import ast
import json
import uuid
import calendar
from datetime import datetime, timezone

import pandas as pd
from dateutil import parser as dateparser

from parser import _detect_category  # reuse category keyword inference
import ai

# --------------------------------------------------------------------------- #
# Column aliases
# --------------------------------------------------------------------------- #

COLUMN_ALIASES = {
    "date": [
        "date", "txn date", "transaction date", "trans date", "value date",
        "posting date", "dated", "day", "dt", "entry date", "tran date", "date of purchase",
    ],
    "description": [
        "description", "narration", "merchant", "particulars", "details",
        "name of item", "item", "remarks", "name", "transaction details", "memo",
        "reference", "payee", "to/from",
    ],
    # 'type' is matched BEFORE debit/credit so a "Dr/Cr" indicator column is not
    # mistaken for a debit amount column.
    "type": [
        "dr/cr", "cr/dr", "drcr", "transaction type", "txn type",
        "indicator", "debit/credit", "type",
    ],
    "amount": [
        "amount", "amount (inr)", "amount(inr)", "total", "total amount", "price",
        "value", "txn amount", "transaction amount", "amt",
    ],
    "debit": [
        "debit", "withdrawal", "withdrawals", "dr", "paid out", "money out",
        "withdrawal amt", "debit amount", "expense", "spent",
    ],
    "credit": [
        "credit", "deposit", "deposits", "cr", "paid in", "money in",
        "deposit amt", "credit amount", "income", "received",
    ],
    "balance": ["balance", "closing balance", "running balance", "bal", "available balance"],
    "category": ["category", "tag", "head", "group"],
    "payment_method": [
        "payment method", "mode", "mode of payment", "account", "bank",
        "payment mode", "method", "card", "wallet",
    ],
    "quantity": [
        "quantity", "qty", "no of items", "items count", "units", "quantity count", "no. of items", "quantity (qty)", "qty/units"
    ],
    # Per-item price. Listed AFTER amount so a "Total Amount" column is claimed
    # as the amount first and a standalone "Price" column lands here.
    "unit_price": [
        "unit price", "price per item", "price per unit", "price each",
        "unit cost", "rate", "price",
    ],
}

_NOISE_DESCRIPTIONS = {
    "", "total", "subtotal", "grand total", "opening balance", "closing balance",
    "balance c/f", "balance b/f", "b/f", "c/f", "nan", "none",
}


# --------------------------------------------------------------------------- #
# Small utilities
# --------------------------------------------------------------------------- #


def _norm(s) -> str:
    cleaned = re.sub(r"[^a-z0-9/ ]", "", str(s).lower())
    return re.sub(r"\s+", " ", cleaned).strip()



def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_number(s) -> bool:
    return bool(re.fullmatch(r"-?\s*[₹$]?\s*\d[\d,]*(?:\.\d+)?", str(s).strip()))


def _clean_amount(raw) -> float | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw)
    s = str(raw)
    neg = "(" in s and ")" in s
    s = s.replace("₹", "").replace("$", "").replace(",", "").replace("(", "").replace(")", "").strip()
    if not s or s.lower() in ("nan", "none", "-", "nil"):
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    val = float(m.group(0))
    return -val if (neg and val > 0) else val


def _eval_price_expr(raw) -> float | None:
    """Safely evaluate an arithmetic price breakdown like ``₹15*2+₹20``.

    Only +, -, *, / and parentheses over plain numbers are allowed — anything
    else (names, calls, attributes) is rejected. Returns None when the cell
    isn't a pure arithmetic expression.
    """
    s = str(raw).replace("₹", "").replace("$", "").replace(",", "").strip()
    if not s or not re.fullmatch(r"[\d+\-*/(). ]+", s):
        return None

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
            a, b = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
            if isinstance(node.op, ast.Mult):
                return a * b
            return a / b
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -ev(node.operand)
        raise ValueError("unsupported expression")

    try:
        return float(ev(ast.parse(s, mode="eval")))
    except (ValueError, SyntaxError, ZeroDivisionError, RecursionError):
        return None


def _price_expr_text(raw) -> str:
    """The price cell's verbatim arithmetic breakdown (e.g. ``120+240``), or ``""``.

    Only expression cells are kept — a plain number carries no extra
    information over the parsed price, but a breakdown like ``15*2+20`` is
    what the user actually wrote in the sheet and is shown as-is in the app.
    """
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    s = str(raw).strip()
    if not s or s.lower() in ("nan", "none"):
        return ""
    if _is_number(s):
        return ""
    # Must actually evaluate as arithmetic to be worth keeping.
    return s if _eval_price_expr(s) is not None else ""


def _price_from_cell(raw, total: float | None, qty: int) -> float | None:
    """Exact price from a sheet's Price cell — never an average.

    A clean single number is used as-is. An arithmetic breakdown such as
    ``₹15*2+₹20`` is evaluated and accepted when it reconciles with the row's
    total — either as the total itself or as a per-item price × quantity — so
    the app shows the file's real figure. Anything that can't be reconciled
    returns None and the caller falls back to total ÷ quantity.
    """
    if raw is None:
        return None
    if _is_number(raw):
        parsed = _clean_amount(raw)
        return round(parsed, 2) if parsed and parsed > 0 else None
    val = _eval_price_expr(raw)
    if val is None or val <= 0:
        return None
    if total is not None:
        t = abs(total)
        q = qty if qty and qty > 0 else 1
        # Accept the evaluated expression when it reconciles with the row:
        # either it's a per-item price (× quantity == total) or it's the exact
        # basket breakdown ("₹15*2+₹20" == total). Otherwise reject.
        if abs(val * q - t) < 0.01 or abs(val - t) < 0.01:
            return round(val, 2)
    return None


# --------------------------------------------------------------------------- #
# Date parsing
# --------------------------------------------------------------------------- #

_DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %m %Y",
    "%d/%m/%y", "%d-%m-%y", "%d.%m.%y",
    "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%b-%y", "%d %b %y",
    "%Y-%m-%d", "%Y/%m/%d",
    "%d/%m", "%d-%m", "%d %b", "%d %B",
]
_DATE_FORMATS_MONTHFIRST = [
    "%m/%d/%Y", "%m-%d-%Y", "%m.%d.%Y", "%m/%d/%y", "%m-%d-%y",
    "%b %d %Y", "%B %d %Y", "%b %d, %Y", "%B %d, %Y",
    "%Y-%m-%d", "%m/%d",
]


def _to_date(raw, default: datetime, dayfirst: bool = True) -> datetime | None:
    """Parse one cell into a datetime. ``dayfirst`` controls ambiguous strings."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    if isinstance(raw, (datetime, pd.Timestamp)):
        ts = pd.Timestamp(raw)
        return None if pd.isna(ts) else ts.to_pydatetime()
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        try:
            return (pd.Timestamp("1899-12-30") + pd.to_timedelta(float(raw), "D")).to_pydatetime()
        except Exception:
            return None

    s = str(raw).strip()
    if not s or s.lower() in ("nan", "none", "nat", "-"):
        return None
    if re.fullmatch(r"\d{5,6}(?:\.\d+)?", s):  # excel serial as text
        try:
            return (pd.Timestamp("1899-12-30") + pd.to_timedelta(float(s), "D")).to_pydatetime()
        except Exception:
            pass

    formats = _DATE_FORMATS if dayfirst else _DATE_FORMATS_MONTHFIRST
    for fmt in formats:
        try:
            d = datetime.strptime(s, fmt)
            if "y" not in fmt.lower():
                d = d.replace(year=default.year)
            return d
        except ValueError:
            continue
    try:
        return dateparser.parse(s, dayfirst=dayfirst)
    except Exception:
        return None


def _infer_date_order(values) -> bool:
    """Inspect a whole column of date strings and decide day-first vs month-first.

    Returns True for day-first. Uses the strongest evidence available: if any
    value's first component is > 12 it must be the day (day-first); if any
    second component is > 12 the first must be the month (month-first). Defaults
    to day-first (Indian convention).
    """
    for v in values:
        if not isinstance(v, str):
            continue
        m = re.match(r"\s*(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{2,4}", v)
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        if a > 12:
            return True
        if b > 12:
            return False
    return True


# --------------------------------------------------------------------------- #
# Reading sheets (Excel / CSV)
# --------------------------------------------------------------------------- #


def _filetype(content: bytes, filename: str) -> str:
    n = (filename or "").lower()
    if content[:2] == b"PK":
        return "xlsx"
    if content[:4] == b"\xD0\xCF\x11\xE0":
        return "xls"
    if n.endswith(".csv") or n.endswith(".txt"):
        return "csv"
    try:
        content[:4000].decode("utf-8")
        return "csv"
    except Exception:
        return "xlsx"


def _read_sheets(content: bytes, filename: str) -> list[tuple[str, pd.DataFrame]]:
    """Return [(sheet_name, raw_df_with_no_header), ...]."""
    ftype = _filetype(content, filename)
    if ftype == "csv":
        for sep in (",", ";", "\t", "|"):
            try:
                df = pd.read_csv(io.BytesIO(content), header=None, dtype=object, sep=sep, engine="python")
                if df.shape[1] >= 2:
                    return [("csv", df)]
            except Exception:
                continue
        return [("csv", pd.read_csv(io.BytesIO(content), header=None, dtype=object))]
    xls = pd.ExcelFile(io.BytesIO(content))
    return [(name, xls.parse(name, header=None, dtype=object)) for name in xls.sheet_names]


# --------------------------------------------------------------------------- #
# Header / column detection
# --------------------------------------------------------------------------- #

_FLAT_ALIASES = {a for v in COLUMN_ALIASES.values() for a in v}


def _header_score(cells: list) -> int:
    nonnull = [c for c in cells if c is not None and not (isinstance(c, float) and pd.isna(c)) and str(c).strip()]
    if len(nonnull) < 2:
        return -1
    score = 0
    for c in nonnull:
        if isinstance(c, (datetime, pd.Timestamp)):
            score -= 2
            continue
        n = _norm(c)
        if _is_number(c):
            score -= 1
        elif any(a == n or a in n or n in a for a in _FLAT_ALIASES):
            score += 4
        elif isinstance(c, str) and len(n) <= 24:
            score += 1
    return score


def _find_header_row(df: pd.DataFrame, max_scan: int = 20) -> int:
    best_i, best_score = 0, -10
    for i in range(min(max_scan, len(df))):
        s = _header_score(df.iloc[i].tolist())
        if s > best_score:
            best_i, best_score = i, s
    return best_i


def _alias_hit(alias: str, ncol: str) -> bool:
    # Short, ambiguous aliases (dr, cr, dt, amt) must match exactly so they don't
    # latch onto longer column names like "dr/cr".
    if len(alias) <= 2:
        return ncol == alias
    return ncol == alias or alias in ncol


def _match_columns(columns: list[str]) -> dict:
    """Heuristically map canonical fields to real column names."""
    mapping: dict[str, str] = {}
    norm_cols = {col: _norm(col) for col in columns}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            for col, ncol in norm_cols.items():
                if col in mapping.values():
                    continue
                if _alias_hit(alias, ncol):
                    mapping[field] = col
                    break
            if field in mapping:
                break
    return mapping


def _ai_map_columns(columns: list[str], sample: list[dict]) -> dict | None:
    if not ai.is_enabled():
        return None
    system = (
        "You map columns of a bank statement or expense sheet to a fixed schema. "
        "Schema keys: date, description, amount, debit, credit, type, "
        "category, payment_method, balance, quantity. Rules: use EXACT column names from the "
        "provided list as values, or null if absent. Use 'amount' for a single "
        "signed/value column; use 'debit' and 'credit' when money-out and money-in "
        "are SEPARATE columns. 'type' is a column holding Dr/Cr or debit/credit "
        "indicators; 'quantity' is a column holding item counts or quantity of purchase. "
        "Return JSON: {\"mapping\": { ... }}."
    )
    payload = json.dumps({"columns": columns, "sample_rows": sample[:6]}, default=str)
    data = ai.chat_json(system, payload)
    if not data:
        return None
    mp = data.get("mapping", data)
    if not isinstance(mp, dict):
        return None
    # Keep only keys that point to real columns.
    return {k: v for k, v in mp.items() if v in columns}


# --------------------------------------------------------------------------- #
# Row -> amount (handles signed amount / debit-credit / type column)
# --------------------------------------------------------------------------- #


def _row_amount(row: dict, mp: dict) -> float | None:
    has_dc = mp.get("debit") or mp.get("credit")
    if has_dc:
        deb = _clean_amount(row.get(mp.get("debit"))) if mp.get("debit") else None
        cre = _clean_amount(row.get(mp.get("credit"))) if mp.get("credit") else None
        if deb is None and cre is None:
            return None
        return (cre or 0.0) - abs(deb or 0.0)

    amt_col = mp.get("amount")
    if not amt_col:
        return None
    raw = row.get(amt_col)
    amt = _clean_amount(raw)
    if amt is None:
        return None

    # Sign from a Dr/Cr suffix in the amount cell itself.
    raw_s = str(raw).lower()
    if re.search(r"\bdr\b", raw_s):
        amt = -abs(amt)
    elif re.search(r"\bcr\b", raw_s):
        amt = abs(amt)

    # Sign from an explicit type column.
    if mp.get("type"):
        t = str(row.get(mp["type"], "")).strip().lower()
        if t in ("dr", "debit", "d", "withdrawal", "w", "expense", "-"):
            amt = -abs(amt)
        elif t in ("cr", "credit", "c", "deposit", "income", "+"):
            amt = abs(amt)
    return amt


# --------------------------------------------------------------------------- #
# Stacked "Expense Table : MM/YYYY" format
# --------------------------------------------------------------------------- #


def _find_col(cells: list[str], names: list[str]) -> int | None:
    norm = [_norm(c) for c in cells]
    for name in names:
        for i, n in enumerate(norm):
            if n == name:
                return i
    for name in names:
        for i, n in enumerate(norm):
            if name in n:
                return i
    return None


def _df_is_stacked(df: pd.DataFrame) -> bool:
    head = df.head(20).fillna("").astype(str)
    for val in head.values.flatten():
        if "expense table" in val.lower():
            return True
    return False


def _block_real(raw_dates: list, header_month: int, header_year: int) -> tuple[int, int]:
    """Infer a block's true (month, year) from its UNAMBIGUOUS cell dates (day > 12).

    A day > 12 can't have been mm/dd-swapped, so such a cell's month and year are
    trustworthy. We take the majority across those anchors. This survives a wrong
    or duplicated block header (e.g. a 2nd ``05/2026`` that is really June) AND a
    stray wrong year inside an otherwise-correct block. Falls back to the header.
    """
    default = datetime(header_year or datetime.now().year, header_month or 1, 1)
    mvotes: dict[int, int] = {}
    yvotes: dict[int, int] = {}
    for raw in raw_dates:
        dt = _to_date(raw, default)
        if dt is not None and dt.day > 12:
            mvotes[dt.month] = mvotes.get(dt.month, 0) + 1
            yvotes[dt.year] = yvotes.get(dt.year, 0) + 1
    month = max(mvotes, key=mvotes.get) if mvotes else (header_month or default.month)
    year = max(yvotes, key=yvotes.get) if yvotes else (header_year or default.year)
    return month, year


def _resolve_swapped_date(raw, real_month: int, real_year: int, default: datetime) -> str:
    """Resolve one date cell to its block's real month/year, undoing any mm/dd swap.

    Every row is pinned to the block's month + year (a block IS one month of one
    year). We only need to recover the DAY:

      * cell.month == real_month -> not swapped; day is the cell's day
      * cell.day   == real_month -> swapped by Excel; real day = cell's month
      * otherwise                -> outlier; keep the cell's day, pin to the block
    The cell's own month/year are never trusted, so a stray wrong year can't leak.
    """
    dt = _to_date(raw, default)
    if dt is None:
        return f"{real_year:04d}-{real_month:02d}-01"

    if dt.month == real_month:
        day = dt.day
    elif dt.day == real_month:
        day = dt.month
    else:
        day = dt.day

    last_day = calendar.monthrange(real_year, real_month)[1]
    day = min(max(day, 1), last_day)
    return f"{real_year:04d}-{real_month:02d}-{day:02d}"


def _parse_stacked(df: pd.DataFrame) -> list[dict]:
    blocks: list[dict] = []
    current: dict | None = None

    for _, row in df.iterrows():
        raw_cells = row.tolist()
        cells = [("" if pd.isna(c) else str(c).strip()) for c in raw_cells]
        joined = " ".join(cells).lower()
        if not joined.strip():
            continue

        m = re.search(r"expense table\s*:?\s*(\d{1,2})[/-](\d{2,4})", joined)
        if m:
            yr = int(m.group(2))
            current = {
                "hmonth": int(m.group(1)),
                "hyear": yr + 2000 if yr < 100 else yr,
                "cols": None,
                "items": [],
            }
            blocks.append(current)
            continue

        if joined.startswith("total") or "year-" in joined or re.match(r"year\s*-?\s*\d", joined):
            continue

        if "name of item" in joined or ("sno" in joined and "price" in joined):
            cols = {
                "item": _find_col(cells, ["name of item", "item", "description", "particulars"]),
                "price": _find_col(cells, ["total amount", "price", "amount"]),
                "date": _find_col(cells, ["date of purchase", "date"]),
                "mode": _find_col(cells, ["mode of payment", "mode", "payment", "bank"]),
                "quantity": _find_col(cells, ["quantity", "qty", "no of items", "units", "items count"]),
                # Separate per-item price column ("Price" next to "Total Amount").
                "unit_price": _find_col(cells, ["price per item", "unit price", "price"]),
            }
            if cols["unit_price"] == cols["price"]:
                cols["unit_price"] = None
            if current is not None:
                current["cols"] = cols
            continue

        if current is None or current["cols"] is None:
            continue
        c = current["cols"]
        item = cells[c["item"]] if c["item"] is not None else ""
        if not item or item.lower() in _NOISE_DESCRIPTIONS:
            continue
        raw_amt = cells[c["price"]] if c["price"] is not None else None
        # A breakdown like "120+240" in the amount cell must be summed, not
        # truncated at the first number (which _clean_amount would do).
        amount = None
        if raw_amt is not None and not _is_number(raw_amt):
            amount = _eval_price_expr(raw_amt)
        if amount is None:
            amount = _clean_amount(raw_amt) if raw_amt is not None else None
        if amount is None:
            continue
        di = c["date"]
        raw_date = raw_cells[di] if di is not None and di < len(raw_cells) else None
        mode = ""
        if c["mode"] is not None and cells[c["mode"]]:
            mode = cells[c["mode"]]
            if mode.lower() in ("nan", "none"):
                mode = ""
        
        qty = 1
        if c["quantity"] is not None and c["quantity"] < len(raw_cells):
            try:
                raw_qty = raw_cells[c["quantity"]]
                if raw_qty is not None and not (isinstance(raw_qty, float) and pd.isna(raw_qty)):
                    s_qty = str(raw_qty).strip()
                    m = re.search(r"\d+", s_qty)
                    if m:
                        qty_val = int(m.group(0))
                        if qty_val > 0:
                            qty = qty_val
            except Exception:
                pass

        # Per-item price: taken exactly from the sheet's Price cell — a clean
        # number is used as-is and an arithmetic breakdown like "₹15*2+₹20" is
        # evaluated; only an irreconcilable cell falls back to total ÷ quantity.
        # The breakdown's verbatim text (e.g. "120+240") is kept alongside so
        # the app can show exactly what the file says.
        unit_price = None
        price_text = ""
        up = c.get("unit_price")
        if up is not None and up < len(cells):
            unit_price = _price_from_cell(cells[up], amount, qty)
            price_text = _price_expr_text(cells[up])
        if not price_text and c["price"] is not None and c["price"] < len(cells):
            price_text = _price_expr_text(cells[c["price"]])

        current["items"].append({
            "item": item,
            "amount": amount,
            "raw_date": raw_date,
            "mode": mode,
            "quantity": qty,
            "price": unit_price,
            "price_text": price_text,
        })

    out: list[dict] = []
    for b in blocks:
        real_month, real_year = _block_real(
            [it["raw_date"] for it in b["items"]], b["hmonth"], b["hyear"]
        )
        default = datetime(real_year, real_month, 1)
        for it in b["items"]:
            date_str = _resolve_swapped_date(it["raw_date"], real_month, real_year, default)
            amt = -abs(it["amount"])  # stacked entries are expenses
            out.append(_make_txn(date_str, it["item"], amt, _detect_category(it["item"]), it["mode"], it.get("quantity", 1), it.get("price"), it.get("price_text", "")))
    return out


# --------------------------------------------------------------------------- #
# Generic tabular format (bank statements, exports, CSVs)
# --------------------------------------------------------------------------- #


def _prepare_table(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    hi = _find_header_row(df)
    header = df.iloc[hi].tolist()
    cols, seen = [], {}
    for j, h in enumerate(header):
        name = "" if h is None or (isinstance(h, float) and pd.isna(h)) else str(h).strip()
        if not name:
            name = f"col{j}"
        if name in seen:
            seen[name] += 1
            name = f"{name}.{seen[name]}"
        else:
            seen[name] = 0
        cols.append(name)
    body = df.iloc[hi + 1:].reset_index(drop=True)
    body.columns = cols
    return body, cols


def _resolve_mapping(cols: list[str], sample: list[dict], use_ai: bool) -> dict:
    mp = _match_columns(cols)
    has_amount = mp.get("amount") or mp.get("debit") or mp.get("credit")
    # AI fallback when we couldn't find a date or any amount-bearing column.
    if use_ai and (not mp.get("date") or not has_amount):
        ai_map = _ai_map_columns(cols, sample)
        if ai_map:
            for k, v in ai_map.items():
                mp.setdefault(k, v)
    return mp


def _parse_tabular(df: pd.DataFrame, use_ai: bool) -> list[dict]:
    body, cols = _prepare_table(df)
    if body.empty:
        return []
    sample = body.head(6).fillna("").astype(str).to_dict(orient="records")
    mp = _resolve_mapping(cols, sample, use_ai)

    date_col = mp.get("date")
    dayfirst = True
    if date_col and date_col in body.columns:
        dayfirst = _infer_date_order(body[date_col].dropna().astype(str).tolist())
    default_dt = datetime.now()

    out: list[dict] = []
    for _, row in body.iterrows():
        rowd = row.to_dict()
        desc = ""
        if mp.get("description"):
            desc = str(rowd.get(mp["description"], "")).strip()
        if desc.lower() in _NOISE_DESCRIPTIONS and not mp.get("amount"):
            continue

        amount = _row_amount(rowd, mp)
        if amount is None:
            continue
        if not desc or desc.lower() in ("nan", "none"):
            desc = "Transaction"

        if date_col:
            dt = _to_date(rowd.get(date_col), default_dt, dayfirst=dayfirst)
            date_str = (dt or default_dt).strftime("%Y-%m-%d")
        else:
            date_str = default_dt.strftime("%Y-%m-%d")

        category = ""
        if mp.get("category"):
            category = str(rowd.get(mp["category"], "")).strip()
        if not category or category.lower() in ("nan", "none"):
            category = _detect_category(desc)

        pm = ""
        if mp.get("payment_method"):
            pm = str(rowd.get(mp["payment_method"], "")).strip()
            if pm.lower() in ("nan", "none"):
                pm = ""

        qty = 1
        if mp.get("quantity"):
            try:
                raw_qty = rowd.get(mp["quantity"])
                if raw_qty is not None and not (isinstance(raw_qty, float) and pd.isna(raw_qty)):
                    s_qty = str(raw_qty).strip()
                    m = re.search(r"\d+", s_qty)
                    if m:
                        qty_val = int(m.group(0))
                        if qty_val > 0:
                            qty = qty_val
            except Exception:
                pass

        unit_price = None
        price_text = ""
        if mp.get("unit_price") and mp["unit_price"] != mp.get("amount"):
            unit_price = _price_from_cell(rowd.get(mp["unit_price"]), amount, qty)
            price_text = _price_expr_text(rowd.get(mp["unit_price"]))

        out.append(_make_txn(date_str, desc.title(), amount, category, pm, qty, unit_price, price_text))
    return out


def _make_txn(date_str: str, desc: str, amount: float, category: str, pm: str, qty: int = 1, price: float | None = None, price_text: str = "") -> dict:
    q = qty if qty and qty > 0 else 1
    unit = round(price, 2) if price and price > 0 else round(abs(amount) / q, 2)
    return {
        "id": str(uuid.uuid4()),
        "date": date_str,
        "description": desc,
        "amount": amount,
        "category": category or "Other",
        "payment_method": pm,
        "quantity": q,
        "price": unit,
        "price_text": price_text or "",
        "txn_type": "credit" if amount >= 0 else "debit",
        "notes": "",
        "created_at": _now_iso(),
    }


# --------------------------------------------------------------------------- #
# AI categorisation for unknown merchants (one batched call)
# --------------------------------------------------------------------------- #

_VALID_CATEGORIES = [
    "Income", "Food & Dining", "Food Delivery", "Groceries", "Transportation",
    "Fuel", "Shopping", "Utilities", "Subscriptions", "Entertainment", "Health",
    "Education", "Investments", "Housing/Rent", "Personal Care", "Snacks", "Other",
]


def _ai_categorize(rows: list[dict], progress_cb=None, use_ai: bool = False) -> None:
    """Categorize unknown merchants using local ML (batched) then optional AI.

    ``progress_cb(fraction)`` — if given — is called with a 0..1 value as
    categorization proceeds so callers can drive a progress bar.

    ``use_ai`` — if False, only uses local ML (much faster). If True, falls back
    to AI for remaining uncategorized items.
    """
    # ── Local ML in ONE batched, de-duplicated pass ─────────────────────
    # Only rows still marked "Other" need the model; unique descriptions are
    # classified once and the result fanned back out to every matching row.
    try:
        import ml_nlp
        todo = [r for r in rows if r.get("category", "Other") == "Other"
                and r.get("description") and r["description"] != "Transaction"]
        if todo:
            mapping = ml_nlp.classify_many([r["description"] for r in todo])
            for r in todo:
                cat = mapping.get(r["description"])
                if cat and cat != "Other":
                    r["category"] = cat
    except Exception:
        pass  # Continue if ML fails
    if progress_cb:
        progress_cb(0.6 if use_ai else 1.0)

    if not use_ai:
        return

    # ── Optional AI pass for whatever ML left as "Other" ────────────────
    if not ai.is_enabled():
        if progress_cb:
            progress_cb(1.0)
        return
    _ai_categorize_remaining(rows, progress_cb=progress_cb)


def _ai_categorize_remaining(rows: list[dict], progress_cb=None) -> None:
    """AI fallback for rows local ML couldn't confidently place."""
    chunk_size = 100
    total = len(rows) or 1
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        _categorize_chunk_ai(chunk)
        if progress_cb:
            # AI pass occupies the back 40% of the categorizing band.
            progress_cb(min(1.0, 0.6 + 0.4 * (i + chunk_size) / total))


def _categorize_chunk_ai(rows: list[dict]) -> None:
    """AI-categorize the still-uncategorized rows in one chunk."""
    unknown = sorted({r["description"] for r in rows if r.get("category", "Other") == "Other"})
    unknown = [u for u in unknown if u and u != "Transaction"][:10]  # Reduced per chunk for speed
    if not unknown:
        return

    if not ai.is_enabled():
        return
    system = (
        "You categorise Indian expense descriptions. Allowed categories ONLY: "
        + ", ".join(_VALID_CATEGORIES)
        + ". Return JSON {\"map\": {\"<description>\": \"<category>\"}} for EVERY input. "
        "If unsure use \"Other\"."
    )
    data = ai.chat_json(system, json.dumps({"descriptions": unknown}))
    if not data:
        return
    mapping = data.get("map", data)
    if not isinstance(mapping, dict):
        return
    valid = {c.lower(): c for c in _VALID_CATEGORIES}
    resolved = {k: valid.get(str(v).strip().lower()) for k, v in mapping.items()}
    for r in rows:
        if r.get("category", "Other") == "Other":
            c = resolved.get(r["description"])
            if c:
                r["category"] = c


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #


def try_load_excel(content: bytes, filename: str = "", use_ai: bool = False,
                   progress_cb=None) -> list[dict]:
    """Parse any supported file into Transaction-shaped dicts.

    ``progress_cb(stage, fraction)`` — if given — is invoked as the parse
    moves through "reading" then "categorizing" so the UI can show smooth,
    non-frozen progress. ``fraction`` is 0..1 within that stage.
    
    ``use_ai`` — if False, only uses local ML for categorization (much faster).
    If True, falls back to AI for uncategorized items.
    """
    rows: list[dict] = []
    sheet_count = 0
    # Read the workbook ONCE (parsing it twice just to count sheets doubled the
    # slowest part of the import for multi-sheet .xlsx files).
    sheets = _read_sheets(content, filename)
    max_sheets = min(len(sheets), 5)  # Limit to first 5 sheets

    for sheet_name, df in sheets:
        if df is None or df.empty:
            continue
        sheet_count += 1
        # Limit to first 5 sheets to avoid processing too many
        if sheet_count > 5:
            break
        if _df_is_stacked(df):
            rows.extend(_parse_stacked(df))
        else:
            rows.extend(_parse_tabular(df, use_ai))
        if progress_cb:
            progress_cb("reading", min(1.0, sheet_count / max_sheets))

    if progress_cb:
        progress_cb("categorizing", 0.0)

    # Use local ML by default (much faster). Only use AI if explicitly requested.
    _ai_categorize(
        rows,
        progress_cb=(lambda f: progress_cb("categorizing", f)) if progress_cb else None,
        use_ai=use_ai,
    )

    return rows


def detect_columns(content: bytes, filename: str = "") -> dict:
    """Preview: detected format, header, column mapping and a few sample rows."""
    sheets = _read_sheets(content, filename)
    name, df = sheets[0]
    if _df_is_stacked(df):
        rows = _parse_stacked(df)
        cols = ["date", "description", "amount", "category", "payment_method"]
        return {"format": "stacked", "sheet": name, "columns": cols,
                "mapping": {c: c for c in cols}, "sample": rows[:5]}

    body, cols = _prepare_table(df)
    sample = body.head(5).fillna("").astype(str).to_dict(orient="records")
    mp = _resolve_mapping(cols, sample, use_ai=True)
    return {"format": "tabular", "sheet": name, "columns": cols,
            "mapping": mp, "sample": sample, "sheets": [s for s, _ in sheets]}
