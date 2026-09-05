"""Natural-language transaction parser.

Pipeline: regex first, local ML fallback, Gemini fallback only if category resolves to "Other".
Tokens are removed from the working string as each field is extracted so the
leftover becomes a clean description.
"""
import re
import ast
import calendar
import time
import logging
from datetime import datetime, timedelta


import ai
import ml_nlp

logger = logging.getLogger("batua.parser")

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
    "salary", "income", "refund", "cashback", "credited",
    "bonus", "interest", "dividend", "received", "stipend", "freelance",
    "reimbursement", "payout", "deposit",
    "pocketmoney", "pocket money", "allowance", "gift", "gifted",
    "prize", "won", "sold", "returns", "rebate", "scholarship",
]

# Category -> keywords. Order matters: the first category with a hit wins, so
# more specific categories come before broad ones.
CATEGORIES: dict[str, list[str]] = {
    "Income": INCOME_WORDS,
    # Food/drink ordering matches ml_nlp.CATEGORY_KEYWORDS (the dict that
    # actually classifies) so the category list and the classifier agree.
    "Food Delivery": ["swiggy", "zomato", "foodpanda", "ubereats", "uber eats", "eatsure", "dunzo"],
    "Fast Food": [
        "pizza", "burger", "fries", "kfc", "mcdonald", "mcd", "dominos",
        "dominoes", "pizza hut", "subway", "fried chicken", "nuggets",
        "hot dog", "sandwich", "momos", "kathi roll", "shawarma", "noodles",
        "manchurian", "chowmein", "fried rice",
    ],
    "Food & Dining": [
        "restaurant", "dine", "dining", "cafe", "dosa",
        "paneer", "biryani", "thali", "lunch", "dinner", "breakfast",
        "meal", "buffet", "starbucks", "barbeque", "haldiram",
    ],
    # Drinks come before fruits so "banana shake" → Beverages and
    # "mix fruit juice" → Refreshments, while a bare fruit stays Fruits.
    "Refreshments": [
        "juice", "lemonade", "nimbu", "nimbu pani", "shikanji", "mineral water",
        "bottled water", "packaged water", "drinking water", "bisleri", "kinley",
        "soft drink", "cold drink", "coke", "pepsi", "sprite", "fanta",
        "thums up", "limca", "maaza", "frooti", "slice", "appy", "soda",
        "sherbet", "real juice", "lime water", "lime soda", "lime juice",
        "minute maid",
    ],
    "Beverages": [
        "shake", "milkshake", "milk shake", "smoothie", "lassi", "chaas",
        "buttermilk", "butter milk", "cold coffee", "iced coffee", "iced tea",
        "energy drink", "red bull", "horlicks", "bournvita", "boost",
    ],
    "Fruits": [
        "mango", "banana", "apple", "orange", "grapes", "watermelon", "papaya",
        "guava", "pineapple", "pomegranate", "kiwi", "strawberry", "mosambi",
        "sweet lime", "litchi", "lychee", "peach", "apricot", "cherry",
        "sapota", "chikoo", "custard apple", "jamun", "fruit", "fruits", "aam",
    ],
    "Snacks": [
        "lays", "chips", "samosa", "golgappa", "golgappe", "gol gappa", "gol gappe", "panipuri",
        "pani puri", "kurkure", "namkeen", "biscuit", "cookie", "chocolate",
        "dairy milk", "kitkat", "kit kat", "maggi", "chai", "tea", "coffee",
        "icecream", "ice cream", "pastry", "snack", "snacks",
        "pakora", "vada pav", "bhel", "popcorn",
    ],
    "Groceries": [
        "bigbasket", "big basket", "blinkit", "zepto", "grofers", "dmart",
        "d mart", "grocery", "groceries", "vegetables", "milk",
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
        "etf", "bonds", "gold bond", "sgb", "demat", "index fund", "trading", "brokerage", "intraday", "futures", "options", "ipo", "buy order", "sell order",
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

FILLER_WORDS = {"for", "on", "at", "the", "to", "paid", "spent", "of", "a", "an", "in", "rs", "inr", "rupees", "rupee", "rupaye", "rupiya", "i", "we", "my"}

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

# A single priced unit in a spoken enumeration, e.g. "10 ka", "ek 10 ka", "20 each"
# (after number-word normalisation "ek" -> "1", so "1 10 ka"). The optional
# leading number is the count at that price; the second number is the price.
_PRICE_UNIT = r"(?:\d+(?:\.\d+)?\s+)?\d+(?:\.\d+)?\s*(?:ka|ke|ki|wala|wale|wali|each)\b"
_PRICE_UNIT_RE = re.compile(
    r"(?:(\d+(?:\.\d+)?)\s+)?(\d+(?:\.\d+)?)\s*(?:ka|ke|ki|wala|wale|wali|each)\b",
    re.IGNORECASE,
)
# An enumeration is two or more priced units in a row: "ek 10 ka ek 20 ka", "20 each 20 each".
_PRICE_ENUM_RE = re.compile(
    _PRICE_UNIT + r"(?:\s*(?:aur|and|,)?\s*" + _PRICE_UNIT + r")+", re.IGNORECASE
)
# Pattern for "X of Y each" or "X each" in typed input
# Matches: "2 packets of 20 rs each", "3 bottles of 50 each", "20 each", "2 of 20 each"
_TYPED_EACH_RE = re.compile(
    r"(?:\d+\s+(?:packets?|pieces?|items?|bottles?|boxes?|units?)?\s+of\s+(?:rs|₹)?\s*\d+(?:\.\d+)?\s*(?:rs|rupees?|rupaye|rupiya)?\s*each|\d+(?:\.\d+)?\s*(?:rs|rupees?|rupaye|rupiya)?\s*each)",
    re.IGNORECASE
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

# Pre-compiled regex patterns for performance optimization
_INCOME_WORDS_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in INCOME_WORDS) + r")\b", re.IGNORECASE)

_DATE_WORDS_RE = {
    "today": re.compile(r"\btoday\b", re.IGNORECASE),
    "yesterday": re.compile(r"\byesterday\b", re.IGNORECASE),
    "tomorrow": re.compile(r"\btomorrow\b", re.IGNORECASE),
}

# Pre-sorted replacements for _normalise_spoken_text
_SPOKEN_DEVANAGARI_REPLACEMENTS_SORTED = sorted(
    _SPOKEN_DEVANAGARI_REPLACEMENTS.items(), key=lambda item: len(item[0]), reverse=True
)

_SPOKEN_NUMBER_WORDS_SORTED = sorted(
    _SPOKEN_NUMBER_WORDS.items(), key=lambda item: len(item[0]), reverse=True
)

# Pre-compiled filler pattern
_SPOKEN_FILLER_WORDS_SORTED = sorted(_SPOKEN_FILLER_WORDS, key=len, reverse=True)
_FILLER_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(w) for w in _SPOKEN_FILLER_WORDS_SORTED) + r")\b",
    re.IGNORECASE
)

