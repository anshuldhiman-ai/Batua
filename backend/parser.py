"""Natural-language transaction parser.

Pipeline: regex first, local ML fallback, Gemini fallback only if category resolves to "Other".
Tokens are removed from the working string as each field is extracted so the
leftover becomes a clean description.
"""
import re
import calendar
from datetime import datetime, timedelta


import ai
import ml_nlp

# --------------------------------------------------------------------------- #
# Keyword dictionaries
# --------------------------------------------------------------------------- #

# Payment method -> list of detection keywords (matched as whole words).
PAYMENT_METHODS = {
    "UPI": ["upi", "gpay", "google pay", "phonepe", "phone pe", "paytm", "bhim"],
    "Credit Card": ["credit card", "creditcard", "cc"],
    "Debit Card": ["debit card", "debitcard", "card"],
    "HDFC": ["hdfc"],
    "SBI": ["sbi"],
    "ICICI": ["icici"],
    "Axis": ["axis"],
    "Cash": ["cash"],
    "Wallet": ["wallet", "amazon pay", "mobikwik", "freecharge"],
    "Net Banking": ["net banking", "netbanking", "neft", "imps", "rtgs"],
}

INCOME_WORDS = [
    "salary", "income", "refund", "cashback", "credited", "credit",
    "bonus", "interest", "dividend", "received", "stipend", "freelance",
    "reimbursement", "payout", "deposit",
    "pocketmoney", "pocket money", "allowance", "gift", "gifted",
    "prize", "won", "sold", "returns", "rebate", "scholarship",
]

# Category -> keywords. Order matters: the first category with a hit wins, so
# more specific categories come before broad ones.
CATEGORIES: dict[str, list[str]] = {
    "Income": INCOME_WORDS,
    "Snacks": [
        "lays", "chips", "samosa", "golgappa", "golgappe", "panipuri",
        "pani puri", "kurkure", "namkeen", "biscuit", "cookie", "chocolate",
        "dairy milk", "kitkat", "kit kat", "maggi", "chai", "tea", "coffee",
        "juice", "icecream", "ice cream", "pastry", "snack", "snacks",
        "pakora", "vada pav", "bhel", "popcorn",
    ],
    "Food Delivery": ["swiggy", "zomato", "foodpanda", "ubereats", "uber eats", "eatsure", "dunzo"],
    "Food & Dining": [
        "restaurant", "dine", "dining", "cafe", "dosa",
        "paneer", "biryani", "pizza", "burger", "kfc", "mcdonald", "mcd",
        "dominos", "dominoes", "thali", "lunch", "dinner", "breakfast",
        "meal", "buffet", "starbucks", "barbeque", "haldiram",
    ],
    "Groceries": [
        "bigbasket", "big basket", "blinkit", "zepto", "grofers", "dmart",
        "d mart", "grocery", "groceries", "vegetables", "fruits", "milk",
        "supermarket", "kirana", "jiomart", "jio mart", "reliance fresh",
    ],
    "Fuel": [
        "petrol", "diesel", "fuel", "hp petrol", "bharat petroleum",
        "indian oil", "iocl", "shell", "pump", "filling station",
    ],
    "Transportation": [
        "ola", "uber", "auto", "rickshaw", "metro", "bus", "train", "irctc",
        "cab", "taxi", "rapido", "redbus", "flight", "indigo", "vistara",
        "spicejet", "toll", "parking",
    ],
    "Shopping": [
        "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "croma",
        "reliance digital", "shopping", "headphones", "clothes", "shoes",
        "electronics", "mall", "tshirt", "t-shirt", "jeans", "watch",
    ],
    "Utilities": [
        "electricity", "water bill", "gas bill", "broadband", "wifi",
        "internet", "recharge", "airtel", "jio", "vodafone", "vi", "bsnl",
        "dth", "bill payment", "postpaid", "prepaid", "license", "licence",
        "driving license", "rto", "registration", "challan",
    ],
    "Subscriptions": [
        "netflix", "spotify", "prime", "hotstar", "disney", "sony liv",
        "zee5", "subscription", "icloud", "google one", "adobe",
        "youtube premium", "gym membership", "audible",
    ],
    "Entertainment": [
        "movie", "bookmyshow", "pvr", "inox", "cinema", "game", "gaming",
        "concert", "theatre", "amusement", "playstation", "xbox", "steam",
    ],
    "Health": [
        "pharmacy", "medical", "doctor", "hospital", "medicine", "apollo",
        "pharmeasy", "1mg", "netmeds", "clinic", "dental", "health", "lab",
    ],
    "Education": [
        "course", "udemy", "coursera", "school", "college", "tuition",
        "books", "exam", "fees", "byju", "unacademy", "vedantu",
    ],
    "Investments": [
        "sip", "mutual fund", "mutual funds", "mf", "stocks", "stock", "shares",
        "equity", "investment", "invested", "ppf", "nps", "elss", "fd",
        "fixed deposit", "recurring deposit", "rd", "zerodha", "groww", "upstox",
        "etf", "bonds", "gold bond", "sgb", "demat", "index fund",
    ],
    "Housing/Rent": [
        "rent", "maintenance", "society", "landlord", "lease", "deposit fee",
    ],
    "Personal Care": [
        "salon", "haircut", "spa", "grooming", "cosmetics", "skincare",
        "barber", "parlour", "parlor", "makeup", "facewash", "face wash", "shampoo", "bodywash", "body wash", "soap",
    ],
}

WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})

FILLER_WORDS = {"for", "on", "at", "the", "to", "paid", "spent", "of", "a", "an", "in"}


def _remove(text: str, start: int, end: int) -> str:
    return (text[:start] + " " + text[end:])


def _detect_payment(text: str) -> tuple[str, str]:
    lower = text.lower()
    for method, keywords in PAYMENT_METHODS.items():
        for kw in keywords:
            pattern = r"\b" + re.escape(kw) + r"\b"
            m = re.search(pattern, lower)
            if m:
                text = _remove(text, m.start(), m.end())
                return method, text
    return "", text


# Shorthand multipliers: 5k = 5,000 · 2l/2lakh = 2,00,000 · 1cr = 1,00,00,000
_SUFFIX = {"k": 1e3, "l": 1e5, "lakh": 1e5, "lac": 1e5, "cr": 1e7, "crore": 1e7}
_SUFFIX_RE = r"(k|l|lakh|lac|cr|crore)"


def _apply_suffix(num: float, suffix: str | None) -> float:
    if not suffix:
        return num
    return num * _SUFFIX.get(suffix.lower(), 1)


def _detect_amount(text: str) -> tuple[float | None, bool, str]:
    """Return (amount_abs, explicit_positive, remaining_text)."""
    # Explicit sign first, e.g. +85000, -250, +5k
    m = re.search(
        r"([+-])\s?(?:rs\.?|inr|₹|\$)?\s?(\d[\d,]*(?:\.\d+)?)\s?" + _SUFFIX_RE + r"?\b", text, re.IGNORECASE
    )
    if m:
        sign = m.group(1)
        num = _apply_suffix(float(m.group(2).replace(",", "")), m.group(3))
        text = _remove(text, m.start(), m.end())
        return num, sign == "+", text
    # Plain number, optionally with currency prefix and k/l/cr suffix (not part of a date like 10/05 or 5th)
    for m in re.finditer(
        r"(?:rs\.?|inr|₹|\$)?\s?(\d[\d,]*(?:\.\d+)?)\s?" + _SUFFIX_RE + r"?\b", text, re.IGNORECASE
    ):
        s, e = m.start(), m.end()
        # Skip if part of a dd/mm date (before or after /)
        if text[e : e + 1] == "/" or (s > 0 and text[s - 1 : s] == "/"):
            continue
        # Skip ordinals like 5th, 1st, 22nd, 3rd
        if re.match(r"(st|nd|rd|th)\b", text[e:].lstrip()[:2], re.IGNORECASE):
            continue
        num = _apply_suffix(float(m.group(1).replace(",", "")), m.group(2))
        text = _remove(text, s, e)
        return num, False, text
    return None, False, text


