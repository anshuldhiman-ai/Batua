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
    "Net Banking": ["net banking", "netbanking", "neft", "imps", "rtgs", "bank", "online", "auto debit", "auto-debit"],
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
        "lays", "chips", "samosa", "golgappa", "golgappe", "gol gappa", "gol gappe", "panipuri",
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
    "Investments": [
        "sip", "mutual fund", "mutual funds", "mf", "stocks", "stock", "shares",
        "equity", "investment", "invested", "ppf", "nps", "elss", "fd",
        "fixed deposit", "recurring deposit", "rd", "zerodha", "groww", "upstox",
        "etf", "bonds", "gold bond", "sgb", "demat", "index fund",
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

# Container / counting units used to detect quantity, e.g. "2 packet", "3 plate".
# The leading number is captured as the quantity; the unit word stays in the
# description ("2 packet lays" -> quantity 2, description "Lays Packet").
_QUANTITY_UNITS = [
    "packets", "packet", "plates", "plate", "cups", "cup", "glasses", "glass",
    "bottles", "bottle", "pieces", "piece", "pcs", "pc", "nos", "dozen",
    "boxes", "box", "thalis", "thali", "kg", "kgs", "litre", "litres", "ltr",
    "packs", "pack",
]
_QUANTITY_RE = re.compile(
    r"\b(\d+)\s*(" + "|".join(_QUANTITY_UNITS) + r")\b", re.IGNORECASE
)

# Item separators inside a spoken segment ("chai 10 aur samosa 15").
_ITEM_SPLIT_RE = re.compile(r"\b(?:aur|and)\b", re.IGNORECASE)

# A single priced unit in a spoken enumeration, e.g. "10 ka", "ek 10 ka"
# (after number-word normalisation "ek" -> "1", so "1 10 ka"). The optional
# leading number is the count at that price; the second number is the price.
_PRICE_UNIT = r"(?:\d+(?:\.\d+)?\s+)?\d+(?:\.\d+)?\s*(?:ka|ke|ki|wala|wale|wali)\b"
_PRICE_UNIT_RE = re.compile(
    r"(?:(\d+(?:\.\d+)?)\s+)?(\d+(?:\.\d+)?)\s*(?:ka|ke|ki|wala|wale|wali)\b",
    re.IGNORECASE,
)
# An enumeration is two or more priced units in a row: "ek 10 ka ek 20 ka".
_PRICE_ENUM_RE = re.compile(
    _PRICE_UNIT + r"(?:\s*(?:aur|and|,)?\s*" + _PRICE_UNIT + r")+", re.IGNORECASE
)


_SPOKEN_DEVANAGARI_REPLACEMENTS = {
    "आज": "today",
    "कल": "kal",
    "मैंने": "maine",
    "मेने": "maine",
    "मैनें": "maine",
    "और": "aur",
    "तथा": "aur",
    "लिए": "liye",
    "लिये": "liye",
    "खरीदा": "kharida",
    "खरीदे": "kharide",
    "गया": "gaya",
    "गयी": "gayi",
    "गए": "gaye",
    "था": "tha",
    "थी": "thi",
    "थे": "the",
    "हुआ": "hua",
    "मुझे": "mujhe",
    "नहीं": "nahi",
    "कुछ": "kuch",
    "भी": "bhi",
    "फिर": "phir",
    "बजे": "baje",
    "बजे दिन": "baje din",
    "दिन": "din",
    "दोपहर": "dopahar",
    "सुबह": "subah",
    "शाम": "shaam",
    "रात": "raat",
    "कुरकुरे": "kurkure",
    "लेज़": "lays",
    "लेज": "lays",
    "पैकेट": "packet",
    "लिया": "liya",
    "खाया": "khaya",
    "खाए": "khaye",
    "खाये": "khaye",
    "गोलगप्पे": "gol gappe",
    "गोल गप्पे": "gol gappe",
    "का": "ka",
    "के": "ke",
    "की": "ki",
    "वाला": "wala",
    "वाले": "wale",
    "रुपये": "rs",
    "रुपया": "rs",
}

_SPOKEN_NUMBER_WORDS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "fifteen": "15",
    "twenty": "20",
    "thirty": "30",
    "forty": "40",
    "fifty": "50",
    "sixty": "60",
    "seventy": "70",
    "eighty": "80",
    "ninety": "90",
    "ek": "1",
    "do": "2",
    "teen": "3",
    "char": "4",
    "paanch": "5",
    "panch": "5",
    "che": "6",
    "chhe": "6",
    "saat": "7",
    "aath": "8",
    "nau": "9",
    "das": "10",
    "gyarah": "11",
    "barah": "12",
    "pandrah": "15",
    "bees": "20",
    "tis": "30",
    "tees": "30",
    "chalis": "40",
    "pachas": "50",
    "saath": "60",
    "sattar": "70",
    "assi": "80",
    "nabbe": "90",
    "एक": "1",
    "दो": "2",
    "तीन": "3",
    "चार": "4",
    "पांच": "5",
    "पाँच": "5",
    "छह": "6",
    "सात": "7",
    "आठ": "8",
    "नौ": "9",
    "दस": "10",
    "ग्यारह": "11",
    "बारह": "12",
    "पंद्रह": "15",
    "बीस": "20",
    "तीस": "30",
    "चालीस": "40",
    "पचास": "50",
    "साठ": "60",
    "सत्तर": "70",
    "अस्सी": "80",
    "नब्बे": "90",
}