# Pre-compiled payment method patterns
_PAYMENT_METHOD_PATTERNS = {
    method: [re.compile(r"\b" + re.escape(kw) + r"\b", re.IGNORECASE) for kw in keywords]
    for method, keywords in PAYMENT_METHODS.items()
}


def _remove(text: str, start: int, end: int) -> str:
    return (text[:start] + " " + text[end:])


def _normalise_spoken_text(text: str) -> str:
    """Normalize common Hindi/Hinglish speech-recognition output.

    Browser speech can return either roman Hinglish ("aaj 2 bje") or Hindi
    script ("आज 2 बजे"). This keeps the parser deterministic without needing
    an external transcription service.
    """
    out = text.strip()
    for source, target in _SPOKEN_DEVANAGARI_REPLACEMENTS_SORTED:
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
    for word, number in _SPOKEN_NUMBER_WORDS_SORTED:
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
    text = _FILLER_PATTERN.sub(" ", text)
    text = re.sub(r"\b(?:ka|ke|ki)\s+(?=\d+\b)", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def _detect_payment(text: str) -> tuple[str, str]:
    lower = text.lower()
    for method, patterns in _PAYMENT_METHOD_PATTERNS.items():
        for pattern in patterns:
            m = pattern.search(lower)
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


def _eval_arithmetic(expr: str) -> float | None:
    """Safely evaluate an amount breakdown like ``120+89+70`` or ``15*2+20``.

    Only +, * and parentheses over plain numbers are allowed — anything else
    (names, calls, attributes, division) is rejected. Returns None when the
    string isn't a pure arithmetic expression. ``/`` is deliberately excluded
    so a dd/mm date like ``10/05`` is never misread as division.
    """
    s = expr.strip()
    if not s or not re.fullmatch(r"[\d+*(). ]+", s):
        return None

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Mult)):
            a, b = ev(node.left), ev(node.right)
            return a + b if isinstance(node.op, ast.Add) else a * b
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -ev(node.operand)
        raise ValueError("unsupported expression")

    try:
        val = float(ev(ast.parse(s, mode="eval")))
        return val if val > 0 else None
    except (ValueError, SyntaxError, ZeroDivisionError, RecursionError, TypeError):
        return None


