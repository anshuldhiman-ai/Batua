"""Local ML/NLP-based transaction parsing without external API dependencies.

The module has three layers, in order of confidence:

1. ``keyword_category`` — exact-phrase match against a curated merchant
   dictionary (very high confidence).
2. ``TransactionClassifier`` — a TF-IDF + Logistic Regression model trained on a
   curated dataset of realistic Indian transaction descriptions. Catches
   the long tail of merchants the keyword dict doesn't know about.
3. Gemini fallback (handled in parser.py) — only for ambiguous cases.
"""
import hashlib
import json
import logging
import os
import re
from collections import OrderedDict
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("batua.ml_nlp")

_DATA_DIR = Path(__file__).resolve().parent / "data"
_TRAINING_JSON = _DATA_DIR / "training_data.json"
_MODEL_PATH = _DATA_DIR / "classifier.joblib"
_PREDICT_CACHE_SIZE = 50_000


# --------------------------------------------------------------------------- #
# Category keyword dictionary
# --------------------------------------------------------------------------- #
# Curated merchant / phrase list. Each entry is matched as a whole word (with
# optional hyphen/space variants). Order matters inside the loop — keep
# brand names before generic terms so "amazon prime" beats "amazon" if we
# wanted to, but since we map all "amazon*" → Shopping here that's fine.

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    # ---- Order matters: first match wins. Specific categories go BEFORE
    # broad/greedy ones so they catch their own hits first. -----------------
    "Income": [
        "salary", "income", "refund", "cashback", "credited", "credit",
        "bonus", "interest", "dividend", "received", "stipend", "freelance",
        "reimbursement", "payout", "deposit", "pocket money", "allowance",
        "gift", "gifted", "prize", "won", "sold", "returns", "rebate",
        "scholarship", "paycheck", "remuneration", "honorarium", "gratuity",
        "rent received", "tenant", "interest credited", "fd interest",
        "dividend credit", "tax refund", "tds refund", "upi collect",
        "received from", "credited by", "salary credit", "monthly salary",
        "neft credit", "imps credit", "salary ac", "salary a/c",
    ],
    # Health BEFORE Shopping so "lenskart eyeglasses" → Health, not Shopping.
    "Health": [
        "pharmacy", "medical", "medicine", "tablets", "capsules", "syrup",
        "doctor", "dr.", "dr ", "hospital", "apollo", "apollo pharmacy",
        "medplus", "pharmeasy", "1mg", "tata 1mg", "netmeds", "truemeds",
        "wellness forever", "healthkart", "healthkart.com",
        "clinic", "polyclinic", "dental", "dentist", "dental care",
        "eye doctor", "eye checkup", "optical", "lenskart", "specsmakers",
        "lab test", "lab", "pathology", "thyrocare", "srl diagnostics",
        "metropolis", "lal path labs", "dr lal", "health checkup", "full body",
        "consultation", "consult", "opd", "ipd", "surgery", "operation",
        "physiotherapy", "physio", "yoga therapy", "mental health",
        "practo", "practo consult", "mfine", "tata health", "healthifyme",
        "weight loss", "dietitian", "nutritionist", "supplement", "whey",
        "protein", "multivitamin", "first aid", "mask",
        "blood test", "x-ray", "xray", "mri", "ct scan", "sonography",
        "eyeglasses", "spectacles", "contact lens",
    ],
    # Housing BEFORE Utilities so "society maintenance" → Housing, not Utilities.
    "Housing/Rent": [
        "rent", "house rent", "apartment rent", "flat rent", "room rent",
        "pg rent", "paying guest", "hostel", "hostel fee",
        "society maintenance", "maintenance charge", "maintenance bill",
        "society", "apartment", "flat", "house", "builder", "landlord",
        "lease", "rental agreement", "property broker",
        "stamp duty", "home loan",
        "housing loan", "mortgage", "loan emi", "loan repayment",
    ],
    # Education BEFORE Subscriptions so "Coursera plus subscription" → Education.
    "Education": [
        "course", "courses", "udemy", "coursera", "udacity", "edx",
        "khan academy", "skillshare", "pluralsight", "linkedin learning",
        "masterclass", "school", "school fee", "school fees", "college",
        "college fee", "tuition", "tuition fee", "tuition fees",
        "coaching", "coaching class", "byjus", "byju's",
        "unacademy", "vedantu", "whitehat jr", "whitehatjr", "cuemath",
        "toppr", "doubtnut", "extramarks", "meritnation",
        "exam", "exam fee", "exam fees", "exam form", "registration fee",
        "tet", "tet form", "form fill", "application form",
        "fees", "books", "textbook", "novel",
        "stationery", "pen", "pencil", "notebook",
        "school bag", "school uniform",
        "online class", "live class", "test series", "mock test",
        "upsc", "gate", "jee", "neet", "cat", "gre", "toefl", "ielts",
    ],
    # Entertainment BEFORE Subscriptions so "PlayStation Plus" → Entertainment.
    "Entertainment": [
        "movie", "movies", "cinema", "bookmyshow", "bms", "paytm movies",
        "pvr", "pvr cinemas", "inox", "inox movies", "carnival cinemas",
        "cinepolis", "mukta a2", "miraj", "miraj cinemas", "movie ticket",
        "movie tickets", "film", "film ticket", "game", "games", "gaming",
        "concert", "theatre", "theater", "play", "stand up", "standup comedy",
        "amusement park", "theme park", "imagica", "wonderla", "essel world",
        "water park", "nicco park", "bowling", "trampoline",
        "playstation", "ps plus", "psn", "xbox", "xbox game pass", "game pass",
        "nintendo", "steam", "epic games", "epicgames", "valorant", "pubg",
        "free fire", "minecraft", "roblox", "call of duty", "fifa",
        "spotify family", "audible listen", "live show",
    ],
    "Personal Care": [
        "salon", "haircut", "hair cut", "hair salon", "spa", "spa treatment",
        "grooming", "cosmetics", "skincare", "skin care", "barber", "barbershop",
        "parlour", "parlor", "beauty parlour", "beauty parlor", "makeup",
        "bridal makeup", "mehandi", "mehndi", "manicure", "pedicure",
        "facewash", "face wash", "cleanser", "moisturizer", "sunscreen",
        "shampoo", "conditioner", "hair oil", "hair color", "hair dye",
        "bodywash", "body wash", "soap",
        "deodorant", "perfume", "fragrance", "cologne", "toothpaste",
        "tooth brush", "toothbrush", "floss", "mouthwash", "razor",
        "shaving cream", "after shave", "aftershave", "trim", "waxing",
        "threading", "bleach", "facial", "cleanup", "body polish",
        "urbanic", "plum", "mamaearth", "wow", "biotique", "himalaya",
        "dove", "tresemme", "loreal", "l'oreal", "olay", "pond's",
        "ponds", "garnier", "nykaa", "smytten", "purplle",
    ],
    # Food Delivery BEFORE Food & Dining so "zomato dinner order" or
    # "box8 lunch box" classify as delivery (user's intent) and not generic
    # dining.
    "Food Delivery": [
        "swiggy", "zomato", "foodpanda", "ubereats", "uber eats",
        "eatsure", "dunzo", "magicpin", "eazydiner", "box8", "box 8",
        "freshmenu", "faasos", "behrouz", "ovenstory", "licious",
        "fresh to home", "country delight", "biryani blues", "bikkgane",
        "kfc delivery", "mcdelivery", "dominos delivery", "pizza hut delivery",
        "wow momo", "haldiram online",
        "food delivery", "online food", "delivery order", "delivery charge",
        "delivery tip",
    ],
    # Food & Dining AFTER Food Delivery but BEFORE Snacks so "starbucks
    # coffee" → Food & Dining while "zomato dinner order" stays Food Delivery.
    "Food & Dining": [
        "restaurant", "dine", "dining", "cafe", "cafeteria", "dosa", "idli",
        "vada", "paneer", "biryani", "pizza", "burger", "kfc", "mcdonald",
        "mcd", "dominos", "domino's", "dominoes", "thali", "lunch", "dinner",
        "breakfast", "meal", "meals", "buffet", "starbucks", "barbeque",
        "nation", "barbeque nation", "chinese", "tandoor", "tadka",
        "mughlai", "north indian", "south indian", "street food", "chaat",
        "paratha", "parantha", "paratntha", "aloo paratha", "aloo parantha",
        "paneer paratha", "gobi paratha", "methi paratha", "mix paratha",
        "roti", "naan", "kulcha", "bhature", "bhatura", "chole bhature",
        "chole bhatura", "dal makhani", "dal tadka", "paneer butter masala",
        "butter chicken", "chicken curry", "mutton curry", "fish curry",
        "veg thali", "non veg thali", "punjabi thali", "south indian thali",
        "biryani zone", "behrouz biryani", "punjabi tadka", "punjabi by nature",
        "takatak", "taka tak", "bikanervala", "bikanerwala", "haldiram restaurant",
        "sagar ratna", "saravana bhavan", "mtr", "nandini", "rajdhani thali",
        "panchavati", "goli vada pav", "goli vada", "faasos", "lunch box",
        "oven story", "tiffin", "mess", "canteen", "food court", "dhaba",
        "baker", "bakery", "cake shop", "eat fit", "eatfit", "slimmeal",
        "health kitchen", "mainland china", "haldiram", "haldiram take away",
        "cafe coffee day", "ccd", "barista", "blue tokai", "third wave coffee",
        "chai point", "wow momo", "momo", "momos", "roll", "kathi roll",
        "frankie", "shawarma", "kebab", "tikka", "tandoori", "seekh kebab",
        "pav bhaji", "misal pav", "vada pav", "dabeli", "dhokla", "khandvi",
        "poha", "upma", "uttapam", "appam", "puttu", "idiyappam", "pesarattu",
        "pongal", "rasam", "sambar", "curd rice", "lemon rice", "fried rice",
        "noodles", "manchurian", "sizzler", "sizzlers", "soup", "salad bar",
    ],
    # Snacks AFTER Food & Dining so "starbucks coffee" doesn't get stolen.
    "Snacks": [
        "lays", "chips", "kurkure", "namkeen", "bhujia", "mixture",
        "samosa", "kachori", "vada pav", "pav bhaji", "bhel", "sev",
        "pakora", "pakode", "bread pakora", "golgappa", "golgappe",
        "gol gappa", "gol gappe", "panipuri",
        "pani puri", "dahi puri", "papdi chaat",
        "biscuit", "biscuits", "parle", "britannia", "hide & seek",
        "good day", "bourbon", "oreo", "cookie", "cookies", "cracker",
        "chocolate", "dairy milk", "kitkat", "kit kat", "munch", "5 star",
        "fivestar", "perk", "silk", "snickers", "mars", "twix", "bounty",
        "ferrero", "maggi", "cup noodles", "yippee", "top ramen",
        "maggi noodles", "chai", "tea", "cold coffee", "latte",
        "cappuccino", "americano", "espresso", "mocha", "filter coffee",
        "juice", "fresh juice", "milkshake", "smoothie", "lassi", "butter milk",
        "buttermilk", "cold drink", "coke", "pepsi", "sprite", "fanta",
        "thums up", "limca", "maaza", "frooti", "slice", "appy",
        "ice cream", "icecream", "gelato", "kulfi", "chocolate bar",
        "pastry", "donut", "doughnut", "muffin", "cupcake", "croissant",
        "snack", "snacks", "evening snacks",
        "mad angle", "mad angles", "tedhe medhe", "too yumm", "tooyum",
        "karare", "snaclite", "snac lite", "oyes", "choco pie", "chocopie",
        "dark fantasy", "cornetto", "patties", "patty", "puffs",
        "jalebi", "imarti", "gulab jamun", "rasgulla", "barfi", "ladoo",
        "laddu", "coffee", "cake", "cup cake", "shake", "brownie",
    ],
    # Subscriptions — only specific brand names. Bare "subscription" /
    # "premium" / "membership" steal matches from Entertainment / Education
    # / Personal Care.
    "Subscriptions": [
        "netflix", "spotify", "prime video", "amazon prime", "hotstar",
        "disney hotstar", "disney+", "sony liv", "zee5", "jio cinema",
        "voot", "mx player", "youtube premium", "youtube music", "apple music",
        "apple tv", "apple tv+", "apple one", "apple arcade", "apple icloud",
        "icloud", "icloud storage", "icloud+", "google one", "google play pass",
        "microsoft 365", "office 365", "ms365", "adobe", "adobe creative",
        "canva pro", "figma", "notion", "dropbox", "github copilot",
        "chatgpt", "chat gpt", "openai", "anthropic", "claude",
        "perplexity", "grammarly", "audible", "kindle unlimited",
        "gym membership", "cult fit", "cultfit", "cure.fit", "curefit",
        "gold's gym", "gold gym", "anytime fitness", "fitness first",
    ],
    # Generic "milk" / "dairy" removed — Snacks above catches "Dairy Milk".
    # Use specific brand names so the keyword doesn't steal from Snacks.
    "Groceries": [
        "blinkit", "zepto", "bigbasket", "big basket", "grofers", "dmart",
        "d mart", "jiomart", "jio mart", "reliance fresh", "more retail",
        "spencer's", "spencers", "nature's basket", "lifestyle food",
        "godrej nature's basket", "easyday", "smart bazaar",
        "kirana", "kirana store", "grocery", "groceries", "supermarket",
        "super market", "vegetables", "veggies", "fruits",
        "mother dairy", "amul", "amul milk", "bread", "eggs",
        "provision store", "general store", "ration",
        "departmental store", "food bazaar", "foodworld",
        "ratnadeep", "more megastore", "spar hypermarket", "star bazaar",
        "hypercity", "reliance smart", "walmart", "costco", "lulu mall",
        "milk basket", "milkbasket", "freshmenu groceries", "dailyneeds",
    ],
    "Fuel": [
        "petrol", "diesel", "fuel", "cng", "lpg refill", "lpg cylinder",
        "hp petrol", "hpcl", "hindustan petroleum", "bharat petroleum",
        "bpcl", "indian oil", "iocl", "shell", "shell petrol", "essar",
        "reliance petroleum", "nayara", "pump", "filling station",
        "gas station", "petrol pump", "diesel pump", "auto gas",
        "speed", "speed petrol", "fasttrack", "fast track fuel",
    ],
    "Investments": [
        "sip", "lumpsum", "lump sum", "mutual fund", "mutual funds",
        "stock", "stocks", "shares", "equity", "investment", "invested",
        "invest", "investing",
        "ppf", "nps", "elss", "fd", "fixed deposit", "rd", "recurring deposit",
        "nsc", "kvp", "scss", "sukanya", "sssy", "pomis", "post office",
        "gold bond", "sovereign gold bond", "sgb", "etf", "bond", "bonds",
        "demat", "trading account", "demat account",
        "zerodha", "groww", "upstox", "angel one", "angel broking",
        "5paisa", "paytm money", "kuvera", "coin", "coin by zerodha",
        "etmoney", "mfc", "motilal oswal", "hdfc securities", "icici direct",
        "kotak securities", "sharekhan", "axis direct", "bob caps",
        "crypto", "bitcoin", "btc", "ethereum", "eth", "wazirx",
        "coinswitch", "coindcx", "zebpay",
        "term insurance", "term plan", "health insurance", "life insurance",
        "hdfc life", "icici prudential", "sbi life", "max life", "tata aia",
        "policy premium", "ulip",
    ],
    "Transportation": [
        "ola", "uber", "rapido", "auto", "rickshaw", "metro", "delhi metro",
        "mumbai metro", "bengaluru metro", "bangalore metro", "bus",
        "tc bus", "best bus", "dtc", "bmtc", "train", "irctc", "irctc e-ticket",
        "railway", "railways", "cab", "taxi", "prepaid taxi", "kaali peeli",
        "redbus", "abhibus", "make my trip bus", "mmt bus", "flight",
        "indigo", "vistara", "spicejet", "go air", "goair", "air india",
        "airindia", "airasia", "emirates", "etihad", "lufthansa",
        "british airways",
        "toll", "toll plaza", "fastag", "fast tag", "parking", "parking fee",
        "valet parking", "vehicle service", "car service", "bike service",
        "car wash", "bike wash", "ola cab", "uber cab", "rapido bike",
        "rapido auto", "rapido cab", "intercity", "outstation", "rental",
        "self drive", "zoomcar", "revv", "bounce", "yulu", "lime", "bird",
        "metro card recharge", "metro pass", "monthly pass",
    ],
    "Shopping": [
        "amazon", "flipkart", "myntra", "ajio", "meesho", "snapdeal",
        "shopclues", "paytm mall", "tata cliq", "tatacliq", "croma",
        "reliance digital", "vijay sales", "samsung shop", "apple store",
        "mi store", "oneplus store", "boat store", "noise store",
        "shopping", "shop", "mall", "city mall", "select city walk",
        "phoenix mall", "express avenue", "ambience mall", "nexus mall",
        "headphones", "earphones", "earbuds", "smartwatch", "smart watch",
        "clothes", "clothing", "apparel", "shoes", "footwear", "sneakers",
        "sandals", "electronics", "gadget", "gadgets", "mobile phone",
        "smartphone", "laptop", "tablet", "tv", "television", "camera",
        "watch", "wristwatch", "tshirt", "t-shirt", "shirt", "jeans",
        "trousers", "kurta", "saree", "lehenga", "dress", "cap", "belt",
        "wallet", "bag", "backpack", "handbag", "purse", "sunglasses",
        "jewelry", "jewellery", "necklace", "ring",
        "earring", "bangle", "lipstick", "kajal",
        "decathlon", "nike", "adidas", "puma", "reebok", "levis", "levi's",
        "zara", "h&m", "vero moda", "global desi",
        "biba", "lifestyle", "pantaloons",
        "shoppers stop", "central", "westside", "max fashion", "max",
    ],
    # Removed bare "premium" (greedy — stole Spotify Premium). Removed
    # "society maintenance" / "maintenance bill" / "lens" / "specs" / etc.
    # — they belong elsewhere. Also removed "hdfc life premium" — the
    # Investments entry has "hdfc life" so it wins.
    "Utilities": [
        "electricity", "electricity bill", "power bill", "bescom", "msedcl",
        "tata power", "adani electricity", "bses", "water bill", "water tax",
        "gas bill", "piped gas", "igl", "mgl", "gujarat gas",
        "indraprastha gas",
        "broadband", "wifi", "internet", "internet bill", "fiber", "ftth",
        "airtel", "jio fiber", "jio fibre", "jiofiber", "jiofi", "vodafone",
        "vi postpaid", "vi prepaid", "bsnl", "mtnl", "dth", "tata sky",
        "tatasky", "dish tv", "dishtv", "sun direct", "sundirect", "d2h",
        "bill payment", "bill pay", "postpaid", "prepaid", "mobile recharge",
        "recharge", "data recharge", "top up", "topup",
        "license", "licence", "driving license", "dl", "rto",
        "vehicle registration", "challan", "traffic challan", "parking challan",
        "property tax", "house tax", "municipal tax",
        "gas cylinder", "lpg booking", "indane", "bharat gas",
        "insurance premium", "lic premium",
    ],
}

