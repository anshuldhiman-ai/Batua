"""Helper functions for Batua backend."""
import hashlib
import re
from datetime import datetime
from fastapi import HTTPException


def month_key(date_str: str) -> str:
    return (date_str or "")[:7]  # YYYY-MM


def _weekday_of(txn: dict) -> int:
    try:
        return datetime.strptime(txn["date"], "%Y-%m-%d").weekday()
    except Exception:
        return 0


# Typical hour for date-only imports (no time on the transaction).
_CATEGORY_HOUR: dict[str, int] = {
    "Food & Dining": 19,
    "Food Delivery": 20,
    "Snacks": 16,
    "Groceries": 11,
    "Transportation": 8,
    "Fuel": 8,
    "Shopping": 15,
    "Utilities": 10,
    "Subscriptions": 0,
    "Entertainment": 21,
    "Health": 11,
    "Education": 14,
    "Income": 10,
    "Investments": 11,
    "Housing/Rent": 9,
    "Personal Care": 17,
}


def _hour_of(txn: dict) -> int:
    """Hour bucket 0–23. Uses txn time when present, else category typical hour."""
    date_str = (txn.get("date") or "").strip()
    if "T" in date_str or (len(date_str) > 10 and " " in date_str):
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00")).hour % 24
        except Exception:
            pass

    created = txn.get("created_at", "")
    try:
        ca = datetime.fromisoformat(created.replace("Z", "+00:00"))
        td = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
        if ca.date() == td:
            return ca.hour % 24
    except Exception:
        pass

    cat = txn.get("category", "Other")
    if cat in _CATEGORY_HOUR:
        return _CATEGORY_HOUR[cat]

    # Uncategorized imports: stable pseudo-hour from description so the grid isn't one column.
    # Uses md5 (not built-in hash()) because hash() is randomized per process via
    # PYTHONHASHSEED, which would shift the heatmap on every server restart.
    desc = (txn.get("description") or "x").lower()
    digest = int.from_bytes(hashlib.md5(desc.encode("utf-8")).digest()[:8], "big")
    return 8 + (digest % 14)


def _shift_month(ym: str, delta: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    idx = (y * 12 + (m - 1)) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def _pct_change(curr: float, prev: float) -> float:
    if prev == 0:
        return 100.0 if curr else 0.0
    return round((curr - prev) / abs(prev) * 100, 1)


def _valid_date(date_str: str) -> bool:
    if not date_str or len(date_str) != 10:
        return False
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        y = int(date_str[:4])
        return 1900 <= y <= 2100
    except Exception:
        return False


def _require_valid_date(date_str: str):
    if not _valid_date(date_str):
        raise HTTPException(400, "Invalid date — use YYYY-MM-DD (year 1900–2100)")


def _kind(amount: float) -> str:
    """Credit = money in (>=0), Debit = money out (<0)."""
    return "credit" if (amount or 0) >= 0 else "debit"


def _with_kind(txn: dict) -> dict:
    """Ensure a transaction dict carries a txn_type consistent with its amount."""
    txn["txn_type"] = _kind(txn.get("amount", 0))
    return txn


def _default_month(months: list[str]) -> str:
    """Pick the 'current' month for dashboards: the latest month with data that is
    not in the future. Future-dated recurring entries (e.g. a SIP set up for the
    months ahead) must not drag the dashboard into an empty future month."""
    if not months:
        return datetime.now().strftime("%Y-%m")
    today_ym = datetime.now().strftime("%Y-%m")
    past = [m for m in months if m <= today_ym]
    return past[-1] if past else months[0]


def _txn_key(t: dict) -> tuple:
    """Content fingerprint used to de-duplicate imported rows so re-uploading the
    same file is idempotent (no duplicate transactions)."""
    return (
        (t.get("date") or "")[:10],
        (t.get("description") or "").strip().lower(),
        round(float(t.get("amount") or 0), 2),
        (t.get("category") or "").strip().lower(),
        (t.get("payment_method") or "").strip().lower(),
    )


# --- Payment mode -> Online / Cash classification ------------------------- #

_CASH_WORDS = ("cash",)
_ONLINE_WORDS = (
    "online", "upi", "gpay", "google pay", "phonepe", "phone pe", "paytm",
    "card", "credit", "debit", "netbanking", "net banking", "neft", "imps",
    "rtgs", "wallet", "bank", "hdfc", "sbi", "icici", "axis", "bhim", "amazon pay",
)
# Amounts attributed to these were paid by someone else / aren't a tracked spend.
_EXTERNAL_WORDS = (
    "mummy", "mum", "mom", "mother", "papa", "dad", "father", "parents",
    "friend", "bhaiya", "brother", "sister", "didi", "uncle", "aunty",
    "borrow", "lent", "gift", "gifted", "treat", "free",
)


def _payment_bucket(label: str) -> str | None:
    """Map a payment-mode label to 'Online' or 'Cash'. Returns None to exclude
    (paid by someone else, e.g. 'mummy', or an unrecognised part of a split)."""
    low = (label or "").lower()
    if any(w in low for w in _CASH_WORDS):
        return "Cash"
    if any(w in low for w in _EXTERNAL_WORDS):
        return None
    if any(w in low for w in _ONLINE_WORDS):
        return "Online"
    return None


def split_payment(amount: float, mode: str) -> dict:
    """Attribute an expense amount to Online / Cash buckets.

    Handles mixed modes written with their amounts, e.g.
      '₹5 Cash + ₹291 UPI'      -> {Cash: 5, Online: 291}
      '500 Mummy + 1220 Online' -> {Online: 1220}   (the mom-paid 500 is dropped)
      '110 Online + 40 Cash'    -> {Online: 110, Cash: 40}
    A plain mode ('Online' / 'Cash') attributes the whole amount; blank/unknown
    defaults to Online; a whole amount paid by someone else is excluded."""
    out = {"Online": 0.0, "Cash": 0.0}
    amt = abs(float(amount or 0))
    mode = (mode or "").strip()

    chunks = re.split(r"\s*(?:\+|&|,|/|\band\b)\s*", mode)
    explicit = []
    for ch in chunks:
        mnum = re.search(r"\d+(?:\.\d+)?", ch)
        if mnum:
            label = ch[: mnum.start()] + ch[mnum.end():]
            explicit.append((float(mnum.group()), label))

    if explicit:
        for val, label in explicit:
            bucket = _payment_bucket(label)
            if bucket:
                out[bucket] += val
        return out

    bucket = _payment_bucket(mode)
    if bucket is None:
        if mode and any(w in mode.lower() for w in _EXTERNAL_WORDS):
            return out  # whole amount paid by someone else -> exclude
        bucket = "Online"  # blank / generic digital default
    out[bucket] += amt
    return out