# A chain of at least two numbers joined by + or * (e.g. "120+89+70",
# "15*2+20"). The leading lookbehind stops it matching inside a word, and the
# trailing \b keeps "12+15+48" (ends on a digit) intact.
_ARITH_AMOUNT_RE = re.compile(
    r"(?<!\w)([+-]?)(\d+(?:\.\d+)?(?:\s*[+*]\s*\d+(?:\.\d+)?)+)\b",
    re.IGNORECASE,
)


def _detect_amount(text: str) -> tuple[float | None, bool, str]:
    """Return (amount_abs, explicit_positive, remaining_text)."""
    # Arithmetic breakdown first: "chai 120+89+70" -> 279 (a single total).
    # Runs before the sign/plain-number checks so "120+89+70" isn't picked
    # apart into "89" (with its "+" read as an explicit income sign) and "70".
    am = _ARITH_AMOUNT_RE.search(text)
    if am:
        val = _eval_arithmetic(am.group(2))
        if val is not None:
            text = _remove(text, am.start(), am.end())
            return val, am.group(1) == "+", text
    # Explicit sign first, e.g. +85000, -250, +5k
    m = re.search(
        r"([+-])\s?(?:rs\.?|inr|₹|\$)?\s?(\d[\d,]*(?:\.\d+)?)\s?" + _SUFFIX_RE + r"?(?:\s*(?:rs\.?|inr|rupees?|rupaye|rupiya))?\b", text, re.IGNORECASE
    )
    if m:
        sign = m.group(1)
        num = _apply_suffix(float(m.group(2).replace(",", "")), m.group(3))
        text = _remove(text, m.start(), m.end())
        return num, sign == "+", text
    # Plain number, optionally with currency prefix and k/l/cr suffix (not part of a date like 10/05 or 5th)
    for m in re.finditer(
        r"(?:rs\.?|inr|₹|\$)?\s?(\d[\d,]*(?:\.\d+)?)\s?" + _SUFFIX_RE + r"?(?:\s*(?:rs\.?|inr|rupees?|rupaye|rupiya))?\b", text, re.IGNORECASE
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

    # today / yesterday / tomorrow - use pre-compiled patterns
    for word, delta in (("today", 0), ("yesterday", -1), ("tomorrow", 1)):
        m = _DATE_WORDS_RE[word].search(lower)
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
    return desc.title().replace("'T", "'t").replace("'S", "'s")


def parse_transaction(text: str, today: datetime | None = None) -> dict:
    """Parse a natural-language string into a transaction dict."""
    start_time = time.time()
    today = today or datetime.now()
    original = text.strip()
    working = " " + original + " "

    # Check for "X of Y each" or "X each" pattern first
    working, each_enum = _extract_typed_each_pattern(working)

    method, working = _detect_payment(working)
    quantity, working = _detect_quantity(working)
    amount_abs, explicit_pos, working = _detect_amount(working)
    date_str, working = _detect_date(working, today)
    category = _detect_category(original)
    description = _clean_description(working, category)

    # Sign logic: explicit + OR income signal word -> positive, else negative.
    lower = original.lower()
    income_signal = bool(_INCOME_WORDS_RE.search(lower))
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

    # Apply "X of Y each" enumeration if found
    if each_enum:
        result["quantity"] = each_enum["quantity"]
        result["amount"] = -abs(each_enum["amount"]) if not is_income else abs(each_enum["amount"])
        result["price_text"] = each_enum["breakdown"]

    # Local ML fallback when regex couldn't classify the category
    if category == "Other":
        ml_start = time.time()
        ml_category = ml_nlp.classify_transaction(original)
        if ml_category and ml_category != "Other":
            result["category"] = ml_category
        logger.debug("ML classification took %.3fs for: %s", time.time() - ml_start, original[:50])

        ml_result = ml_nlp.parse_transaction_local(original)
        if ml_result:
            for key in ("description", "payment_method"):
                if ml_result.get(key) and (key != "description" or not each_enum):
                    result[key] = ml_result[key]
            if ml_result.get("category") and ml_result["category"] != "Other":
                result["category"] = ml_result["category"]
            if ml_result.get("date"):
                result["date"] = ml_result["date"]
            # Only borrow the ML amount when the regex found none AND no counted
            # quantity was detected — otherwise the ML parser would mistake the
            # item count ("2 packet") for the price.
            if amount_abs is None and quantity == 1 and not each_enum and ml_result.get("amount") not in (None, 0):
                try:
                    result["amount"] = float(ml_result["amount"])
                except (TypeError, ValueError):
                    pass

    # Gemini fallback ONLY when local ML also couldn't classify the category
    if result["category"] == "Other" and ai.is_enabled():
        gemini_start = time.time()
        enriched = _gemini_parse(original, today)
        logger.debug("Gemini parse took %.3fs for: %s", time.time() - gemini_start, original[:50])
        if enriched:
            for key in ("description", "category", "payment_method"):
                if enriched.get(key) and (key != "description" or not each_enum):
                    result[key] = enriched[key]
            if enriched.get("date"):
                result["date"] = enriched["date"]
            if enriched.get("amount") not in (None, 0):
                try:
                    result["amount"] = float(enriched["amount"])
                except (TypeError, ValueError):
                    pass

    # No future-dated transactions — clamp anything past today (e.g. "tomorrow"
    # or an explicit future date) down to today, from regex, ML or Gemini.
    today_str = today.strftime("%Y-%m-%d")
    if result.get("date") and result["date"] > today_str:
        result["date"] = today_str

    # A transaction with a negative amount is an expense and can never belong
    # to the "Income" category. The local ML model treats "credit" as an income
    # signal, so an expense like "credit card bill 5000" would otherwise be
    # mislabelled Income even though its signed amount is a debit. Reclassify
    # any contradiction between sign and category.
    if result["amount"] < 0 and result["category"] == "Income":
        result["category"] = "Other"

    result["txn_type"] = "credit" if result["amount"] >= 0 else "debit"
    _set_unit_price(result)
    
    total_time = time.time() - start_time
    if total_time > 1.0:
        logger.warning("Slow parse (%.3fs) for: %s", total_time, original[:50])
    elif total_time > 0.5:
        logger.debug("Parse took %.3fs for: %s", total_time, original[:50])
    
    return result


def _set_unit_price(parsed: dict) -> dict:
    """Stamp the per-item price (quantity × price = |amount|), mirroring the
    Quantity / Price / Total Amount columns of the expense sheet format."""
    qty = parsed.get("quantity") or 1
    if qty < 1:
        qty = 1
    parsed["price"] = round(abs(parsed.get("amount", 0) or 0) / qty, 2)
    return parsed


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


def _explicit_recurring_day(text: str) -> int | None:
    """The day-of-month explicitly named in the text, or None when unspecified."""
    lower = text.lower()
    for pat in (
        r"\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b",
        r"\b(\d{1,2})(?:st|nd|rd|th)\s+(?:of\s+)?(?:each|every)\s+month\b",
    ):
        m = re.search(pat, lower)
        if m:
            return min(max(int(m.group(1)), 1), 31)
    return None


def _extract_recurring_day(text: str, default: int = 1) -> int:
    """Day-of-month for a recurring schedule, falling back to ``default``.

    The day is taken only from what the user actually typed (``on 5th``,
    ``2nd of every month``, …); no keyword-based defaults are applied here.
    """
    explicit = _explicit_recurring_day(text)
    return default if explicit is None else explicit


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
    """Parse a recurring schedule like 'salary +5k on 1st every month'.

    The day-of-month comes only from what the user states (``on 5th``,
    ``salary on 1st``…), defaulting to 1 when nothing is given — no keyword
    defaults are forced on SIP or salary. The caller (or the preview's
    "Day of month" field) can set any date.
    """
    today = today or datetime.now()
    original = text.strip()
    lower = original.lower()
    months = _extract_months(original, today)
    day = _extract_recurring_day(original)
    base_text = _strip_schedule_phrases(original)
    base = parse_transaction(base_text or original, today)

    if not months:
        start = today.strftime("%Y-%m")
        months = [_ym_add(start, i) for i in range(12)]

    is_sip = "sip" in lower or "mutual fund" in lower or "mutual funds" in lower
    if is_sip and not base["payment_method"]:
        base["payment_method"] = "Online"

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
    """Parse NL text as a single transaction or a recurring schedule.

    When the line lists several priced items ("banana + mango 50+20",
    "banana 50 mango 20"), a ``fragments`` array of separate transaction
    dicts is attached so the UI can offer splitting them apart. The main
    result stays the combined transaction.
    """
    today = today or datetime.now()
    original = text.strip()
    if not original:
        raise ValueError("Empty input")
    if _is_recurring(original):
        return parse_recurring(original, today)
    result = parse_transaction(original, today)
    result["kind"] = "single"
    fragments = fragment_transactions(original, today)
    if fragments:
        result["fragments"] = fragments
        # The combined "keep as one" entry is the SUM of its items, with a clean
        # joined description — otherwise a leading count ("2 samosay 50 …") would
        # be misread as the whole amount, and numbers would leak into the name.
        result["amount"] = round(sum(f["amount"] for f in fragments), 2)
        result["description"] = " + ".join(f["description"] for f in fragments)
        result["quantity"] = 1
        result["txn_type"] = "credit" if result["amount"] >= 0 else "debit"
        _set_unit_price(result)
    return result


# --------------------------------------------------------------------------- #
# Multi-item fragmentation ("banana + mango 50+20" -> two transactions)
# --------------------------------------------------------------------------- #

# Separators between item descriptions: "banana + mango", "chai 10 aur samosa 15".
_ITEM_LIST_SEPARATOR_RE = re.compile(
    r"\s*[+&,;]\s*|\s+(?:and|aur)\s+", re.IGNORECASE
)
# Words and numbers, in order — used to walk an alternating item/price list.
_ITEM_TOKEN_RE = re.compile(r"[A-Za-z]+|\d+(?:\.\d+)?")


def _typed_item_fragments(text: str) -> list[str]:
    """Break a typed multi-item line into per-item strings, keeping each item's
    own words (quantity, payment method) so every item parses independently.

    Recognised shapes:
      * "banana + mango 50+20"          — item list + price list, zipped
      * "banana 50 mango 20"            — alternating item/price pairs
      * "2 samosay 50 upi and 1 cup coffe 15 cash" — items joined by
        and / aur / & / + / ,, each keeping its own quantity + payment method.

    Returns [] when the line is a single transaction or not cleanly splittable,
    so callers can fall back to the combined entry.
    """
    text = text.strip()
    if not text:
        return []

    # (a) and/aur separated items — same rule as the voice path. Every fragment
    # must carry a price AND a description word, so "zomato 450 and 500" (a bare
    # number as a "second item") never fragments.
    parts = [p.strip(" -") for p in _ITEM_SPLIT_RE.split(text) if p.strip(" -")]
    if len(parts) >= 2:
        items: list[str] = []
        buffer = ""
        for part in parts:
            buffer = f"{buffer} {part}".strip() if buffer else part
            if re.search(r"\d", buffer):
                items.append(buffer)
                buffer = ""
        if buffer:
            if items:
                items[-1] = f"{items[-1]} {buffer}".strip()
            else:
                items.append(buffer)
        if len(items) >= 2 and all(re.search(r"[A-Za-z]", it) for it in items):
            return items

    # A counted quantity ("2 packet", "3 plate") means ONE grouped item, not a
    # list of separate transactions ("maggi 2 packet 20") — never fragment.
    if _detect_quantity(text)[0] > 1:
        return []

    # (b) "<items> <price-list>", e.g. "banana + mango 50+20". The price list
    # must be a pure +-chain of two or more numbers (so "15*2+20", a single
    # basket total, is left alone); a short tail of words (payment method, date)
    # is allowed after it.
    m = re.match(
        r"^(?P<desc>.+?)\s+(?P<prices>\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)"
        r"(?:\s+[\w/.\-]+)*\s*$",
        text,
    )
    if m:
        desc_part = m.group("desc").strip()
        prices = [float(p) for p in re.split(r"\s*[+]\s*", m.group("prices"))]
        items = [
            d.strip() for d in _ITEM_LIST_SEPARATOR_RE.split(desc_part) if d.strip()
        ]
        if len(items) == len(prices) >= 2 and all(len(d) >= 2 for d in items):
            return [f"{d} {p:g}" for d, p in zip(items, prices)]

    # (c) alternating word-run / number pairs, e.g. "banana 50 mango 20".
    # Separators are collapsed to spaces first so "+" / "&" / "and" / "aur"
    # between pairs never leak into a description. A number with an empty
    # word-run (adjacent numbers) or a trailing word-run with no price means
    # this is something else ("maggi 2 packet 20", "flight 6e 2345") — bail out.
    plain = _ITEM_LIST_SEPARATOR_RE.sub(" ", text)
    pairs: list[tuple[str, float]] = []
    words: list[str] = []
    for tok in _ITEM_TOKEN_RE.findall(plain):
        if tok[0].isalpha():
            words.append(tok)
        else:
            if not words:
                return []
            pairs.append((" ".join(words), float(tok)))
            words = []
    if words:
        return []
    if len(pairs) < 2 or any(len(desc) < 2 for desc, _ in pairs):
        return []
    return [f"{d} {p:g}" for d, p in pairs]


def _has_date_indicator(text: str) -> bool:
    """True when a line explicitly mentions a date (relative word, weekday, or a
    dd/mm / ordinal date) rather than leaving the date defaulted to today.

    ``_detect_date`` always returns *a* date (today on fall-through), so a
    fragment must know whether "yesterday" on the whole line was a real signal
    worth inheriting, or merely the parser's default for the sub-item.
    """
    lower = text.lower()
    if re.search(r"\btoday\b|\byesterday\b|\btomorrow\b", lower):
        return True
    if re.search(r"\b\d+\s+days?\s+ago\b", lower):
        return True
    if re.search(
        r"\b(?:last|this|coming|next)\s+(" + "|".join(WEEKDAYS) + r")\b", lower
    ):
        return True
    if re.search(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", lower):
        return True
    if re.search(
        r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:" + _MONTH_NAMES + r")\b|\b(?:" + _MONTH_NAMES + r")\s+\d{1,2}(?:st|nd|rd|th)?\b",
        lower,
    ):
        return True
    return False


def _parse_typed_fragment(text: str, today: datetime) -> dict:
    """Parse one typed sub-item, honouring a leading count as quantity.

    "2 samosay 50 upi" -> Samosay, qty 2, ₹50 total (₹25 each), payment UPI.
    """
    lead_qty, rest = _extract_lead_quantity(text)
    rest = rest.strip() or text
    parsed = parse_nl_input(rest, today)
    parsed.pop("fragments", None)  # never nest fragment lists
    if lead_qty is not None:
        parsed["quantity"] = lead_qty
    return _set_unit_price(parsed)


def fragment_transactions(text: str, today: datetime | None = None) -> list[dict]:
    """Split a single NL line into separate transactions when it lists several
    priced items ("banana + mango 50+20" -> banana ₹50 + mango ₹20).

    Every item keeps its OWN category, quantity and payment method
    ("2 samosay 50 upi and 1 cup coffe 15 cash" -> Samosay/UPI + Coffe/Cash).
    Only a missing date (and a missing payment method) falls back to the whole
    line, so shared context like "yesterday upi" applies to all items.
    Returns [] when the line isn't a clean multi-item list.
    """
    today = today or datetime.now()
    subs = _typed_item_fragments(text)
    if len(subs) < 2:
        return []
    base = parse_transaction(text, today)
    fragments: list[dict] = []
    for sub in subs:
        parsed = _parse_typed_fragment(sub, today)
        # Per-item context wins; a shared date/payment from the whole line is
        # inherited only when the item doesn't carry its own. A date is only
        # copied from the line when the line explicitly stated one ("yesterday",
        # "on 15/06") — parse_transaction otherwise defaults every item to today.
        if _has_date_indicator(text):
            parsed["date"] = base.get("date") or parsed.get("date")
        parsed["payment_method"] = (
            parsed.get("payment_method") or base.get("payment_method") or ""
        )
        # An expense list stays expenses even if a word in it hints at income;
        # an income list keeps each fragment's own sign.
        if base.get("amount", 0) < 0 and parsed.get("amount", 0) > 0:
            parsed["amount"] = -parsed["amount"]
        parsed["txn_type"] = "credit" if parsed["amount"] >= 0 else "debit"
        _set_unit_price(parsed)
        parsed["kind"] = "single"
        fragments.append(parsed)
    return fragments


def parse_bulk_lines(text: str, today: datetime | None = None) -> list[dict]:
    """Parse multiple NL lines (one transaction or schedule per line).

    A line that itself lists several priced items is expanded into its
    fragments ("2 samosay 50 upi and 1 cup coffe 15 cash" becomes two entries),
    so every parsing path — single, bulk, voice — splits multi-item input the
    same way.
    """
    today = today or datetime.now()
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parsed = parse_nl_input(line, today)
        fragments = parsed.get("fragments")
        if fragments:
            items.extend(fragments)
        else:
            items.append(parsed)
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


def _extract_typed_each_pattern(text: str) -> tuple[str, dict | None]:
    """Extract 'X of Y each' or 'X each' patterns from typed input.

    Examples:
      "2 packets of 20 rs each" -> quantity=2, amount=40, breakdown="2×₹20"
      "20 each" -> quantity=1, amount=20, breakdown="1×₹20"
      "2 of 20 rs each" -> quantity=2, amount=40, breakdown="2×₹20"

    quantity, amount, and breakdown, or None if no pattern found.
    """
    m = _TYPED_EACH_RE.search(text)
    if not m:
        return text, None

    # The regex has two alternatives:
    # Alternative 1: "2 packets of 20 each" -> group 1 (quantity), then extract price from match
    # Alternative 2: "20 each" -> extract price from match, quantity=1

    matched_text = m.group(0)

    # Extract all numbers from the matched text
    numbers = re.findall(r"\d+(?:\.\d+)?", matched_text)

    if len(numbers) >= 2:
        # "2 packets of 20 each" -> quantity=2, price=20
        quantity = int(float(numbers[0]))
        price = float(numbers[1])
    elif len(numbers) == 1:
        # "20 each" -> quantity=1, price=20
        quantity = 1
        price = float(numbers[0])
    else:
        return text, None

    total = quantity * price
    breakdown = f"{quantity:g}×₹{price:g}"

    # Remove the pattern from text
    text = text[:m.start()] + text[m.end():]
    text = re.sub(r"\s{2,}", " ", text).strip()

    enumeration = {
        "quantity": max(quantity, 1),
        "amount": total,
        "breakdown": breakdown
    }

    return text, enumeration


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
    # Quantity/amount may have been overridden above — re-derive price.
    return _set_unit_price(parsed)


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