PAYMENT_METHODS = {
    "UPI": ["upi", "gpay", "google pay", "phonepe", "phone pe", "paytm",
            "bhim", "bhim upi", "ybl", "okaxis", "okhdfcbank", "okicici",
            "ibl", "airtel payments bank", "amazon pay upi", "whatsapp pay"],
    "Credit Card": ["credit card", "creditcard", "cc", "visa cc", "mastercard cc",
                    "amex", "american express", "hdfc credit card", "icici credit card",
                    "axis credit card", "sbi credit card", "hsbc credit card"],
    "Debit Card": ["debit card", "debitcard", "card", "dc"],
    "Cash": ["cash", "by cash"],
    "Wallet": ["wallet", "amazon pay", "mobikwik", "freecharge", "olamoney",
               "ola money", "paytm wallet", "jiomoney", "jio money"],
    "Net Banking": ["net banking", "netbanking", "neft", "imps", "rtgs", "imps transfer",
                    "neft transfer", "bank", "online", "auto debit", "auto-debit"],
}

INCOME_CATEGORIES = {"Income"}
AMOUNT_RE = re.compile(
    r"([+-])?\s*(?:rs\.?|inr|₹|\$)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh|lac|cr|crore)?\b",
    re.IGNORECASE,
)
SUFFIX_MULTIPLIERS = {"k": 1e3, "l": 1e5, "lakh": 1e5, "lac": 1e5, "cr": 1e7, "crore": 1e7}


# --------------------------------------------------------------------------- #
# Keyword classification
# --------------------------------------------------------------------------- #

# Common Indian food / restaurant typos seen in bank SMS and UPI descriptions.
_FOOD_TYPO_FIXES: Tuple[Tuple[re.Pattern, str], ...] = (
    (re.compile(r"\bparanthas?\b", re.I), "paratha"),
    (re.compile(r"\bparatntha\b", re.I), "paratha"),
    (re.compile(r"\bparota\b", re.I), "paratha"),
    (re.compile(r"\bbhaturas?\b", re.I), "bhature"),
    (re.compile(r"\bchole\s+bhaturas?\b", re.I), "chole bhature"),
    (re.compile(r"\btaka\s*tak\b", re.I), "takatak"),
    (re.compile(r"\bpunjabi\s+tadkas?\b", re.I), "punjabi tadka"),
    (re.compile(r"\bdosa[s]?\b", re.I), "dosa"),
    (re.compile(r"\bidli[s]?\b", re.I), "idli"),
    (re.compile(r"\bvada[s]?\b", re.I), "vada"),
    (re.compile(r"\bmomo[s]?\b", re.I), "momo"),
)


def normalize_for_classification(text: str) -> str:
    """Fix frequent food-description typos before keyword / ML classification."""
    if not text:
        return text
    out = text.lower().strip()
    for pattern, replacement in _FOOD_TYPO_FIXES:
        out = pattern.sub(replacement, out)
    return out