def _detect_date(text: str, today: datetime) -> tuple[str, str]:
    lower = text.lower()

    def fmt(d: datetime) -> str:
        return d.strftime("%Y-%m-%d")

    # today / yesterday / tomorrow
    for word, delta in (("today", 0), ("yesterday", -1), ("tomorrow", 1)):
        m = re.search(r"\b" + word + r"\b", lower)
        if m:
            return fmt(today + timedelta(days=delta)), _remove(text, m.start(), m.end())

    # N days ago
    m = re.search(r"\b(\d+)\s+days?\s+ago\b", lower)
    if m:
        n = int(m.group(1))
        return fmt(today - timedelta(days=n)), _remove(text, m.start(), m.end())

    # last <weekday>
    m = re.search(r"\blast\s+(" + "|".join(WEEKDAYS) + r")\b", lower)
    if m:
        target = WEEKDAYS[m.group(1)]
        diff = (today.weekday() - target) % 7
        diff = diff or 7
        return fmt(today - timedelta(days=diff)), _remove(text, m.start(), m.end())

    # this/next/coming <weekday>
    m = re.search(r"\b(?:this|next|coming)?\s*(" + "|".join(WEEKDAYS) + r")\b", lower)
    if m and m.group(1):
        target = WEEKDAYS[m.group(1)]
        diff = (target - today.weekday()) % 7
        return fmt(today + timedelta(days=diff)), _remove(text, m.start(), m.end())

    # dd/mm/yyyy or dd/mm
    m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", text)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        year = m.group(3)
        if year:
            year = int(year)
            if year < 100:
                year += 2000
        else:
            year = today.year
        try:
            return fmt(datetime(year, month, day)), _remove(text, m.start(), m.end())
        except ValueError:
            pass

    # Nth <month> <year?>  e.g. 5th may 2026, 22 jan 24
    m = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(" + "|".join(MONTHS) + r")(?:\s+(\d{2,4}))?\b", lower
    )
    if m:
        day = int(m.group(1))
        month = MONTHS[m.group(2)]
        year = m.group(3)
        if year:
            year = int(year)
            if year < 100:
                year += 2000
        else:
            year = today.year
        try:
            return fmt(datetime(year, month, day)), _remove(text, m.start(), m.end())
        except ValueError:
            pass

    # <month> Nth <year?>  e.g. may 5th 2026, jan 22 24
    m = re.search(
        r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{2,4}))?\b", lower
    )
    if m:
        month = MONTHS[m.group(1)]
        day = int(m.group(2))
        year = m.group(3)
        if year:
            year = int(year)
            if year < 100:
                year += 2000
        else:
            year = today.year
        try:
            return fmt(datetime(year, month, day)), _remove(text, m.start(), m.end())
        except ValueError:
            pass

    # Bare ordinal day like "15th" -> current month
    m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)\b", lower)
    if m:
        day = int(m.group(1))
        try:
            return fmt(datetime(today.year, today.month, day)), _remove(
                text, m.start(), m.end()
            )
        except ValueError:
            pass

    return fmt(today), text


def _detect_category(text: str) -> str:
    """Classify using the shared ml_nlp keyword + ML dictionary."""
    return ml_nlp.keyword_category(text) or "Other"


def _clean_description(text: str, fallback: str) -> str:
    tokens = [t for t in re.split(r"\s+", text.strip()) if t]
    tokens = [t for t in tokens if t.lower() not in FILLER_WORDS]
    desc = " ".join(tokens).strip(" -")
    desc = re.sub(r"\s{2,}", " ", desc)
    if not desc:
        return fallback if fallback != "Other" else "Transaction"
    return desc.title()