_SPOKEN_FILLER_WORDS = {
    "maine", "mene", "main", "me", "ne", "liya", "liye", "lia", "khaya",
    "khaye", "khayi", "khaya", "khaaye", "kharida", "kharide", "bought",
    "purchase", "li", "le", "ka", "ke", "ki", "ko", "se", "wala", "wale",
    "wali", "rs", "rupees", "rupaye", "rupiya", "k", "din",
    # Common spoken verbs / pronouns that are chatter, not part of a
    # transaction description ("main market gaya tha" -> keep only the item).
    "gaya", "gayi", "gaye", "gaya", "tha", "thi", "the", "hua", "hui", "huye",
    "raha", "rahi", "rahe", "kar", "karke", "kiya", "kiye", "diya", "diye",
    "aa", "aaya", "aayi", "aaye", "hu", "hun", "ho", "tab", "jab", "bhi",
    "kuch", "wagera", "vagera", "mujhe", "nahi", "nhi", "phir", "fir",
    "dala", "daala", "dali", "mangaya", "mangwaya", "manga", "order",
    "uth", "jaate", "hue", "khana", "wala", "wale",
}

_SPOKEN_TIME_RE = re.compile(
    r"\b(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*"
    r"(?:baje|bajey|bje|bj|o[' ]?clock)\b"
    r"(?:\s*(?P<period>subah|morning|dopahar|dupehar|din|shaam|sham|evening|raat|night))?",
    re.IGNORECASE,
)

_SPOKEN_AMPM_RE = re.compile(
    r"\b(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm)\b",
    re.IGNORECASE,
)


def _remove(text: str, start: int, end: int) -> str:
    return (text[:start] + " " + text[end:])


def _normalise_spoken_text(text: str) -> str:
    """Normalize common Hindi/Hinglish speech-recognition output.

    Browser speech can return either roman Hinglish ("aaj 2 bje") or Hindi
    script ("आज 2 बजे"). This keeps the parser deterministic without needing
    an external transcription service.
    """
    out = text.strip()
    for source, target in sorted(
        _SPOKEN_DEVANAGARI_REPLACEMENTS.items(), key=lambda item: len(item[0]), reverse=True
    ):
        out = out.replace(source, f" {target} ")
    out = out.lower()
    replacements = {
        r"\b(aaj|aj)\b": "today",
        # "kal" is ambiguous (yesterday/tomorrow); for expense logging the past
        # reading is the safe default.
        r"\b(kal|kl)\b": "yesterday",
        r"\b(phir|fir|fer|then|uske baad|baad mein)\b": "\n",
        r"\b(bajya|baje|bajey|bje|bj)\b": "baje",
        r"\b(gol\s*gappe|gol\s*gappa|golgappe|golgappa)\b": "gol gappe",
    }
    for pattern, target in replacements.items():
        out = re.sub(pattern, target, out, flags=re.IGNORECASE)
    for word, number in sorted(_SPOKEN_NUMBER_WORDS.items(), key=lambda item: len(item[0]), reverse=True):
        out = re.sub(r"\b" + re.escape(word) + r"\b", number, out, flags=re.IGNORECASE)
    # A comma between items ("chai 10, samosa 15") separates transactions, but a
    # comma inside a number ("50,000") does not. Convert only the former.
    out = re.sub(r"(?<!\d),(?!\d)", " aur ", out)
    out = re.sub(r"[.!?;]+", " ", out)
    out = re.sub(r"\s*\n\s*", "\n", out)
    return re.sub(r"[ \t]{2,}", " ", out).strip()


def _spoken_date_context(text: str) -> str:
    for word in ("today", "yesterday", "tomorrow"):
        if re.search(r"\b" + word + r"\b", text, re.IGNORECASE):
            return word
    return ""