@lru_cache(maxsize=8192)
def _keyword_pattern(keyword: str) -> re.Pattern:
    # Escape, then re-allow internal spaces by replacing escaped "\ " with \s+.
    # Cached: the same ~960 keyword patterns are matched against every row, so
    # recompiling them per call dominated bulk-import time.
    escaped = re.escape(keyword).replace(r"\ ", r"\s+")
    return re.compile(r"(?<!\w)" + escaped + r"(?!\w)", re.IGNORECASE)


def keyword_category(description: str) -> Optional[str]:
    """Return a high-confidence category from curated transaction keywords."""
    if not description:
        return None
    text = normalize_for_classification(description)
    # Categories at the top of the dict win on ties. Keep "Income" first so
    # "salary credit to account" classifies as Income, not as something else
    # that has "credit" in it.
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if _keyword_pattern(keyword).search(text):
                return category
    return None


def _detect_payment_method(text: str) -> str:
    for method, keywords in PAYMENT_METHODS.items():
        for keyword in keywords:
            if _keyword_pattern(keyword).search(text):
                return method
    return ""


def _extract_amount(text: str) -> Optional[float]:
    for match in AMOUNT_RE.finditer(text):
        start, end = match.span()
        if text[end:end + 1] == "/" or (start > 0 and text[start - 1:start] == "/"):
            continue
        if re.match(r"(st|nd|rd|th)\b", text[end:].lstrip()[:2], re.IGNORECASE):
            continue
        amount = float(match.group(2).replace(",", ""))
        suffix = match.group(3)
        if suffix:
            amount *= SUFFIX_MULTIPLIERS.get(suffix.lower(), 1)
        if match.group(1) == "-":
            amount = -abs(amount)
        return amount
    return None


def _extract_relative_date(text: str) -> str:
    today = datetime.now()
    lower = text.lower()
    if re.search(r"\byesterday\b", lower):
        return (today - timedelta(days=1)).strftime("%Y-%m-%d")
    if re.search(r"\btomorrow\b", lower):
        return (today + timedelta(days=1)).strftime("%Y-%m-%d")
    if re.search(r"\btoday\b", lower):
        return today.strftime("%Y-%m-%d")
    return ""


def _clean_description(text: str) -> str:
    cleaned = AMOUNT_RE.sub(" ", text)
    cleaned = re.sub(
        r"\b(today|yesterday|tomorrow|paid|spent|for|on|at|using|via|with)\b",
        " ", cleaned, flags=re.IGNORECASE,
    )
    for keywords in PAYMENT_METHODS.values():
        for keyword in keywords:
            cleaned = _keyword_pattern(keyword).sub(" ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -")
    return cleaned.title() if cleaned else "Transaction"


# --------------------------------------------------------------------------- #
# Regex-based single-pass parser
# --------------------------------------------------------------------------- #


def _parse_with_rules(text: str) -> Dict[str, Any]:
    category = keyword_category(text) or "Other"
    amount = _extract_amount(text)
    explicit_income = amount is not None and amount > 0
    if amount is not None and not explicit_income and category not in INCOME_CATEGORIES:
        amount = -abs(amount)
    elif amount is not None and category in INCOME_CATEGORIES:
        amount = abs(amount)

    return {
        "description": _clean_description(text),
        "amount": amount if amount is not None else 0.0,
        "date": _extract_relative_date(text),
        "category": category,
        "payment_method": _detect_payment_method(text),
    }


class LocalNLPParser:
    """Local NLP parser using spaCy for transaction parsing."""

    def __init__(self):
        self._nlp = None
        self._initialized = False

    def _initialize(self):
        """Lazy initialize spaCy model."""
        if self._initialized:
            return True
        try:
            import spacy
            try:
                self._nlp = spacy.load("en_core_web_sm")
            except OSError:
                logger.info("spaCy model en_core_web_sm is not installed; using rules-only fallback")
                return False
            self._initialized = True
            logger.info("Local NLP parser initialized with spaCy")
            return True
        except Exception as exc:
            logger.warning(f"Failed to initialize spaCy: {exc}")
            return False

    def parse_transaction(self, text: str) -> Optional[Dict[str, Any]]:
        """Parse natural language transaction text into structured data."""
        if not self._initialize():
            return _parse_with_rules(text)
        try:
            doc = self._nlp(text.lower())
            result = {
                "description": "",
                "amount": 0.0,
                "date": "",
                "category": "Other",
                "payment_method": "",
            }
            amount = _extract_amount(text)
            if amount is not None:
                result["amount"] = amount
            date_keywords = {
                "today", "yesterday", "tomorrow",
                "this week", "last week", "next week",
                "this month", "last month", "next month",
            }
            for token in doc:
                if token.text in date_keywords:
                    result["date"] = token.text
                    break
            result["payment_method"] = _detect_payment_method(text)
            result["description"] = _clean_description(text)
            result["category"] = keyword_category(text) or "Other"
            return result
        except Exception as exc:
            logger.error(f"Error parsing transaction: {exc}")
            return None


# --------------------------------------------------------------------------- #
# ML classifier (TF-IDF + Naive Bayes)
# --------------------------------------------------------------------------- #