def parse_transaction(text: str, today: datetime | None = None) -> dict:
    """Parse a natural-language string into a transaction dict."""
    today = today or datetime.now()
    original = text.strip()
    working = " " + original + " "

    method, working = _detect_payment(working)
    amount_abs, explicit_pos, working = _detect_amount(working)
    date_str, working = _detect_date(working, today)
    category = _detect_category(original)
    description = _clean_description(working, category)

    # Sign logic: explicit + OR income signal word -> positive, else negative.
    lower = original.lower()
    income_signal = any(
        re.search(r"\b" + re.escape(w) + r"\b", lower) for w in INCOME_WORDS
    )
    is_income = explicit_pos or income_signal or category == "Income"

    amount = 0.0 if amount_abs is None else amount_abs
    amount = abs(amount) if is_income else -abs(amount)

    result = {
        "description": description,
        "amount": amount,
        "date": date_str,
        "category": category,
        "payment_method": method,
        "txn_type": "credit" if amount >= 0 else "debit",
    }

    # Local ML fallback when regex couldn't classify the category
    if category == "Other":
        ml_category = ml_nlp.classify_transaction(original)
        if ml_category and ml_category != "Other":
            result["category"] = ml_category

        ml_result = ml_nlp.parse_transaction_local(original)
        if ml_result:
            for key in ("description", "payment_method"):
                if ml_result.get(key):
                    result[key] = ml_result[key]
            if ml_result.get("category") and ml_result["category"] != "Other":
                result["category"] = ml_result["category"]
            if ml_result.get("date"):
                result["date"] = ml_result["date"]
            if amount_abs is None and ml_result.get("amount") not in (None, 0):
                try:
                    result["amount"] = float(ml_result["amount"])
                except (TypeError, ValueError):
                    pass
    
    # Gemini fallback ONLY when local ML also couldn't classify the category
    if result["category"] == "Other" and ai.is_enabled():
        enriched = _gemini_parse(original, today)
        if enriched:
            for key in ("description", "category", "payment_method"):
                if enriched.get(key):
                    result[key] = enriched[key]
            if enriched.get("date"):
                result["date"] = enriched["date"]
            if enriched.get("amount") not in (None, 0):
                try:
                    result["amount"] = float(enriched["amount"])
                except (TypeError, ValueError):
                    pass

    result["txn_type"] = "credit" if result["amount"] >= 0 else "debit"
    return result


def _gemini_parse(text: str, today: datetime) -> dict | None:
    system = (
        "You are a finance transaction parser for an Indian personal finance "
        "app. Currency is INR. Categories must be one of: Income, Food & Dining, "
        "Food Delivery, Groceries, Transportation, Fuel, Shopping, Utilities, "
        "Subscriptions, Entertainment, Health, Education, Housing/Rent, "
        "Personal Care, Snacks, Other. Negative amount = expense, positive = "
        "income. Return JSON keys: description, amount, date (YYYY-MM-DD), "
        "category, payment_method."
    )
    payload = f"Today is {today.strftime('%Y-%m-%d')}. Parse: {text!r}"
    return ai.chat_json(system, payload)


# --------------------------------------------------------------------------- #
# Recurring / bulk parsing
# --------------------------------------------------------------------------- #

_MONTH_NAMES = "|".join(sorted(MONTHS.keys(), key=len, reverse=True))

RECURRING_SIGNALS = [
    r"\bevery\s*month\b",
    r"\beach\s*month\b",
    r"\bmonthly\b",
    r"\ball\s+months\b",
    r"\bper\s+month\b",
    r"\bfor\s+(?:all\s+)?(?:the\s+)?months\b",
    r"\bfrom\s+(?:" + _MONTH_NAMES + r")\b",
    r"\bsince\s+(?:" + _MONTH_NAMES + r")\b",
    r"\b(?:to|till|until)\s+(?:now|today|present|date)\b",
    r"\b(?:last|next)\s+\d+\s+months?\b",
    r"\bfor\s+(?:the\s+)?(?:year\s+)?\d{4}\b",
    r"\b(?:" + _MONTH_NAMES + r")(?:\s*,\s*(?:" + _MONTH_NAMES + r"))+\b",
]

