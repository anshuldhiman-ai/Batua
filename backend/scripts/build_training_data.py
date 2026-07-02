#!/usr/bin/env python3
"""Build backend/data/training_data.json from curated seeds + realistic variants.

Run from project root:
    python backend/scripts/build_training_data.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from ml_nlp import TRAINING_DATA_FALLBACK  # noqa: E402

OUT = BACKEND / "data" / "training_data.json"

# Extra curated samples beyond TRAINING_DATA_FALLBACK — Indian merchants & phrasing.
EXTRA_SAMPLES: dict[str, list[str]] = {
    "Income": [
        "hdfc salary credit", "icici salary neft", "axis payroll", "wipro salary",
        "tcs salary credit", "infosys salary", "cognizant payroll", "accenture salary",
        "hcl salary credit", "capgemini salary", "amazon seller payout", "meesho seller payment",
        "instamojo payout", "razorpay settlement", "stripe payout india", "youtube ad revenue",
        "google adsense payment", "affiliate commission", "referral bonus credited",
        "annual bonus credit", "joining bonus", "retention bonus", "incentive credited",
        "overtime pay", "shift allowance", "hra reimbursement", "medical reimbursement",
        "leave encashment", "gratuity payment", "pf withdrawal", "epf withdrawal",
        "nps withdrawal", "mutual fund redemption credit", "stock sale proceeds",
        "dividend from hdfc bank", "interest on savings", "fd maturity credit",
        "rd maturity amount", "ppf withdrawal", "insurance maturity claim",
        "rental income received", "airbnb payout", "olx sale payment received",
        "cash deposit by customer", "payment received via gpay", "phonepe payment received",
        "collect request from rahul", "money received from wife", "transfer from savings",
    ],
    "Food Delivery": [
        "swiggy instamart groceries", "swiggy one membership order", "zomato pro order",
        "zomato hyperpure", "eatclub order", "tossin pizza delivery", "la pinoz pizza",
        "oven story pizza", "nomad pizza delivery", "onesta pizza", "california burrito",
        "taco bell delivery", "subway delivery", "burger king delivery", "wendy's delivery",
        "starbucks delivery swiggy", "third wave delivery", "chaayos delivery",
        "momo zone delivery", "wow momo delivery", "haldiram delivery swiggy",
        "paradise biryani delivery", "biryani by kilo", "lunch box delivery",
        "tiffin service monthly", "homemade food delivery", "cloud kitchen order",
    ],
    "Food & Dining": [
        "barbeque nation buffet", "mainland china restaurant", "punjabi by nature",
        "punjabi tadka", "punjabi tadka restaurant", "takatak", "takatak food",
        "taka tak", "aloo paratha", "aloo parantha", "aloo paratntha", "paneer paratha",
        "gobi paratha", "methi paratha", "mix paratha", "butter naan", "garlic naan",
        "chole bhature", "chole bhatura", "dal makhani", "dal tadka", "paneer tikka",
        "paneer butter masala", "butter chicken", "chicken tikka", "mutton rogan josh",
        "fish fry", "veg thali", "non veg thali", "punjabi thali", "rajasthani thali",
        "south indian meals", "north indian lunch", "dosa plate", "masala dosa",
        "rava dosa", "mysore masala dosa", "idli vada", "medu vada", "uttapam",
        "pav bhaji", "misal pav", "vada pav", "kathi roll", "egg roll",
        "chicken shawarma", "seekh kebab", "tandoori chicken", "roomali roti",
        "bikanervala", "bikanerwala", "haldiram dine", "sagar ratna lunch",
        "saravana bhavan breakfast", "mtr rava idli", "rajdhani thali restaurant",
        "wow momo plate", "momos steamed", "chinese sizzler", "fried rice lunch",
        "manchurian dry", "hakka noodles", "soup and salad", "dhaba dinner",
        "highway dhaba", "local restaurant bill", "tiffin center lunch",
        "canteen food coupon", "office cafeteria", "food court lunch",
        "social offline dining", "truffles cafe bill", "third wave cafe bill",
        "chaayos outlet", "nandini hotel lunch", "taj hotel dinner",
        "pizza express dine in", "social kitchen bar", "hard rock cafe",
        "beer cafe bill", "brewery bill", "sushi bar dinner", "thai restaurant",
        "korean restaurant bill", "italian restaurant", "mexican grill",
        "office team lunch", "client dinner meeting", "birthday dinner restaurant",
        "anniversary dinner", "family lunch outing", "weekend brunch",
        "goli vada pav", "panchavati restaurant", "naivedyam meals",
        "andhra meals", "kerala parotta", "appam stew", "puttu kadala",
        "pongal breakfast", "pesarattu chutney", "hyderabadi biryani dine",
        "lucknowi biryani", "kebab corner", "roll king", "frankie junction",
    ],
    "Groceries": [
        "blinkit 10 min delivery", "zepto groceries", "bigbasket monthly order",
        "jiomart essentials", "dmart monthly stock", "reliance smart groceries",
        "more supermarket bill", "spencers daily needs", "nature's basket organic",
        "ratnadeep super market", "lulu hypermarket", "star bazaar groceries",
        "local kirana monthly", "vegetable vendor", "fruit market purchase",
        "onions potatoes tomatoes", "atta rice dal oil", "monthly ration stock",
        "amul butter milk eggs", "mother dairy products", "organic vegetables box",
        "farm fresh basket", "milkbasket subscription", "country delight milk",
    ],
    "Fuel": [
        "hp petrol pump sector 18", "iocl diesel fill", "bpcl petrol noida",
        "shell fuel station", "nayara energy petrol", "reliance petrol pump",
        "bike petrol fill", "car diesel tank full", "cng fill station",
        "auto lpg refill", "highway toll petrol", "interstate fuel stop",
    ],
    "Transportation": [
        "ola outstation trip", "uber intercity", "rapido bike ride", "rapido auto fare",
        "delhi metro smart card", "mumbai local train ticket", "irctc tatkal booking",
        "irctc ac 2 tier", "redbus sleeper bus", "abhibus volvo", "makemytrip flight",
        "goibibo flight booking", "indigo flight delhi mumbai", "vistara economy",
        "spicejet ticket", "air india domestic", "fastag recharge paytm",
        "highway toll plaza", "parking mall select city", "valet parking charge",
        "zoomcar rental", "revv self drive", "bounce scooter ride", "yulu bike rent",
        "meru cab airport", "mega cab", "savaari outstation", "blusmart ev cab",
    ],
    "Shopping": [
        "amazon great indian sale", "amazon pay shopping", "flipkart big billion days",
        "myntra end of reason sale", "ajio fashion order", "meesho reseller order",
        "nykaa beauty order", "croma electronics", "reliance digital tv",
        "vijay sales ac", "boat airdopes", "noise smartwatch", "fire boltt watch",
        "oneplus buds", "samsung galaxy phone", "iphone purchase emi",
        "macbook air purchase", "dell laptop order", "hp printer ink",
        "ikea furniture", "pepperfry sofa", "urban ladder bed", "home centre decor",
        "decathlon sports shoes", "puma running shoes", "nike air max",
        "h&m shirt", "zara dress", "westside kurta", "pantaloons formal wear",
        "shoppers stop sale", "lifestyle store", "central mall shopping",
        "amazon basics order", "flipkart grocery appliances", "tatacliq fashion",
    ],
    "Utilities": [
        "bescom electricity bill", "tata power online payment", "msedcl maharashtra bill",
        "bwssb water bill bangalore", "delhi jal board", "indraprastha gas bill",
        "igl piped gas payment", "airtel postpaid bill", "jio postpaid recharge",
        "vi mobile bill", "bsnl landline bill", "jio fiber monthly bill",
        "act fibernet bill", "hathway broadband", "tata play dth recharge",
        "dish tv recharge", "sun direct dth", "airtel dth pack",
        "property tax online", "mcd property tax", "bbmp property tax",
        "traffic challan payment", "driving licence fee", "vehicle rc renewal",
        "pollution certificate fee", "lpg cylinder booking indane",
    ],
    "Subscriptions": [
        "netflix monthly plan", "spotify premium india", "amazon prime annual",
        "disney hotstar super", "sony liv premium", "zee5 premium", "jio cinema plus",
        "youtube premium family", "apple music subscription", "google one 100gb",
        "microsoft 365 personal", "adobe creative cloud", "canva pro annual",
        "notion plus plan", "github pro subscription", "chatgpt plus renewal",
        "cult fit elite membership", "cure fit live", "gold gym monthly",
        "anytime fitness annual", "kindle unlimited", "audible membership",
    ],
    "Entertainment": [
        "bookmyshow pvr ticket", "inox movie couple seat", "carnival cinemas",
        "cinepolis recliner", "netflix watch party snacks", "steam game purchase",
        "playstation store game", "xbox game pass ultimate", "epic games fortnite vbucks",
        "bgmi uc purchase", "wonderla tickets", "imagica theme park",
        "kingdom of dreams show", "comedy show ticket", "standup comedy live",
        "concert ticket bookmyshow", "ipl match ticket", "cricket stadium ticket",
    ],
    "Health": [
        "apollo pharmacy medicines", "medplus monthly medicines", "pharmeasy order",
        "tata 1mg delivery", "netmeds prescription", "truemeds generic medicines",
        "practo doctor consultation", "mfine online consult", "thyrocare full body test",
        "dr lal path labs", "metropolis blood test", "apollo diagnostics package",
        "dental checkup clinic", "eye test lenskart", "specsmakers glasses",
        "physiotherapy session", "yoga class wellness", "gym protein supplement",
        "hospital opd fee", "emergency room bill", "health insurance copay",
    ],
    "Education": [
        "udemy course purchase", "coursera specialization", "unacademy plus subscription",
        "byjus class fees", "vedantu live classes", "whitehat jr coding",
        "school annual fees", "college semester fees", "university tuition",
        "coaching iit jee", "neet coaching fees", "gate test series",
        "amazon books order", "flipkart textbooks", "stationery shop school",
        "exam form fee", "certification exam aws", "google cloud certification",
    ],
    "Investments": [
        "zerodha sip mutual fund", "groww sip installment", "upstox equity buy",
        "paytm money sip", "kuvera direct plan", "coin by zerodha mf",
        "hdfc securities trade", "icici direct stocks", "angel one brokerage",
        "ppf deposit post office", "nps contribution tier 1", "elss tax saving sip",
        "fixed deposit hdfc", "recurring deposit sbi", "sovereign gold bond",
        "wazirx crypto buy", "coindcx bitcoin", "term plan hdfc life premium",
        "health insurance policy premium", "lic premium payment",
    ],
    "Housing/Rent": [
        "house rent january", "flat rent upi", "pg rent monthly", "hostel fees semester",
        "society maintenance june", "apartment maintenance charge", "builder floor rent",
        "security deposit landlord", "brokerage flat rent", "stamp duty registration",
        "home loan emi hdfc", "housing loan sbi emi", "property tax society",
    ],
    "Personal Care": [
        "lakme salon haircut", "looks salon facial", "urban company grooming",
        "nykaa cosmetics order", "mamaearth skincare", "plum body lotion",
        "dove shampoo purchase", "gillette razor blades", "colgate toothpaste",
        "himalaya face wash", "nivea moisturizer", "ponds cream",
        "mehndi bridal package", "spa body massage", "nail art parlour",
    ],
    "Snacks": [
        "lay's chips packet", "kurkure masala munch", "haldiram namkeen",
        "bikaji bhujia", "parle g biscuits", "oreo cookies pack",
        "dairy milk silk", "kitkat break", "snickers bar", "munch chocolate",
        "maggi 2 minute", "yippee noodles", "chai tapri", "cutting chai",
        "cold coffee ccd", "fresh juice stall", "lassi sweet shop",
        "ice cream corner", "kwality walls", "amul ice cream",
        "samosa street vendor", "vada pav stall", "pani puri evening",
    ],
}

PREFIXES = ["", "upi ", "paid ", "payment ", "txn ", "debited ", "spent on ", "purchase "]
SUFFIXES = ["", " bill", " payment", " order", " purchase", " via upi", " online"]


def _variants(phrase: str) -> list[str]:
    base = phrase.lower().strip()
    out = {base}
    for pre in PREFIXES:
        for suf in SUFFIXES:
            v = f"{pre}{base}{suf}".strip()
            if len(v) >= 3:
                out.add(v)
    return list(out)


def build() -> list[dict]:
    seen: set[str] = set()
    samples: list[dict] = []

    def add(desc: str, category: str) -> None:
        key = desc.lower().strip()
        if not key or key in seen:
            return
        seen.add(key)
        samples.append({"description": key, "category": category})

    for desc, cat in TRAINING_DATA_FALLBACK:
        add(desc, cat)

    for category, phrases in EXTRA_SAMPLES.items():
        for phrase in phrases:
            for variant in _variants(phrase):
                add(variant, category)

    return samples


def main() -> None:
    samples = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 2,
        "description": "Curated Indian personal-finance transaction training set for Batua classifier",
        "sample_count": len(samples),
        "samples": samples,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    by_cat: dict[str, int] = {}
    for s in samples:
        by_cat[s["category"]] = by_cat.get(s["category"], 0) + 1
    print(f"Wrote {len(samples)} samples to {OUT}")
    for cat, n in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {n}")


if __name__ == "__main__":
    main()