def _format_spoken_time(hour: int, minute: int, period: str | None) -> str:
    period = (period or "").lower()
    hour_24 = hour
    if period in {"dopahar", "dupehar", "din", "shaam", "sham", "evening", "raat", "night"}:
        if 1 <= hour_24 <= 11:
            hour_24 += 12
    elif period in {"subah", "morning"} and hour_24 == 12:
        hour_24 = 0
    if period:
        return f"{hour_24:02d}:{minute:02d}"
    return f"{hour}:{minute:02d}"


def _extract_spoken_time(text: str) -> tuple[str, list[str]]:
    notes: list[str] = []

    def replace_baje(match: re.Match) -> str:
        hour = int(match.group("hour"))
        minute = int(match.group("minute") or 0)
        if 1 <= hour <= 24 and 0 <= minute <= 59:
            notes.append(f"Time: {_format_spoken_time(hour, minute, match.group('period'))}")
        return " "

    def replace_ampm(match: re.Match) -> str:
        hour = int(match.group("hour"))
        minute = int(match.group("minute") or 0)
        ampm = match.group("ampm").lower()
        if 1 <= hour <= 12 and 0 <= minute <= 59:
            hour_24 = hour % 12
            if ampm == "pm":
                hour_24 += 12
            notes.append(f"Time: {hour_24:02d}:{minute:02d}")
        return " "

    text = _SPOKEN_TIME_RE.sub(replace_baje, text)
    text = _SPOKEN_AMPM_RE.sub(replace_ampm, text)
    return re.sub(r"\s{2,}", " ", text).strip(), notes