SCHEDULE_STRIP_PATTERNS = [
    r"\bevery\s*month\b",
    r"\beach\s*month\b",
    r"\bmonthly\b",
    r"\ball\s+months\b",
    r"\bper\s+month\b",
    r"\bfor\s+(?:all\s+)?(?:the\s+)?months\b",
    r"\bfrom\s+(?:" + _MONTH_NAMES + r")\s*(?:\d{4})?\s+(?:to|till|until|through|upto|up\s+to)\s+(?:now|today|present|date|currently|so\s*far)\b",
    r"\bfrom\s+(?:" + _MONTH_NAMES + r")\s*(?:\d{4})?\s+(?:to|till|until|through)\s+(?:" + _MONTH_NAMES + r")\s*(?:\d{4})?\b",
    r"\bfor\s+(?:the\s+)?(?:year\s+)?\d{4}\b",
    r"\b(?:last|next)\s+\d+\s+months?\b",
    r"\bon\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?(?:\s+(?:each|every)\s+month)?\b",
    r"\b\d{1,2}(?:st|nd|rd|th)\s+(?:of\s+)?(?:each|every)\s+month\b",
    r"\b(?:" + _MONTH_NAMES + r")(?:\s*,\s*(?:" + _MONTH_NAMES + r"))+(?:\s+\d{4})?\b",
    r"\b(?:to|till|until|through)\s+(?:now|today|present|date|currently)\b",
    r"\bsince\s+(?:" + _MONTH_NAMES + r")(?:\s+\d{4})?\b",
    r"\b(?:to|till|until|through)\s+(?:" + _MONTH_NAMES + r")(?:\s+\d{4})?\b",
    r"\bfrom\s+(?:" + _MONTH_NAMES + r")(?:\s+\d{4})?\b",
]