# Curated fallback training set. We try to load the user's Expenditure
# file at init time; if that fails we fall back to this. Each entry is a
# (lowercased_description, category) tuple. Aim for ~40–60 entries per
# category so the model learns merchant variation, not just a single phrase.
TRAINING_DATA_FALLBACK: List[Tuple[str, str]] = [
    # ---------------- Income ----------------
    ("salary credit", "Income"),
    ("monthly salary", "Income"),
    ("salary credited by", "Income"),
    ("salary for the month", "Income"),
    ("salary ac", "Income"),
    ("salary a/c", "Income"),
    ("neft salary", "Income"),
    ("imps salary credit", "Income"),
    ("company payroll", "Income"),
    ("payroll credit", "Income"),
    ("stipend received", "Income"),
    ("internship stipend", "Income"),
    ("freelance payment received", "Income"),
    ("freelance project payment", "Income"),
    ("upwork payment", "Income"),
    ("fiverr payout", "Income"),
    ("contractor payment", "Income"),
    ("consulting fee received", "Income"),
    ("dividend received", "Income"),
    ("dividend credit", "Income"),
    ("interest credited", "Income"),
    ("fd interest", "Income"),
    ("savings account interest", "Income"),
    ("deposit interest", "Income"),
    ("cashback credited", "Income"),
    ("refund received from amazon", "Income"),
    ("refund from flipkart", "Income"),
    ("refund from myntra", "Income"),
    ("tax refund", "Income"),
    ("tds refund", "Income"),
    ("rent received from tenant", "Income"),
    ("rent received", "Income"),
    ("bonus credited", "Income"),
    ("performance bonus", "Income"),
    ("festival bonus", "Income"),
    ("gift money", "Income"),
    ("gift received", "Income"),
    ("money received from father", "Income"),
    ("received from friend", "Income"),
    ("received from mom", "Income"),
    ("pocket money", "Income"),
    ("monthly allowance", "Income"),
    ("scholarship amount", "Income"),
    ("reimbursement from office", "Income"),
    ("travel reimbursement", "Income"),
    ("expense reimbursement", "Income"),
    ("upi collect request accepted", "Income"),
    ("collect request payment", "Income"),

    # ---------------- Food Delivery ----------------
    ("swiggy order", "Food Delivery"),
    ("swiggy delivery", "Food Delivery"),
    ("swiggy instamart", "Food Delivery"),
    ("swiggy genie", "Food Delivery"),
    ("swiggy", "Food Delivery"),
    ("zomato order", "Food Delivery"),
    ("zomato gold", "Food Delivery"),
    ("zomato", "Food Delivery"),
    ("zomato online food", "Food Delivery"),
    ("ubereats order", "Food Delivery"),
    ("uber eats", "Food Delivery"),
    ("uber eats delivery", "Food Delivery"),
    ("eatsure order", "Food Delivery"),
    ("eatsure", "Food Delivery"),
    ("dunzo order", "Food Delivery"),
    ("dunzo daily", "Food Delivery"),
    ("dunzo", "Food Delivery"),
    ("magicpin order", "Food Delivery"),
    ("magicpin", "Food Delivery"),
    ("box8 order", "Food Delivery"),
    ("box 8", "Food Delivery"),
    ("faasos order", "Food Delivery"),
    ("faasos", "Food Delivery"),
    ("behrouz biryani", "Food Delivery"),
    ("behrouz", "Food Delivery"),
    ("oven story order", "Food Delivery"),
    ("oven story", "Food Delivery"),
    ("licious order", "Food Delivery"),
    ("licious", "Food Delivery"),
    ("fresh to home", "Food Delivery"),
    ("fresh menu", "Food Delivery"),
    ("freshmenu", "Food Delivery"),
    ("country delight milk", "Food Delivery"),
    ("country delight", "Food Delivery"),
    ("biryani blues", "Food Delivery"),
    ("kfc delivery", "Food Delivery"),
    ("mcdelivery", "Food Delivery"),
    ("dominos delivery", "Food Delivery"),
    ("pizza hut delivery", "Food Delivery"),
    ("food delivery order", "Food Delivery"),
    ("online food order", "Food Delivery"),
    ("delivery tip", "Food Delivery"),

    # ---------------- Food & Dining ----------------
    ("restaurant bill", "Food & Dining"),
    ("dinner at restaurant", "Food & Dining"),
    ("lunch with friends", "Food & Dining"),
    ("cafe visit", "Food & Dining"),
    ("coffee shop", "Food & Dining"),
    ("starbucks coffee", "Food & Dining"),
    ("starbucks", "Food & Dining"),
    ("cafe coffee day", "Food & Dining"),
    ("ccd coffee", "Food & Dining"),
    ("barista coffee", "Food & Dining"),
    ("blue tokai coffee", "Food & Dining"),
    ("third wave coffee", "Food & Dining"),
    ("chai point", "Food & Dining"),
    ("dominos pizza", "Food & Dining"),
    ("dominos order", "Food & Dining"),
    ("pizza hut", "Food & Dining"),
    ("kfc chicken", "Food & Dining"),
    ("kfc bucket", "Food & Dining"),
    ("kfc meal", "Food & Dining"),
    ("mcdonalds burger", "Food & Dining"),
    ("mcdonalds", "Food & Dining"),
    ("burger king", "Food & Dining"),
    ("subway sandwich", "Food & Dining"),
    ("subway", "Food & Dining"),
    ("biryani zone", "Food & Dining"),
    ("biryani blues dine in", "Food & Dining"),
    ("haleem at paradise", "Food & Dining"),
    ("paradise biryani", "Food & Dining"),
    ("saravana bhavan", "Food & Dining"),
    ("sagar ratna", "Food & Dining"),
    ("barbeque nation", "Food & Dining"),
    ("barbeque nation buffet", "Food & Dining"),
    ("mainland china", "Food & Dining"),
    ("absolute barbecue", "Food & Dining"),
    ("the yellow chilli", "Food & Dining"),
    ("social restaurant", "Food & Dining"),
    ("haldiram restaurant", "Food & Dining"),
    ("haldiram take away", "Food & Dining"),
    ("haldiram sweets", "Food & Dining"),
    ("street food stall", "Food & Dining"),
    ("chaat stall", "Food & Dining"),
    ("dosa corner", "Food & Dining"),
    ("south indian breakfast", "Food & Dining"),
    ("north indian thali", "Food & Dining"),
    ("south indian thali", "Food & Dining"),
    ("mess food", "Food & Dining"),
    ("tiffin service", "Food & Dining"),
    ("office canteen", "Food & Dining"),
    ("office cafeteria", "Food & Dining"),
    ("hotel breakfast", "Food & Dining"),
    ("room service", "Food & Dining"),
    ("dine in", "Food & Dining"),
    ("dining out", "Food & Dining"),
    ("birthday dinner", "Food & Dining"),
    ("anniversary dinner", "Food & Dining"),
    ("bakery cake", "Food & Dining"),
    ("cake shop", "Food & Dining"),
    ("pastry", "Food & Dining"),
    ("eazydiner booking", "Food & Dining"),
    ("eazydiner", "Food & Dining"),

    # ---------------- Groceries ----------------
    ("blinkit order", "Groceries"),
    ("blinkit delivery", "Groceries"),
    ("blinkit", "Groceries"),
    ("zepto delivery", "Groceries"),
    ("zepto order", "Groceries"),
    ("zepto", "Groceries"),
    ("bigbasket order", "Groceries"),
    ("bigbasket", "Groceries"),
    ("big basket grocery", "Groceries"),
    ("grofers order", "Groceries"),
    ("grofers", "Groceries"),
    ("dmart grocery", "Groceries"),
    ("dmart", "Groceries"),
    ("d mart shopping", "Groceries"),
    ("jiomart grocery", "Groceries"),
    ("jiomart", "Groceries"),
    ("jio mart", "Groceries"),
    ("reliance fresh", "Groceries"),
    ("more retail", "Groceries"),
    ("spencer's grocery", "Groceries"),
    ("nature's basket", "Groceries"),
    ("godrej natur basket", "Groceries"),
    ("easyday store", "Groceries"),
    ("smart bazaar", "Groceries"),
    ("ratnadeep", "Groceries"),
    ("hypercity", "Groceries"),
    ("star bazaar", "Groceries"),
    ("walmart groceries", "Groceries"),
    ("lulu mall grocery", "Groceries"),
    ("kirana store", "Groceries"),
    ("kirana", "Groceries"),
    ("local kirana", "Groceries"),
    ("vegetables from vendor", "Groceries"),
    ("fruit vendor", "Groceries"),
    ("milk dairy", "Groceries"),
    ("mother dairy milk", "Groceries"),
    ("amul milk", "Groceries"),
    ("bread and eggs", "Groceries"),
    ("monthly ration", "Groceries"),
    ("ration shop", "Groceries"),
    ("monthly groceries", "Groceries"),
    ("weekly groceries", "Groceries"),
    ("grocery shopping", "Groceries"),
    ("supermarket bill", "Groceries"),
    ("supermarket", "Groceries"),
    ("provision store", "Groceries"),

    # ---------------- Fuel ----------------
    ("petrol fill", "Fuel"),
    ("petrol pump", "Fuel"),
    ("petrol refill", "Fuel"),
    ("petrol", "Fuel"),
    ("diesel fill", "Fuel"),
    ("diesel", "Fuel"),
    ("cng fill", "Fuel"),
    ("cng pump", "Fuel"),
    ("cng refill", "Fuel"),
    ("lpg refill", "Fuel"),
    ("lpg cylinder", "Fuel"),
    ("lpg booking", "Fuel"),
    ("hp petrol pump", "Fuel"),
    ("hpcl pump", "Fuel"),
    ("hindustan petroleum", "Fuel"),
    ("bharat petroleum", "Fuel"),
    ("bpcl pump", "Fuel"),
    ("indian oil", "Fuel"),
    ("iocl pump", "Fuel"),
    ("shell petrol", "Fuel"),
    ("shell pump", "Fuel"),
    ("essar petrol", "Fuel"),
    ("reliance petroleum", "Fuel"),
    ("nayara pump", "Fuel"),
    ("speed petrol pump", "Fuel"),
    ("filling station", "Fuel"),
    ("gas station", "Fuel"),
    ("fuel station", "Fuel"),

    # ---------------- Transportation ----------------
    ("ola ride", "Transportation"),
    ("ola cab", "Transportation"),
    ("ola auto", "Transportation"),
    ("ola prime", "Transportation"),
    ("ola", "Transportation"),
    ("uber ride", "Transportation"),
    ("uber cab", "Transportation"),
    ("uber auto", "Transportation"),
    ("uber prime", "Transportation"),
    ("uber", "Transportation"),
    ("rapido bike", "Transportation"),
    ("rapido auto", "Transportation"),
    ("rapido cab", "Transportation"),
    ("rapido", "Transportation"),
    ("auto rickshaw", "Transportation"),
    ("rickshaw", "Transportation"),
    ("metro card recharge", "Transportation"),
    ("metro pass", "Transportation"),
    ("delhi metro", "Transportation"),
    ("metro ride", "Transportation"),
    ("metro ticket", "Transportation"),
    ("metro", "Transportation"),
    ("bus ticket", "Transportation"),
    ("bus pass", "Transportation"),
    ("tc bus", "Transportation"),
    ("best bus", "Transportation"),
    ("dtc bus pass", "Transportation"),
    ("bmtc bus", "Transportation"),
    ("train ticket", "Transportation"),
    ("train ticket booking", "Transportation"),
    ("irctc booking", "Transportation"),
    ("irctc e-ticket", "Transportation"),
    ("irctc tatkal", "Transportation"),
    ("railway ticket", "Transportation"),
    ("railway platform ticket", "Transportation"),
    ("flight ticket", "Transportation"),
    ("flight booking", "Transportation"),
    ("indigo flight", "Transportation"),
    ("indigo airlines", "Transportation"),
    ("vistara flight", "Transportation"),
    ("vistara", "Transportation"),
    ("spicejet flight", "Transportation"),
    ("spicejet", "Transportation"),
    ("air india flight", "Transportation"),
    ("air india", "Transportation"),
    ("go air flight", "Transportation"),
    ("goair", "Transportation"),
    ("emirates flight", "Transportation"),
    ("etihad flight", "Transportation"),
    ("toll plaza", "Transportation"),
    ("toll charge", "Transportation"),
    ("toll", "Transportation"),
    ("fastag recharge", "Transportation"),
    ("fastag", "Transportation"),
    ("parking fee", "Transportation"),
    ("parking", "Transportation"),
    ("valet parking", "Transportation"),
    ("car wash", "Transportation"),
    ("bike wash", "Transportation"),
    ("vehicle service", "Transportation"),
    ("car service", "Transportation"),
    ("bike service", "Transportation"),
    ("bike repair", "Transportation"),
    ("zoomcar booking", "Transportation"),
    ("zoomcar", "Transportation"),
    ("revv rental", "Transportation"),
    ("bounce bike", "Transportation"),
    ("yulu ride", "Transportation"),
    ("redbus booking", "Transportation"),
    ("redbus ticket", "Transportation"),
    ("abhibus booking", "Transportation"),
    ("abhibus", "Transportation"),

    # ---------------- Shopping ----------------
    ("amazon order", "Shopping"),
    ("amazon shopping", "Shopping"),
    ("amazon purchase", "Shopping"),
    ("amazon", "Shopping"),
    ("amazon prime order", "Shopping"),
    ("flipkart order", "Shopping"),
    ("flipkart shopping", "Shopping"),
    ("flipkart", "Shopping"),
    ("myntra order", "Shopping"),
    ("myntra shopping", "Shopping"),
    ("myntra", "Shopping"),
    ("ajio order", "Shopping"),
    ("ajio", "Shopping"),
    ("meesho order", "Shopping"),
    ("meesho", "Shopping"),
    ("snapdeal order", "Shopping"),
    ("snapdeal", "Shopping"),
    ("shopclues order", "Shopping"),
    ("tatacliq order", "Shopping"),
    ("tata cliq", "Shopping"),
    ("paytm mall", "Shopping"),
    ("croma store", "Shopping"),
    ("croma electronics", "Shopping"),
    ("croma", "Shopping"),
    ("reliance digital", "Shopping"),
    ("vijay sales", "Shopping"),
    ("apple store", "Shopping"),
    ("apple.com/bill", "Shopping"),
    ("mi store purchase", "Shopping"),
    ("oneplus store", "Shopping"),
    ("boat headphones", "Shopping"),
    ("noise watch", "Shopping"),
    ("headphones purchase", "Shopping"),
    ("earphones", "Shopping"),
    ("earbuds", "Shopping"),
    ("smartwatch", "Shopping"),
    ("smart watch purchase", "Shopping"),
    ("mobile phone purchase", "Shopping"),
    ("smartphone purchase", "Shopping"),
    ("laptop purchase", "Shopping"),
    ("tablet purchase", "Shopping"),
    ("tv purchase", "Shopping"),
    ("television", "Shopping"),
    ("camera", "Shopping"),
    ("t-shirt", "Shopping"),
    ("tshirt", "Shopping"),
    ("shirt", "Shopping"),
    ("jeans", "Shopping"),
    ("trousers", "Shopping"),
    ("kurta", "Shopping"),
    ("saree", "Shopping"),
    ("dress purchase", "Shopping"),
    ("shoes", "Shopping"),
    ("sneakers", "Shopping"),
    ("sandals", "Shopping"),
    ("watch", "Shopping"),
    ("wristwatch", "Shopping"),
    ("belt", "Shopping"),
    ("wallet", "Shopping"),
    ("bag", "Shopping"),
    ("backpack", "Shopping"),
    ("handbag", "Shopping"),
    ("sunglasses", "Shopping"),
    ("eyeglasses", "Shopping"),
    ("decathlon", "Shopping"),
    ("nike shoes", "Shopping"),
    ("adidas shoes", "Shopping"),
    ("puma", "Shopping"),
    ("reebok", "Shopping"),
    ("levis jeans", "Shopping"),
    ("levi's", "Shopping"),
    ("zara", "Shopping"),
    ("h&m", "Shopping"),
    ("vero moda", "Shopping"),
    ("only brand", "Shopping"),
    ("and brand", "Shopping"),
    ("global desi", "Shopping"),
    ("biba", "Shopping"),
    ("lifestyle store", "Shopping"),
    ("pantaloons", "Shopping"),
    ("shoppers stop", "Shopping"),
    ("central mall", "Shopping"),
    ("westside", "Shopping"),
    ("max fashion", "Shopping"),
    ("mall shopping", "Shopping"),
    ("city mall", "Shopping"),
    ("select city walk", "Shopping"),
    ("phoenix mall", "Shopping"),
    ("nexus mall", "Shopping"),
    ("express avenue", "Shopping"),
    ("ambience mall", "Shopping"),
    ("online shopping", "Shopping"),
    ("e-commerce order", "Shopping"),
    ("gadget purchase", "Shopping"),
    ("electronics", "Shopping"),
    ("jewellery", "Shopping"),
    ("jewelry", "Shopping"),
    ("necklace", "Shopping"),
    ("ring", "Shopping"),
    ("earring", "Shopping"),

    # ---------------- Utilities ----------------
    ("electricity bill", "Utilities"),
    ("electricity bill payment", "Utilities"),
    ("electricity", "Utilities"),
    ("power bill", "Utilities"),
    ("bescom bill", "Utilities"),
    ("msedcl bill", "Utilities"),
    ("tata power bill", "Utilities"),
    ("adani electricity", "Utilities"),
    ("bses bill", "Utilities"),
    ("water bill", "Utilities"),
    ("water tax", "Utilities"),
    ("gas bill", "Utilities"),
    ("piped gas bill", "Utilities"),
    ("igl bill", "Utilities"),
    ("mgl bill", "Utilities"),
    ("indraprastha gas", "Utilities"),
    ("broadband bill", "Utilities"),
    ("broadband recharge", "Utilities"),
    ("wifi bill", "Utilities"),
    ("internet bill", "Utilities"),
    ("internet recharge", "Utilities"),
    ("fiber bill", "Utilities"),
    ("ftth recharge", "Utilities"),
    ("airtel bill", "Utilities"),
    ("airtel postpaid", "Utilities"),
    ("airtel broadband", "Utilities"),
    ("jio fiber bill", "Utilities"),
    ("jio fibre bill", "Utilities"),
    ("jio postpaid", "Utilities"),
    ("jio recharge", "Utilities"),
    ("vi postpaid bill", "Utilities"),
    ("vi prepaid recharge", "Utilities"),
    ("vodafone bill", "Utilities"),
    ("bsnl bill", "Utilities"),
    ("mtnl bill", "Utilities"),
    ("dth recharge", "Utilities"),
    ("tata sky recharge", "Utilities"),
    ("tatasky", "Utilities"),
    ("dish tv recharge", "Utilities"),
    ("dishtv", "Utilities"),
    ("sun direct recharge", "Utilities"),
    ("d2h recharge", "Utilities"),
    ("mobile recharge", "Utilities"),
    ("prepaid recharge", "Utilities"),
    ("postpaid bill", "Utilities"),
    ("data recharge", "Utilities"),
    ("bill payment", "Utilities"),
    ("bill pay", "Utilities"),
    ("license renewal", "Utilities"),
    ("driving license renewal", "Utilities"),
    ("dl renewal", "Utilities"),
    ("rto fee", "Utilities"),
    ("rto charges", "Utilities"),
    ("vehicle registration", "Utilities"),
    ("traffic challan", "Utilities"),
    ("challan payment", "Utilities"),
    ("property tax", "Utilities"),
    ("house tax", "Utilities"),
    ("municipal tax", "Utilities"),
    ("gas cylinder booking", "Utilities"),
    ("indane gas", "Utilities"),
    ("bharat gas", "Utilities"),
    ("hp gas", "Utilities"),
    ("lpg booking", "Utilities"),

    # ---------------- Subscriptions ----------------
    ("netflix subscription", "Subscriptions"),
    ("netflix monthly", "Subscriptions"),
    ("netflix premium", "Subscriptions"),
    ("netflix", "Subscriptions"),
    ("spotify premium", "Subscriptions"),
    ("spotify family", "Subscriptions"),
    ("spotify", "Subscriptions"),
    ("amazon prime subscription", "Subscriptions"),
    ("prime video subscription", "Subscriptions"),
    ("prime subscription", "Subscriptions"),
    ("prime", "Subscriptions"),
    ("disney hotstar subscription", "Subscriptions"),
    ("hotstar subscription", "Subscriptions"),
    ("hotstar", "Subscriptions"),
    ("disney+ subscription", "Subscriptions"),
    ("sony liv subscription", "Subscriptions"),
    ("sony liv", "Subscriptions"),
    ("zee5 subscription", "Subscriptions"),
    ("zee5", "Subscriptions"),
    ("jio cinema subscription", "Subscriptions"),
    ("voot subscription", "Subscriptions"),
    ("mx player subscription", "Subscriptions"),
    ("youtube premium", "Subscriptions"),
    ("youtube music premium", "Subscriptions"),
    ("youtube red", "Subscriptions"),
    ("apple music subscription", "Subscriptions"),
    ("apple music", "Subscriptions"),
    ("apple tv subscription", "Subscriptions"),
    ("apple tv+", "Subscriptions"),
    ("apple one", "Subscriptions"),
    ("apple arcade", "Subscriptions"),
    ("icloud storage", "Subscriptions"),
    ("icloud+", "Subscriptions"),
    ("icloud", "Subscriptions"),
    ("google one subscription", "Subscriptions"),
    ("google one", "Subscriptions"),
    ("google play pass", "Subscriptions"),
    ("microsoft 365 subscription", "Subscriptions"),
    ("office 365 subscription", "Subscriptions"),
    ("office 365", "Subscriptions"),
    ("ms365 subscription", "Subscriptions"),
    ("adobe creative cloud", "Subscriptions"),
    ("adobe cc", "Subscriptions"),
    ("adobe subscription", "Subscriptions"),
    ("canva pro subscription", "Subscriptions"),
    ("canva pro", "Subscriptions"),
    ("figma subscription", "Subscriptions"),
    ("figma professional", "Subscriptions"),
    ("notion subscription", "Subscriptions"),
    ("notion plus", "Subscriptions"),
    ("notion ai", "Subscriptions"),
    ("dropbox subscription", "Subscriptions"),
    ("dropbox plus", "Subscriptions"),
    ("github copilot", "Subscriptions"),
    ("chatgpt plus", "Subscriptions"),
    ("chatgpt subscription", "Subscriptions"),
    ("chat gpt subscription", "Subscriptions"),
    ("chatgpt", "Subscriptions"),
    ("openai subscription", "Subscriptions"),
    ("claude pro", "Subscriptions"),
    ("anthropic subscription", "Subscriptions"),
    ("perplexity pro", "Subscriptions"),
    ("grammarly premium", "Subscriptions"),
    ("audible subscription", "Subscriptions"),
    ("audible", "Subscriptions"),
    ("kindle unlimited", "Subscriptions"),
    ("gym membership", "Subscriptions"),
    ("gym monthly", "Subscriptions"),
    ("cult fit subscription", "Subscriptions"),
    ("cultfit membership", "Subscriptions"),
    ("cult fit", "Subscriptions"),
    ("cure.fit membership", "Subscriptions"),
    ("cure.fit", "Subscriptions"),
    ("curefit subscription", "Subscriptions"),
    ("gold's gym", "Subscriptions"),
    ("gold gym", "Subscriptions"),
    ("anytime fitness", "Subscriptions"),
    ("fitness first", "Subscriptions"),
    ("subscription", "Subscriptions"),
    ("monthly subscription", "Subscriptions"),
    ("annual subscription", "Subscriptions"),
    ("yearly subscription", "Subscriptions"),
    ("recurring payment", "Subscriptions"),
    ("auto debit", "Subscriptions"),

    # ---------------- Entertainment ----------------
    ("movie ticket", "Entertainment"),
    ("movie tickets", "Entertainment"),
    ("cinema hall", "Entertainment"),
    ("bookmyshow", "Entertainment"),
    ("book my show", "Entertainment"),
    ("bms booking", "Entertainment"),
    ("paytm movies", "Entertainment"),
    ("pvr cinema", "Entertainment"),
    ("pvr cinemas", "Entertainment"),
    ("pvr", "Entertainment"),
    ("inox ticket", "Entertainment"),
    ("inox", "Entertainment"),
    ("carnival cinemas", "Entertainment"),
    ("cinepolis", "Entertainment"),
    ("mukta a2 cinemas", "Entertainment"),
    ("miraj cinemas", "Entertainment"),
    ("movie popcorn", "Entertainment"),
    ("movie outing", "Entertainment"),
    ("game purchase", "Entertainment"),
    ("gaming purchase", "Entertainment"),
    ("concert ticket", "Entertainment"),
    ("concert booking", "Entertainment"),
    ("live concert", "Entertainment"),
    ("music concert", "Entertainment"),
    ("theatre ticket", "Entertainment"),
    ("play ticket", "Entertainment"),
    ("stand up comedy", "Entertainment"),
    ("standup show", "Entertainment"),
    ("amusement park", "Entertainment"),
    ("theme park ticket", "Entertainment"),
    ("imagica tickets", "Entertainment"),
    ("imagica", "Entertainment"),
    ("wonderla entry", "Entertainment"),
    ("wonderla", "Entertainment"),
    ("water park ticket", "Entertainment"),
    ("water park", "Entertainment"),
    ("nicco park", "Entertainment"),
    ("bowling alley", "Entertainment"),
    ("trampoline park", "Entertainment"),
    ("playstation plus", "Entertainment"),
    ("ps plus", "Entertainment"),
    ("playstation store", "Entertainment"),
    ("xbox game pass", "Entertainment"),
    ("xbox live", "Entertainment"),
    ("xbox", "Entertainment"),
    ("nintendo switch", "Entertainment"),
    ("nintendo eshop", "Entertainment"),
    ("steam purchase", "Entertainment"),
    ("steam wallet", "Entertainment"),
    ("epic games purchase", "Entertainment"),
    ("valorant points", "Entertainment"),
    ("pubg uc", "Entertainment"),
    ("free fire diamonds", "Entertainment"),
    ("minecraft purchase", "Entertainment"),
    ("roblox robux", "Entertainment"),
    ("fifa points", "Entertainment"),
    ("call of duty points", "Entertainment"),

    # ---------------- Health ----------------
    ("pharmacy bill", "Health"),
    ("pharmacy", "Health"),
    ("medical store", "Health"),
    ("medicine purchase", "Health"),
    ("medicine", "Health"),
    ("tablets", "Health"),
    ("capsules", "Health"),
    ("syrup", "Health"),
    ("doctor consultation", "Health"),
    ("doctor visit", "Health"),
    ("doctor fee", "Health"),
    ("doctor appointment", "Health"),
    ("apollo pharmacy", "Health"),
    ("apollo hospital", "Health"),
    ("apollo", "Health"),
    ("medplus", "Health"),
    ("pharmeasy order", "Health"),
    ("pharmeasy", "Health"),
    ("1mg order", "Health"),
    ("tata 1mg", "Health"),
    ("1mg", "Health"),
    ("netmeds order", "Health"),
    ("netmeds", "Health"),
    ("truemeds", "Health"),
    ("wellness forever", "Health"),
    ("healthkart order", "Health"),
    ("healthkart", "Health"),
    ("clinic fee", "Health"),
    ("clinic visit", "Health"),
    ("polyclinic", "Health"),
    ("dental clinic", "Health"),
    ("dentist visit", "Health"),
    ("dentist fee", "Health"),
    ("dental", "Health"),
    ("dental care", "Health"),
    ("eye checkup", "Health"),
    ("eye doctor", "Health"),
    ("optical store", "Health"),
    ("optical", "Health"),
    ("lenskart order", "Health"),
    ("lenskart", "Health"),
    ("specsmakers", "Health"),
    ("lab test", "Health"),
    ("lab", "Health"),
    ("pathology lab", "Health"),
    ("pathology", "Health"),
    ("thyrocare test", "Health"),
    ("thyrocare", "Health"),
    ("srl diagnostics", "Health"),
    ("metropolis lab", "Health"),
    ("lal path labs", "Health"),
    ("dr lal pathlabs", "Health"),
    ("full body checkup", "Health"),
    ("health checkup", "Health"),
    ("consultation fee", "Health"),
    ("consultation", "Health"),
    ("hospital bill", "Health"),
    ("hospital", "Health"),
    ("opd consultation", "Health"),
    ("opd", "Health"),
    ("surgery bill", "Health"),
    ("operation fee", "Health"),
    ("physiotherapy session", "Health"),
    ("physiotherapy", "Health"),
    ("physio session", "Health"),
    ("physio", "Health"),
    ("yoga therapy", "Health"),
    ("mental health session", "Health"),
    ("therapist session", "Health"),
    ("practo consult", "Health"),
    ("practo", "Health"),
    ("mfine consult", "Health"),
    ("mfine", "Health"),
    ("tata health", "Health"),
    ("healthifyme plan", "Health"),
    ("healthifyme", "Health"),
    ("weight loss program", "Health"),
    ("dietitian consultation", "Health"),
    ("dietitian", "Health"),
    ("nutritionist", "Health"),
    ("whey protein", "Health"),
    ("protein powder", "Health"),
    ("multivitamin", "Health"),
    ("vitamin d", "Health"),
    ("first aid", "Health"),
    ("mask pack", "Health"),
    ("sanitizer bottle", "Health"),
    ("blood test", "Health"),
    ("x-ray", "Health"),
    ("mri scan", "Health"),
    ("mri", "Health"),
    ("ct scan", "Health"),
    ("sonography", "Health"),
    ("covid test", "Health"),
    ("rt pcr", "Health"),

    # ---------------- Education ----------------
    ("udemy course", "Education"),
    ("udemy purchase", "Education"),
    ("udemy", "Education"),
    ("coursera course", "Education"),
    ("coursera plus", "Education"),
    ("coursera", "Education"),
    ("udacity nanodegree", "Education"),
    ("udacity", "Education"),
    ("edx course", "Education"),
    ("edx", "Education"),
    ("khan academy", "Education"),
    ("skillshare subscription", "Education"),
    ("skillshare", "Education"),
    ("pluralsight", "Education"),
    ("linkedin learning", "Education"),
    ("masterclass subscription", "Education"),
    ("masterclass", "Education"),
    ("school fee", "Education"),
    ("school fees", "Education"),
    ("school admission", "Education"),
    ("college fee", "Education"),
    ("college fees", "Education"),
    ("tuition fee", "Education"),
    ("tuition fees", "Education"),
    ("tuition", "Education"),
    ("coaching fee", "Education"),
    ("coaching class", "Education"),
    ("byjus classes", "Education"),
    ("byju's", "Education"),
    ("byjus", "Education"),
    ("unacademy plus", "Education"),
    ("unacademy", "Education"),
    ("vedantu", "Education"),
    ("whitehat jr", "Education"),
    ("whitehatjr", "Education"),
    ("cuemath", "Education"),
    ("toppr", "Education"),
    ("doubtnut", "Education"),
    ("extramarks", "Education"),
    ("meritnation", "Education"),
    ("exam fee", "Education"),
    ("exam form", "Education"),
    ("exam fees", "Education"),
    ("exam form fill", "Education"),
    ("form fill", "Education"),
    ("tet form fill", "Education"),
    ("tet exam form", "Education"),
    ("tet application fee", "Education"),
    ("ctet form", "Education"),
    ("application form fee", "Education"),
    ("govt exam form", "Education"),
    ("books purchase", "Education"),
    ("textbook purchase", "Education"),
    ("novel purchase", "Education"),
    ("kindle book", "Education"),
    ("stationery purchase", "Education"),
    ("pen purchase", "Education"),
    ("notebook purchase", "Education"),
    ("school bag purchase", "Education"),
    ("online class fee", "Education"),
    ("live class fee", "Education"),
    ("test series fee", "Education"),
    ("mock test series", "Education"),
    ("upsc coaching", "Education"),
    ("gate coaching", "Education"),
    ("jee coaching", "Education"),
    ("neet coaching", "Education"),
    ("cat coaching", "Education"),
    ("gre coaching", "Education"),
    ("toefl coaching", "Education"),
    ("ielts coaching", "Education"),
    ("du admission", "Education"),
    ("iit coaching", "Education"),

    # ---------------- Investments ----------------
    ("sip investment", "Investments"),
    ("monthly sip", "Investments"),
    ("sip payment", "Investments"),
    ("sip", "Investments"),
    ("lumpsum investment", "Investments"),
    ("lumpsum", "Investments"),
    ("lump sum mf", "Investments"),
    ("mutual fund sip", "Investments"),
    ("mutual fund purchase", "Investments"),
    ("mutual fund", "Investments"),
    ("mutual funds", "Investments"),
    ("stock purchase", "Investments"),
    ("stock buy", "Investments"),
    ("stocks", "Investments"),
    ("shares purchase", "Investments"),
    ("equity investment", "Investments"),
    ("equity fund", "Investments"),
    ("ppf deposit", "Investments"),
    ("ppf", "Investments"),
    ("nps contribution", "Investments"),
    ("nps", "Investments"),
    ("elss investment", "Investments"),
    ("elss", "Investments"),
    ("fd deposit", "Investments"),
    ("fd booking", "Investments"),
    ("fixed deposit", "Investments"),
    ("fd", "Investments"),
    ("recurring deposit", "Investments"),
    ("rd deposit", "Investments"),
    ("rd", "Investments"),
    ("nsc purchase", "Investments"),
    ("kvp", "Investments"),
    ("scss", "Investments"),
    ("sukanya samriddhi", "Investments"),
    ("sssy", "Investments"),
    ("pomis", "Investments"),
    ("post office deposit", "Investments"),
    ("sovereign gold bond", "Investments"),
    ("sgb", "Investments"),
    ("gold bond", "Investments"),
    ("etf purchase", "Investments"),
    ("etf", "Investments"),
    ("bond purchase", "Investments"),
    ("bonds", "Investments"),
    ("demat account opening", "Investments"),
    ("demat", "Investments"),
    ("trading account", "Investments"),
    ("zerodha order", "Investments"),
    ("zerodha", "Investments"),
    ("groww investment", "Investments"),
    ("groww", "Investments"),
    ("upstox order", "Investments"),
    ("upstox", "Investments"),
    ("angel one order", "Investments"),
    ("angel broking", "Investments"),
    ("angel one", "Investments"),
    ("5paisa order", "Investments"),
    ("5paisa", "Investments"),
    ("paytm money investment", "Investments"),
    ("paytm money", "Investments"),
    ("kuvera", "Investments"),
    ("coin investment", "Investments"),
    ("coin by zerodha", "Investments"),
    ("etmoney", "Investments"),
    ("motilal oswal", "Investments"),
    ("hdfc securities", "Investments"),
    ("icici direct", "Investments"),
    ("kotak securities", "Investments"),
    ("sharekhan", "Investments"),
    ("axis direct", "Investments"),
    ("crypto purchase", "Investments"),
    ("crypto buy", "Investments"),
    ("bitcoin purchase", "Investments"),
    ("bitcoin", "Investments"),
    ("ethereum purchase", "Investments"),
    ("ethereum", "Investments"),
    ("wazirx order", "Investments"),
    ("wazirx", "Investments"),
    ("coinswitch", "Investments"),
    ("coindcx", "Investments"),
    ("zebpay", "Investments"),
    ("term insurance premium", "Investments"),
    ("term plan", "Investments"),
    ("term insurance", "Investments"),
    ("health insurance premium", "Investments"),
    ("health insurance", "Investments"),
    ("life insurance premium", "Investments"),
    ("life insurance", "Investments"),
    ("hdfc life premium", "Investments"),
    ("icici prudential premium", "Investments"),
    ("sbi life premium", "Investments"),
    ("max life premium", "Investments"),
    ("tata aia premium", "Investments"),
    ("insurance premium", "Investments"),
    ("ulip premium", "Investments"),
    ("ulip", "Investments"),

    # ---------------- Housing/Rent ----------------
    ("monthly rent", "Housing/Rent"),
    ("house rent", "Housing/Rent"),
    ("apartment rent", "Housing/Rent"),
    ("flat rent", "Housing/Rent"),
    ("room rent", "Housing/Rent"),
    ("pg rent", "Housing/Rent"),
    ("pg", "Housing/Rent"),
    ("paying guest", "Housing/Rent"),
    ("hostel fee", "Housing/Rent"),
    ("hostel", "Housing/Rent"),
    ("society maintenance", "Housing/Rent"),
    ("maintenance charge", "Housing/Rent"),
    ("maintenance bill", "Housing/Rent"),
    ("maintenance", "Housing/Rent"),
    ("society bill", "Housing/Rent"),
    ("apartment maintenance", "Housing/Rent"),
    ("flat maintenance", "Housing/Rent"),
    ("landlord payment", "Housing/Rent"),
    ("landlord", "Housing/Rent"),
    ("rental agreement", "Housing/Rent"),
    ("rental", "Housing/Rent"),
    ("property broker", "Housing/Rent"),
    ("broker fee", "Housing/Rent"),
    ("brokerage", "Housing/Rent"),
    ("home loan emi", "Housing/Rent"),
    ("home loan", "Housing/Rent"),
    ("housing loan", "Housing/Rent"),
    ("mortgage", "Housing/Rent"),
    ("mortgage emi", "Housing/Rent"),
    ("loan emi", "Housing/Rent"),
    ("loan repayment", "Housing/Rent"),

    # ---------------- Personal Care ----------------
    ("salon visit", "Personal Care"),
    ("hair salon", "Personal Care"),
    ("haircut", "Personal Care"),
    ("hair cut", "Personal Care"),
    ("spa treatment", "Personal Care"),
    ("spa booking", "Personal Care"),
    ("spa", "Personal Care"),
    ("grooming session", "Personal Care"),
    ("grooming", "Personal Care"),
    ("cosmetics purchase", "Personal Care"),
    ("cosmetics", "Personal Care"),
    ("skincare product", "Personal Care"),
    ("skincare", "Personal Care"),
    ("skin care", "Personal Care"),
    ("barber shop", "Personal Care"),
    ("barbershop", "Personal Care"),
    ("beauty parlour", "Personal Care"),
    ("beauty parlor", "Personal Care"),
    ("parlour visit", "Personal Care"),
    ("parlor visit", "Personal Care"),
    ("parlour", "Personal Care"),
    ("parlor", "Personal Care"),
    ("makeup", "Personal Care"),
    ("bridal makeup", "Personal Care"),
    ("mehndi design", "Personal Care"),
    ("mehandi", "Personal Care"),
    ("manicure", "Personal Care"),
    ("pedicure", "Personal Care"),
    ("facewash", "Personal Care"),
    ("face wash", "Personal Care"),
    ("cleanser", "Personal Care"),
    ("moisturizer", "Personal Care"),
    ("sunscreen", "Personal Care"),
    ("shampoo", "Personal Care"),
    ("conditioner", "Personal Care"),
    ("hair oil", "Personal Care"),
    ("hair color", "Personal Care"),
    ("hair dye", "Personal Care"),
    ("bodywash", "Personal Care"),
    ("body wash", "Personal Care"),
    ("soap", "Personal Care"),
    ("handwash", "Personal Care"),
    ("sanitizer bottle", "Personal Care"),
    ("deodorant", "Personal Care"),
    ("perfume", "Personal Care"),
    ("fragrance", "Personal Care"),
    ("cologne", "Personal Care"),
    ("toothpaste", "Personal Care"),
    ("toothbrush", "Personal Care"),
    ("mouthwash", "Personal Care"),
    ("razor", "Personal Care"),
    ("shaving cream", "Personal Care"),
    ("after shave", "Personal Care"),
    ("aftershave", "Personal Care"),
    ("waxing", "Personal Care"),
    ("threading", "Personal Care"),
    ("bleach facial", "Personal Care"),
    ("facial cleanup", "Personal Care"),
    ("facial", "Personal Care"),
    ("body polish", "Personal Care"),
    ("mamaearth product", "Personal Care"),
    ("mamaearth", "Personal Care"),
    ("wow product", "Personal Care"),
    ("biotique", "Personal Care"),
    ("himalaya product", "Personal Care"),
    ("plum product", "Personal Care"),
    ("plum", "Personal Care"),
    ("nykaa order", "Personal Care"),
    ("nykaa cosmetics", "Personal Care"),
    ("smytten", "Personal Care"),
    ("purplle order", "Personal Care"),
    ("urbanic", "Personal Care"),

    # ---------------- Snacks ----------------
    ("lays chips", "Snacks"),
    ("lays packet", "Snacks"),
    ("lays", "Snacks"),
    ("kurkure", "Snacks"),
    ("chips packet", "Snacks"),
    ("chips", "Snacks"),
    ("namkeen", "Snacks"),
    ("bhujia", "Snacks"),
    ("mixture", "Snacks"),
    ("samosa", "Snacks"),
    ("kachori", "Snacks"),
    ("vada pav", "Snacks"),
    ("pav bhaji", "Snacks"),
    ("bhel puri", "Snacks"),
    ("bhel", "Snacks"),
    ("sev", "Snacks"),
    ("pakora", "Snacks"),
    ("pakode", "Snacks"),
    ("bread pakora", "Snacks"),
    ("sandwich", "Snacks"),
    ("golgappa", "Snacks"),
    ("golgappe", "Snacks"),
    ("gol gappa", "Snacks"),
    ("gol gappe", "Snacks"),
    ("panipuri", "Snacks"),
    ("pani puri", "Snacks"),
    ("dahi puri", "Snacks"),
    ("papdi chaat", "Snacks"),
    ("biscuit packet", "Snacks"),
    ("biscuit", "Snacks"),
    ("parle biscuit", "Snacks"),
    ("britannia biscuit", "Snacks"),
    ("hide and seek", "Snacks"),
    ("good day biscuit", "Snacks"),
    ("bourbon biscuit", "Snacks"),
    ("oreo", "Snacks"),
    ("cookie", "Snacks"),
    ("cookies", "Snacks"),
    ("cracker", "Snacks"),
    ("dairy milk chocolate", "Snacks"),
    ("dairy milk", "Snacks"),
    ("kitkat", "Snacks"),
    ("kit kat", "Snacks"),
    ("munch", "Snacks"),
    ("5 star", "Snacks"),
    ("fivestar", "Snacks"),
    ("perk", "Snacks"),
    ("silk chocolate", "Snacks"),
    ("snickers", "Snacks"),
    ("mars bar", "Snacks"),
    ("twix", "Snacks"),
    ("bounty", "Snacks"),
    ("ferrero rocher", "Snacks"),
    ("chocolate bar", "Snacks"),
    ("chocolate", "Snacks"),
    ("maggi noodles", "Snacks"),
    ("maggi", "Snacks"),
    ("cup noodles", "Snacks"),
    ("yippee noodles", "Snacks"),
    ("top ramen", "Snacks"),
    ("chai tea", "Snacks"),
    ("chai", "Snacks"),
    ("tea", "Snacks"),
    ("coffee", "Snacks"),
    ("cold coffee", "Snacks"),
    ("latte", "Snacks"),
    ("cappuccino", "Snacks"),
    ("americano", "Snacks"),
    ("espresso", "Snacks"),
    ("mocha", "Snacks"),
    ("filter coffee", "Snacks"),
    ("juice", "Snacks"),
    ("fresh juice", "Snacks"),
    ("milkshake", "Snacks"),
    ("smoothie", "Snacks"),
    ("lassi", "Snacks"),
    ("butter milk", "Snacks"),
    ("buttermilk", "Snacks"),
    ("cold drink", "Snacks"),
    ("coke", "Snacks"),
    ("pepsi", "Snacks"),
    ("sprite", "Snacks"),
    ("fanta", "Snacks"),
    ("thums up", "Snacks"),
    ("limca", "Snacks"),
    ("maaza", "Snacks"),
    ("frooti", "Snacks"),
    ("slice", "Snacks"),
    ("appy", "Snacks"),
    ("real juice", "Snacks"),
    ("real", "Snacks"),
    ("ice cream", "Snacks"),
    ("icecream", "Snacks"),
    ("gelato", "Snacks"),
    ("kulfi", "Snacks"),
    ("pastry", "Snacks"),
    ("donut", "Snacks"),
    ("doughnut", "Snacks"),
    ("muffin", "Snacks"),
    ("cupcake", "Snacks"),
    ("croissant", "Snacks"),
        ("punjabi tadka", "Food & Dining"),
        ("takatak", "Food & Dining"),
        ("aloo paratntha", "Food & Dining"),
        ("2 aloo paratha", "Food & Dining"),
        ("chole bhature plate", "Food & Dining"),
        ("dal tadka roti", "Food & Dining"),
        ("paneer parantha", "Food & Dining"),
        ("gobi paratha lunch", "Food & Dining"),
        ("taka tak food", "Food & Dining"),
        ("punjabi thali", "Food & Dining"),
        ("dhaba lunch", "Food & Dining"),
        ("masala dosa", "Food & Dining"),
        ("pav bhaji plate", "Food & Dining"),
        ("kathi roll chicken", "Food & Dining"),
        ("bikanervala lunch", "Food & Dining"),
        ("evening snacks", "Snacks"),
    ("snack time", "Snacks"),
]