def _strip_spoken_fillers(text: str) -> str:
    if not text:
        return text
    filler_pattern = r"\b(?:" + "|".join(re.escape(w) for w in sorted(_SPOKEN_FILLER_WORDS, key=len, reverse=True)) + r")\b"
    text = re.sub(filler_pattern, " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:ka|ke|ki)\s+(?=\d+\b)", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


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


def _detect_quantity(text: str) -> tuple[int, str]:
    """Return (quantity, remaining_text). Detects '2 packet', '3 plate', etc.

    The counted number is removed so it is not later mistaken for an amount; the
    unit word is left in place so it can still form part of the description.
    """
    m = _QUANTITY_RE.search(text)
    if not m:
        return 1, text
    try:
        qty = int(m.group(1))
    except ValueError:
        return 1, text
    if qty < 1:
        return 1, text
    # Drop just the number, keep the unit word (start .. before the unit).
    text = _remove(text, m.start(1), m.end(1))
    return qty, text


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
    quantity, working = _detect_quantity(working)
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
        "quantity": quantity,
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
            # Only borrow the ML amount when the regex found none AND no counted
            # quantity was detected — otherwise the ML parser would mistake the
            # item count ("2 packet") for the price.
            if amount_abs is None and quantity == 1 and ml_result.get("amount") not in (None, 0):
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


def _extract_price_enumerations(text: str) -> tuple[str, list[dict]]:
    """Collapse a spoken price list ("ek 10 ka ek 20 ka") into one grouped item.

    Each enumeration is replaced by an ``ENUMTOKEN<i>`` placeholder that stays
    attached to the preceding item words, so later item-splitting on "aur" does
    not tear a single item's price list apart. Returns (text, enumerations)
    where each enumeration has: quantity, amount (positive total) and a human
    breakdown like "1×₹10, 1×₹20".
    """
    enums: list[dict] = []

    def repl(match: re.Match) -> str:
        pairs = _PRICE_UNIT_RE.findall(match.group(0))
        quantity = 0
        total = 0.0
        parts: list[str] = []
        for count_str, price_str in pairs:
            count = int(float(count_str)) if count_str else 1
            price = float(price_str)
            quantity += count
            total += count * price
            parts.append(f"{count:g}×₹{price:g}")
        idx = len(enums)
        enums.append(
            {"quantity": max(quantity, 1), "amount": total, "breakdown": ", ".join(parts)}
        )
        return f" ENUMTOKEN{idx} "

    return _PRICE_ENUM_RE.sub(repl, text), enums


def _split_items(text: str) -> list[str]:
    """Split a segment into transaction items on 'aur'/'and'.

    Fragments without a number are merged forward into the next priced fragment
    so "bread aur butter 50" stays one item, while "chai 10 aur samosa 15"
    becomes two. (ENUMTOKENs count as carrying a value.)
    """
    parts = [p.strip(" -") for p in _ITEM_SPLIT_RE.split(text) if p.strip(" -")]
    items: list[str] = []
    buffer = ""
    for part in parts:
        buffer = f"{buffer} {part}".strip() if buffer else part
        if re.search(r"\d|ENUMTOKEN", buffer):
            items.append(buffer)
            buffer = ""
    if buffer:
        if items:
            items[-1] = f"{items[-1]} {buffer}".strip()
        else:
            items.append(buffer)
    return items


_LEAD_COUNT_RE = re.compile(r"^\s*(\d{1,3})\s+(?=[a-z])", re.IGNORECASE)
# Words after a leading number that mean it is a date/time, not a quantity.
_TEMPORAL_AFTER = {
    "day", "days", "week", "weeks", "month", "months", "year", "years",
    "saal", "din", "ago", "bje", "baje",
} | set(MONTHS)


def _extract_lead_quantity(text: str) -> tuple[int | None, str]:
    """Pull a leading count that acts as quantity, e.g. 'ek coffee 60' -> 1.

    Voice-only: 'ek'/'do'/... normalise to a bare number in front of the item.
    Only fires when a *separate* price number follows and the next word is not a
    date/time unit, so amounts ('500 petrol') and dates ('2 june') are untouched.
    """
    m = _LEAD_COUNT_RE.match(text)
    if not m:
        return None, text
    rest = text[m.end():]
    if not re.search(r"\d", rest):  # no separate price -> leave the number alone
        return None, text
    word = re.match(r"([a-z]+)", rest, re.IGNORECASE)
    if word and word.group(1).lower() in _TEMPORAL_AFTER:
        return None, text
    return int(m.group(1)), rest


def _parse_voice_item(
    text: str, today: datetime, enums: list[dict], date_context: str
) -> dict | None:
    """Parse a single spoken item into a transaction dict."""
    raw_item = text.lower()
    # Time is stripped so a spoken clock value ("11 bje") is not misread as an
    # amount, but it is intentionally discarded — only the date is recorded.
    text, _ = _extract_spoken_time(text)

    enum: dict | None = None
    token = re.search(r"ENUMTOKEN(\d+)", text)
    if token:
        idx = int(token.group(1))
        if 0 <= idx < len(enums):
            enum = enums[idx]
        text = (text[: token.start()] + " " + text[token.end():]).strip()

    text = _strip_spoken_fillers(text)
    lead_qty, text = _extract_lead_quantity(text)
    if date_context and not _spoken_date_context(text):
        text = f"{date_context} {text}"
    if not text.strip() and enum is None:
        return None

    parsed = parse_nl_input(text.strip() or "item", today)
    if parsed.get("date") in {"today", "yesterday", "tomorrow"}:
        parsed["date"] = _detect_date(parsed["date"], today)[0]
    if lead_qty is not None and enum is None:
        parsed["quantity"] = lead_qty

    if enum is not None:
        # The base amount can be polluted by ML fallback, so infer income from
        # the words/category instead of the base sign.
        is_income = parsed["category"] == "Income" or any(
            re.search(r"\b" + re.escape(w) + r"\b", raw_item) for w in INCOME_WORDS
        )
        total = enum["amount"]
        parsed["amount"] = total if is_income else -total
        parsed["quantity"] = enum["quantity"]
        parsed["txn_type"] = "credit" if parsed["amount"] >= 0 else "debit"
        if enum["breakdown"]:
            parsed["notes"] = enum["breakdown"]

    # A transaction needs a value. Items with no amount are spoken filler /
    # chatter ("phir ghar aa gaya") and are dropped so only real entries remain.
    if enum is None and parsed["amount"] == 0:
        return None
    return parsed


def parse_voice_input(text: str, today: datetime | None = None) -> list[dict]:
    """Parse a spoken Hinglish paragraph into one or more transactions.

    Handles three kinds of structure at once:
      * multiple transactions joined by "phir"/"then"/"aur"/","
      * quantities ("2 packet lays")
      * per-item price lists ("ek 10 ka ek 20 ka" -> one grouped item)

    Example:
    "aaj lays k 2 packet ek 10 ka ek 20 ka aur chai 10"
    -> Lays Packet (qty 2, -30, breakdown note) + Chai (-10).
    """
    today = today or datetime.now()
    normalized = _normalise_spoken_text(text)
    date_context = _spoken_date_context(normalized)
    segments = [seg.strip(" -") for seg in normalized.splitlines() if seg.strip(" -")]
    if not segments:
        return []

    items: list[dict] = []
    for segment in segments:
        segment, enums = _extract_price_enumerations(segment)
        for sub in _split_items(segment):
            parsed = _parse_voice_item(sub, today, enums, date_context)
            if parsed:
                items.append(parsed)

    if items:
        return items
    return parse_bulk_lines(text, today)