def _ym_add(ym: str, delta: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    idx = y * 12 + (m - 1) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def _month_range(start_ym: str, end_ym: str) -> list[str]:
    if start_ym > end_ym:
        start_ym, end_ym = end_ym, start_ym
    months, cur = [], start_ym
    while cur <= end_ym:
        months.append(cur)
        cur = _ym_add(cur, 1)
    return months


def _months_in_year(year: int) -> list[str]:
    return [f"{year}-{m:02d}" for m in range(1, 13)]


def _is_recurring(text: str) -> bool:
    lower = text.lower()
    return any(re.search(p, lower) for p in RECURRING_SIGNALS)


def _strip_schedule_phrases(text: str) -> str:
    out = text
    for pat in SCHEDULE_STRIP_PATTERNS:
        out = re.sub(pat, " ", out, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", out).strip()


def _extract_recurring_day(text: str, default: int = 1) -> int:
    lower = text.lower()
    for pat in (
        r"\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b",
        r"\b(\d{1,2})(?:st|nd|rd|th)\s+(?:of\s+)?(?:each|every)\s+month\b",
    ):
        m = re.search(pat, lower)
        if m:
            return min(max(int(m.group(1)), 1), 31)
    return default


def _month_name_to_num(name: str) -> int:
    return MONTHS[name.lower()]


def _extract_months(text: str, today: datetime) -> list[str]:
    lower = text.lower()

    m = re.search(r"\bnext\s+(\d+)\s+months?\b", lower)
    if m:
        n = int(m.group(1))
        start = today.strftime("%Y-%m")
        return [_ym_add(start, i) for i in range(n)]

    m = re.search(r"\blast\s+(\d+)\s+months?\b", lower)
    if m:
        n = int(m.group(1))
        end = today.strftime("%Y-%m")
        start = _ym_add(end, -(n - 1))
        return _month_range(start, end)

    m = re.search(r"\bfor\s+(?:the\s+)?(?:year\s+)?(\d{4})\b", lower)
    if m:
        return _months_in_year(int(m.group(1)))

    # "from <month> <year?> (to|till|until|through) <month> <year?>"  — explicit end month
    # "from <month> <year?> (to|till|until|through) (now|today|present|date)" — end = current month
    m = re.search(
        rf"\bfrom\s+({_MONTH_NAMES})\s*(\d{{4}})?\s+(?:to|till|until|through|upto|up\s+to)\s+"
        rf"(?:({_MONTH_NAMES})\s*(\d{{4}})?|now|today|present|date|currently|so\s*far)\b",
        lower,
    )
    if m:
        sm, sy, em, ey = m.group(1), m.group(2), m.group(3), m.group(4)
        end_ym = today.strftime("%Y-%m")
        if em:  # explicit end month given
            start_year = int(sy or ey or today.year)
            end_year = int(ey or sy or today.year)
            start_ym = f"{start_year:04d}-{_month_name_to_num(sm):02d}"
            end_ym = f"{end_year:04d}-{_month_name_to_num(em):02d}"
        else:   # open end ("till now"/"today"/...) -> up to the current month
            start_year = int(sy) if sy else today.year
            start_ym = f"{start_year:04d}-{_month_name_to_num(sm):02d}"
            # No year given and the month is still ahead this year -> they mean last year.
            if not sy and start_ym > end_ym:
                start_ym = f"{start_year - 1:04d}-{_month_name_to_num(sm):02d}"
        return _month_range(start_ym, end_ym)

    # "since <month> <year?>" / open-ended "from <month> <year?>" -> start up to current month
    m = re.search(rf"\b(?:since|from)\s+({_MONTH_NAMES})\s*(\d{{4}})?\b", lower)
    if m:
        sm, sy = m.group(1), m.group(2)
        start_year = int(sy) if sy else today.year
        start_ym = f"{start_year:04d}-{_month_name_to_num(sm):02d}"
        end_ym = today.strftime("%Y-%m")
        # No year given and the month is still ahead this year -> they mean last year
        # (e.g. "from august" said in June 2026 means Aug 2025, not the future).
        if not sy and start_ym > end_ym:
            start_ym = f"{start_year - 1:04d}-{_month_name_to_num(sm):02d}"
        return _month_range(start_ym, end_ym)

    if re.search(r"\ball\s+months\b", lower):
        ym = re.search(r"\b(\d{4})\b", text)
        year = int(ym.group(1)) if ym else today.year
        return _months_in_year(year)

    m = re.search(rf"\b({_MONTH_NAMES})(?:\s*,\s*({_MONTH_NAMES}))+?(?:\s+(\d{{4}}))?\b", lower)
    if m:
        chunk = m.group(0)
        year_m = re.search(r"\b(\d{4})\b", chunk)
        year = int(year_m.group(1)) if year_m else today.year
        names = re.findall(rf"\b({_MONTH_NAMES})\b", chunk)
        return sorted({f"{year:04d}-{_month_name_to_num(n):02d}" for n in names})

    if re.search(r"\b(?:every|each)\s*month\b|\bmonthly\b|\bper\s+month\b", lower):
        start = today.strftime("%Y-%m")
        return [_ym_add(start, i) for i in range(12)]

    return []


def parse_recurring(text: str, today: datetime | None = None) -> dict:
    """Parse a recurring schedule like 'salary +5k on 1st every month'."""
    today = today or datetime.now()
    original = text.strip()
    months = _extract_months(original, today)
    day = _extract_recurring_day(original)
    base_text = _strip_schedule_phrases(original)
    base = parse_transaction(base_text or original, today)

    if not months:
        start = today.strftime("%Y-%m")
        months = [_ym_add(start, i) for i in range(12)]

    return {
        "kind": "recurring",
        "description": base["description"],
        "amount": base["amount"],
        "category": base["category"],
        "payment_method": base["payment_method"],
        "notes": "",
        "day": day,
        "months": months,
        "count": len(months),
        "total": round(base["amount"] * len(months), 2),
    }


def parse_nl_input(text: str, today: datetime | None = None) -> dict:
    """Parse NL text as a single transaction or a recurring schedule."""
    today = today or datetime.now()
    original = text.strip()
    if not original:
        raise ValueError("Empty input")
    if _is_recurring(original):
        return parse_recurring(original, today)
    result = parse_transaction(original, today)
    result["kind"] = "single"
    return result


def parse_bulk_lines(text: str, today: datetime | None = None) -> list[dict]:
    """Parse multiple NL lines (one transaction or schedule per line)."""
    today = today or datetime.now()
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        items.append(parse_nl_input(line, today))
    return items