class _PredictCache:
    """Bounded LRU cache for classification results — safe for bulk imports."""

    def __init__(self, maxsize: int = _PREDICT_CACHE_SIZE) -> None:
        self._maxsize = maxsize
        self._data: OrderedDict[str, str] = OrderedDict()

    def get(self, key: str) -> Optional[str]:
        if key not in self._data:
            return None
        self._data.move_to_end(key)
        return self._data[key]

    def set(self, key: str, value: str) -> None:
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)


class TransactionClassifier:
    """ML-based transaction categorization using scikit-learn."""

    def __init__(self):
        self._model = None
        self._vectorizer = None
        self._word_vectorizer = None
        self._initialized = False
        self._predict_cache = _PredictCache()
        self._training_fingerprint: Optional[str] = None
        self._categories = [
            "Income", "Food & Dining", "Food Delivery", "Groceries", "Fuel", "Transportation",
            "Shopping", "Utilities", "Entertainment", "Subscriptions", "Health",
            "Education", "Investments", "Housing/Rent", "Personal Care", "Snacks", "Other",
        ]

    # ------------------------------------------------------------------ #
    # Training data assembly
    # ------------------------------------------------------------------ #

    @staticmethod
    def _load_training_data_from_json() -> List[Tuple[str, str]]:
        """Load curated samples from backend/data/training_data.json."""
        if not _TRAINING_JSON.exists():
            return []
        try:
            payload = json.loads(_TRAINING_JSON.read_text(encoding="utf-8"))
            rows = payload.get("samples") or []
            out: List[Tuple[str, str]] = []
            for row in rows:
                desc = str(row.get("description", "")).strip().lower()
                cat = str(row.get("category", "")).strip()
                if desc and cat and cat != "Other":
                    out.append((desc, cat))
            logger.info("Loaded %d training samples from %s", len(out), _TRAINING_JSON.name)
            return out
        except Exception as exc:
            logger.warning("Failed to load %s: %s", _TRAINING_JSON, exc)
            return []

    def _load_training_data_from_file(self):
        """Load additional training samples from the user's Expenditure.xlsx.

        The sample file lives at the project root (Expenditure (1).xlsx) or
        under sample-data/. Returns a list of (description, category) tuples
        inferred from keyword matches against each row's description cell.
        """
        try:
            import pandas as pd

            candidate_paths = [
                os.path.join(os.path.dirname(__file__), "..", "Expenditure (1).xlsx"),
                os.path.join(os.path.dirname(__file__), "..", "sample-data", "Expenditure.xlsx"),
            ]
            training: List[Tuple[str, str]] = []
            for path in candidate_paths:
                if not os.path.exists(path):
                    continue
                try:
                    xls = pd.ExcelFile(path)
                    for sheet in xls.sheet_names:
                        df = xls.parse(sheet, header=None)
                        for _, row in df.iterrows():
                            cells = [str(c).strip() if pd.notna(c) else "" for c in row]
                            # The stacked format puts the description in column B (index 1).
                            desc = cells[1] if len(cells) > 1 else ""
                            if not desc or len(desc) <= 2:
                                continue
                            cat = self._infer_category_from_desc(desc)
                            if cat and cat != "Other":
                                training.append((desc.lower(), cat))
                    if len(training) > 30:
                        break
                except Exception as exc:
                    logger.warning("Failed to load training data from %s: %s", path, exc)
                    continue
            return training
        except Exception as exc:
            logger.warning("Failed to load training data from file: %s", exc)
            return []

    @staticmethod
    def _infer_category_from_desc(desc: str) -> Optional[str]:
        """Infer category for a description during training-data assembly.

        Used only to bootstrap training data from the user's exported Excel;
        it should be conservative — return None if unsure rather than
        poisoning the model with wrong labels.
        """
        return keyword_category(desc)

    def _merge_training_data(self) -> List[Tuple[str, str]]:
        """Merge JSON corpus, embedded fallback, and optional Expenditure export."""
        seen: set[str] = set()
        merged: List[Tuple[str, str]] = []

        def add(desc: str, cat: str) -> None:
            key = desc.lower().strip()
            if not key or key in seen or cat == "Other":
                return
            seen.add(key)
            merged.append((key, cat))

        for desc, cat in self._load_training_data_from_json():
            add(desc, cat)
        for desc, cat in TRAINING_DATA_FALLBACK:
            add(desc, cat)
        for desc, cat in self._load_training_data_from_file():
            add(desc, cat)
        return merged

    @staticmethod
    def _fingerprint(samples: List[Tuple[str, str]]) -> str:
        digest = hashlib.sha256()
        digest.update(str(len(samples)).encode())
        for desc, cat in samples[:50]:
            digest.update(f"{desc}|{cat}\n".encode())
        for desc, cat in samples[-50:]:
            digest.update(f"{desc}|{cat}\n".encode())
        return digest.hexdigest()[:16]

    def _try_load_persisted(self, fingerprint: str) -> bool:
        if not _MODEL_PATH.exists():
            return False
        try:
            import joblib

            bundle = joblib.load(_MODEL_PATH)
            if bundle.get("fingerprint") != fingerprint:
                logger.info("Persisted classifier stale — retraining")
                return False
            self._model = bundle["model"]
            self._vectorizer = bundle["char_vectorizer"]
            self._word_vectorizer = bundle["word_vectorizer"]
            self._training_fingerprint = fingerprint
            self._initialized = True
            logger.info(
                "Loaded persisted classifier (%d samples, fingerprint %s)",
                bundle.get("sample_count", "?"),
                fingerprint,
            )
            return True
        except Exception as exc:
            logger.warning("Could not load persisted classifier: %s", exc)
            return False

    def _persist(self, fingerprint: str, sample_count: int) -> None:
        try:
            import joblib

            _DATA_DIR.mkdir(parents=True, exist_ok=True)
            joblib.dump(
                {
                    "fingerprint": fingerprint,
                    "sample_count": sample_count,
                    "model": self._model,
                    "char_vectorizer": self._vectorizer,
                    "word_vectorizer": self._word_vectorizer,
                },
                _MODEL_PATH,
            )
            logger.info("Persisted classifier to %s", _MODEL_PATH)
        except Exception as exc:
            logger.warning("Failed to persist classifier: %s", exc)

    def _fit_model(self, merged: List[Tuple[str, str]]) -> bool:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from scipy.sparse import hstack

        texts, labels = zip(*merged)
        self._vectorizer = TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(3, 5),
            min_df=2,
            max_features=12_000,
            sublinear_tf=True,
        )
        self._word_vectorizer = TfidfVectorizer(
            analyzer="word",
            ngram_range=(1, 2),
            min_df=2,
            max_features=12_000,
            sublinear_tf=True,
        )
        X_words = self._word_vectorizer.fit_transform(texts)
        X_chars = self._vectorizer.fit_transform(texts)
        X = hstack([X_words, X_chars]).tocsr()

        self._model = LogisticRegression(
            max_iter=3000,
            C=4.0,
            class_weight="balanced",
            solver="lbfgs",
        )
        self._model.fit(X, labels)
        return True

    # ------------------------------------------------------------------ #
    # Init / fit
    # ------------------------------------------------------------------ #

    def _initialize(self) -> bool:
        if self._initialized:
            return True
        try:
            merged = self._merge_training_data()
            if not merged:
                logger.warning("No training data available — classifier disabled")
                return False

            fingerprint = self._fingerprint(merged)
            if self._try_load_persisted(fingerprint):
                return True

            self._fit_model(merged)
            self._training_fingerprint = fingerprint
            self._initialized = True
            self._persist(fingerprint, len(merged))
            logger.info(
                "ML transaction classifier trained on %d samples across %d categories",
                len(merged),
                len(set(cat for _, cat in merged)),
            )
            return True
        except Exception as exc:
            logger.warning("Failed to initialize ML classifier: %s", exc)
            return False

    # ------------------------------------------------------------------ #
    # Inference
    # ------------------------------------------------------------------ #

    def _featurize(self, descriptions):
        from scipy.sparse import hstack
        # Reuse the vectorizers fitted in _initialize(). Only transform here —
        # never refit — so this stays O(rows) instead of O(rows × training set).
        X_words = self._word_vectorizer.transform(descriptions)
        X_chars = self._vectorizer.transform(descriptions)
        return hstack([X_words, X_chars]).tocsr()

    def predict_category_with_confidence(self, description: str) -> Tuple[str, float, str]:
        """Predict category with confidence and source metadata.

        Confidence is the model's predicted probability for the chosen class.
        Returns ``("Other", 0.0, "unavailable")`` if the model isn't ready
        or the description doesn't pass the confidence threshold.
        """
        keyword_match = keyword_category(description)
        if keyword_match:
            # Keywords are the most reliable signal — they cover the long
            # tail of merchants we curated. Always trust them.
            return keyword_match, 0.95, "keyword"

        if not self._initialized and not self._initialize():
            return "Other", 0.0, "unavailable"

        try:
            normalized = normalize_for_classification(description)
            X = self._featurize([normalized])
            if X.nnz == 0:
                return "Other", 0.0, "ml"
            proba = self._model.predict_proba(X)[0]
            best_idx = int(proba.argmax())
            best_proba = float(proba[best_idx])
            best_label = self._model.classes_[best_idx]
            # Margin between top-1 and top-2 — if they're close, abstain.
            sorted_proba = sorted(proba, reverse=True)
            margin = sorted_proba[0] - sorted_proba[1] if len(sorted_proba) > 1 else sorted_proba[0]
            # Threshold is dynamic: short, vague descriptions need higher
            # confidence than long merchant names.
            token_count = len(description.split())
            if token_count <= 1:
                threshold = 0.65
            elif token_count <= 3:
                threshold = 0.45
            else:
                threshold = 0.30
            if best_proba < threshold or margin < 0.10:
                logger.debug(
                    "Low confidence (%.2f, margin %.2f) for '%s' → '%s'; returning Other",
                    best_proba, margin, description, best_label,
                )
                return "Other", best_proba, "ml"
            return best_label, best_proba, "ml"
        except Exception as exc:
            logger.error("Error predicting category: %s", exc)
            return "Other", 0.0, "error"

    def predict_category(self, description: str) -> str:
        key = description.lower()
        cached = self._predict_cache.get(key)
        if cached is not None:
            return cached
        category, _, _ = self.predict_category_with_confidence(description)
        self._predict_cache.set(key, category)
        return category

    def predict_many(self, descriptions: List[str]) -> Dict[str, str]:
        """Classify many descriptions in one vectorized pass.

        Returns a {description: category} map. Keyword hits and cached results
        are resolved without touching the model; everything else is featurized
        and scored in a single ``predict_proba`` call — dramatically faster than
        per-row inference for bulk imports.
        """
        uniques = {d for d in descriptions if d}
        result: Dict[str, str] = {}
        pending: List[str] = []
        for d in uniques:
            key = d.lower()
            cached = self._predict_cache.get(key)
            if cached is not None:
                result[d] = cached
                continue
            kw = keyword_category(d)
            if kw:
                result[d] = kw
                self._predict_cache.set(key, kw)
                continue
            pending.append(d)

        if pending and (self._initialized or self._initialize()):
            try:
                X = self._featurize([normalize_for_classification(d) for d in pending])
                probas = self._model.predict_proba(X)
                classes = self._model.classes_
                for d, proba in zip(pending, probas):
                    best_idx = int(proba.argmax())
                    best_proba = float(proba[best_idx])
                    sorted_proba = sorted(proba, reverse=True)
                    margin = (sorted_proba[0] - sorted_proba[1]
                              if len(sorted_proba) > 1 else sorted_proba[0])
                    token_count = len(d.split())
                    if token_count <= 1:
                        threshold = 0.65
                    elif token_count <= 3:
                        threshold = 0.45
                    else:
                        threshold = 0.30
                    label = ("Other" if (best_proba < threshold or margin < 0.10)
                             else classes[best_idx])
                    result[d] = label
                    self._predict_cache.set(d.lower(), label)
            except Exception as exc:
                logger.error("Batch categorization failed: %s", exc)
                for d in pending:
                    result.setdefault(d, "Other")
        else:
            for d in pending:
                result.setdefault(d, "Other")
        return result

    def predict_many_detailed(
        self, descriptions: List[str]
    ) -> Dict[str, Tuple[str, float, str]]:
        """Batch classify with confidence and source metadata."""
        uniques = {d for d in descriptions if d}
        result: Dict[str, Tuple[str, float, str]] = {}
        pending: List[str] = []
        for d in uniques:
            kw = keyword_category(d)
            if kw:
                result[d] = (kw, 0.95, "keyword")
                self._predict_cache.set(d.lower(), kw)
                continue
            pending.append(d)

        if pending and (self._initialized or self._initialize()):
            try:
                X = self._featurize([normalize_for_classification(d) for d in pending])
                probas = self._model.predict_proba(X)
                classes = self._model.classes_
                for d, proba in zip(pending, probas):
                    best_idx = int(proba.argmax())
                    best_proba = float(proba[best_idx])
                    sorted_proba = sorted(proba, reverse=True)
                    margin = (
                        sorted_proba[0] - sorted_proba[1]
                        if len(sorted_proba) > 1
                        else sorted_proba[0]
                    )
                    token_count = len(d.split())
                    if token_count <= 1:
                        threshold = 0.65
                    elif token_count <= 3:
                        threshold = 0.45
                    else:
                        threshold = 0.30
                    if best_proba < threshold or margin < 0.10:
                        label = "Other"
                    else:
                        label = classes[best_idx]
                    result[d] = (label, best_proba, "ml")
                    self._predict_cache.set(d.lower(), label)
            except Exception as exc:
                logger.error("Batch detailed categorization failed: %s", exc)
                for d in pending:
                    result.setdefault(d, ("Other", 0.0, "error"))
        else:
            for d in pending:
                result.setdefault(d, ("Other", 0.0, "unavailable"))
        return result


# Global instances
_nlp_parser: Optional[LocalNLPParser] = None
_classifier: Optional[TransactionClassifier] = None


def get_nlp_parser() -> LocalNLPParser:
    global _nlp_parser
    if _nlp_parser is None:
        _nlp_parser = LocalNLPParser()
    return _nlp_parser


def get_classifier() -> TransactionClassifier:
    global _classifier
    if _classifier is None:
        _classifier = TransactionClassifier()
    return _classifier


def parse_transaction_local(text: str) -> Optional[Dict[str, Any]]:
    parser = get_nlp_parser()
    return parser.parse_transaction(text)


def classify_transaction(description: str) -> str:
    classifier = get_classifier()
    return classifier.predict_category(description)


def classify_many(descriptions: List[str]) -> Dict[str, str]:
    """Batch-classify descriptions → {description: category}."""
    classifier = get_classifier()
    return classifier.predict_many(descriptions)


def classify_many_detailed(descriptions: List[str]) -> Dict[str, Dict[str, Any]]:
    """Batch classify with confidence and source per description."""
    classifier = get_classifier()
    raw = classifier.predict_many_detailed(descriptions)
    return {
        desc: {"category": cat, "confidence": conf, "source": src}
        for desc, (cat, conf, src) in raw.items()
    }


def classify_transaction_detailed(description: str) -> Dict[str, Any]:
    classifier = get_classifier()
    category, confidence, source = classifier.predict_category_with_confidence(description)
    return {"category": category, "confidence": confidence, "source": source}
