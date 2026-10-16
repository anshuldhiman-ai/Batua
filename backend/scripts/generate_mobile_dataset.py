"""Generate rich, high-coverage training datasets for Batua's Mobile AI model.

Generates diverse transaction texts including:
- Natural conversational inputs ("paid 350 for lunch at haldiram via upi")
- Indian Bank SMS formats (HDFC, SBI, ICICI, Axis, Kotak, PayTM)
- Short merchant-only notes ("blinkit", "uber trip", "zerodha sip")
- Hinglish & multi-language slang ("chai sutta 40", "dosa khaya 120 gpay")
- Split/multi-item descriptions

Outputs:
- backend/data/mobile_training_data.jsonl
- backend/data/mobile_training_data.csv
"""
from __future__ import annotations

import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
DATA_DIR = BACKEND / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- #
# Domain Knowledge Base
# --------------------------------------------------------------------------- #

CATEGORIES = [
    "Food & Dining",
    "Food Delivery",
    "Fast Food",
    "Groceries",
    "Beverages",
    "Refreshments",
    "Snacks",
    "Fruits",
    "Fuel",
    "Transportation",
    "Shopping",
    "Entertainment",
    "Utilities",
    "Housing/Rent",
    "Healthcare",
    "Education",
    "Personal Care",
    "Travel",
    "Investments",
    "Subscriptions",
    "Income",
    "Other",
]

MERCHANTS_BY_CATEGORY: dict[str, list[str]] = {
    "Food & Dining": [
        "Barbeque Nation", "Mainland China", "Punjabi Rasoi", "Sagar Ratna",
        "Saravana Bhavan", "Haldiram Dine In", "Bikanervala Restaurant", "Social Kitchen",
        "Truffles Cafe", "Toit Brewpub", "Chili's Grill", "Farzi Cafe", "Dhaba near Highway",
        "Annapurna Mess", "Local Udupi Hotel", "Biryani By Kilo Dine", "Paradise Biryani",
        "Behrouz Biryani", "Anand Sweets", "Shiv Sagar", "Cream Centre", "Giani's Dine",
        "Copper Chimney", "Pecos Pub", "Empire Restaurant", "Nandhini Deluxe",
    ],
    "Food Delivery": [
        "Swiggy", "Zomato", "EatClub", "Box8", "Magicpin Food", "Fasos",
        "Mojo Pizza", "Ovenstory", "Behrouz Delivery", "Swiggy Instamart Snack",
        "Lunchbox", "The Good Bowl", "Firangi Bake", "Sweet Truth", "Zomato Gold Order",
        "swigy", "swiggyy", "zomatto", "zomatoo", "swigy order",
    ],
    "Fast Food": [
        "Domino's Pizza", "Pizza Hut", "McDonald's", "Burger King", "KFC", "Subway",
        "Taco Bell", "La Pino'z Pizza", "Wow! Momo", "Rolls King", "Tibbs Frankie",
        "Wendy's", "Dunkin' Donuts", "Mad Over Donuts", "Chai Point Snacks",
    ],
    "Groceries": [
        "Blinkit", "Zepto", "BigBasket", "Instamart", "DMart Ready", "Reliance Smart",
        "Nature's Basket", "More Megastore", "Local Kirana Store", "Sabzi Mandi",
        "Spencers", "Dunzo Daily", "Country Delight Milk", "Otipy Fresh", "Mother Dairy",
        "bigbaskt", "bigbaskt order",
    ],
    "Beverages": [
        "Starbucks Coffee", "Third Wave Coffee", "Blue Tokai", "Chaayos", "Chai Point",
        "Cafe Coffee Day", "Cold Love Shake", "Keventers Milkshake", "Lassi Shop",
    ],
    "Refreshments": [
        "Bisleri Water 20L", "Kinley Bottled Water", "Sugarcane Juice Stall",
        "Fresh Lime Soda Corner", "Tender Coconut Water", "Real Fruit Juice Store",
    ],
    "Snacks": [
        "Haldiram Bhujia", "Bikaji Snacks", "Lays Chips Store", "Local Bakery Biscuits",
        "Chai Sutta Corner", "Samosa Hub", "Pani Puri Corner", "Vada Pav Stall",
        "kurkuree", "kurkuree packet", "samosay",
    ],
    "Fruits": [
        "Fresh Fruit Vendor", "Apple Papaya Store", "Mangoes Delivery", "Seasonal Fruits Mart",
    ],
    "Fuel": [
        "Indian Oil Petrol Pump", "HPCL Fuel Station", "Bharat Petroleum BPCL",
        "Shell Petrol Bunk", "Reliance Petroleum", "CNG Filling Station",
        "petorl", "petorl pump",
    ],
    "Transportation": [
        "Uber India", "Ola Cabs", "Rapido Bike Taxi", "Namma Metro Card Recharge",
        "Delhi Metro DMRC", "IRCTC Train Ticket", "Auto Rickshaw Fare", "Fastag Toll NHAI",
        "RedBus Ticket", "AbhiBus", "City Parking Fare", "Traffic Challan Fine",
        "uberr", "uberr ride",
    ],
    "Shopping": [
        "Amazon India", "Flipkart", "Myntra", "Ajio", "Meesho", "Nykaa Cosmetics",
        "Zara Clothing", "H&M Store", "Uniqlo", "Croma Electronics", "Reliance Digital",
        "IKEA Home", "Decathlon Sports", "Lenskart Glasses", "Zudio", "Westside",
    ],
    "Entertainment": [
        "BookMyShow Movie Tickets", "PVR INOX Cinemas", "Cinepolis", "Wonderla Park",
        "Smaaash Bowling", "Steam Game Store", "Sony PlayStation Store", "Escape Room",
    ],
    "Utilities": [
        "Electricity Bill BESCOM", "Tata Power Bill", "Mahanagar Gas MGL",
        "Airtel Broadband Fiber", "Jio Fiber Bill", "ACT Fibernet", "Adani Electricity",
        "BWSSB Water Supply", "Mobile Postpaid Bill Vi", "DTH Tata Play Recharge",
        "elecricity bill",
    ],
    "Housing/Rent": [
        "Flat Rent to Landlord", "Apartment Maintenance Society", "Nobroker Rent Pay",
        "PG Monthly Rent", "Hostel Fee", "House Maid Salary", "Security Guard Fund",
    ],
    "Healthcare": [
        "Apollo Pharmacy", "1mg Medicines", "PharmEasy", "Netmeds", "MedPlus Store",
        "Max Healthcare Doctor Consultation", "Practo Online Consult", "Dr Lal Pathlabs",
        "Dental Clinic Scaling", "Eye Checkup Lenskart", "Fortis Hospital Bill",
    ],
    "Education": [
        "Coursera Subscription", "Udemy Course", "College Semester Fee", "School Tuition",
        "Allen Career Institute", "Coaching Class Fee", "Books at Crossword",
    ],
    "Personal Care": [
        "Urban Company Salon", "Enrich Salon Haircut", "Tony & Guy", "Naturals Salon",
        "Gym Membership Cult.fit", "Gold's Gym Fee", "Spa & Massage Therapy",
        "facewsh", "facewsh purchase",
    ],
    "Travel": [
        "MakeMyTrip Hotel Booking", "Goibibo Flights", "IndiGo Airlines", "Air India",
        "Airbnb Stay Booking", "Cleartrip", "Agoda Resort Booking", "Visa Application VFS",
    ],
    "Investments": [
        "Zerodha Coin SIP", "Groww Mutual Fund", "Upstox Demat Account",
        "NPS Tier 1 Contribution", "PPF Deposit SBI", "Fixed Deposit HDFC",
        "SGB Sovereign Gold Bond", "Kuvera Equity Fund", "IndMoney US Stocks",
        "zerodah", "zerodah sip",
    ],
    "Subscriptions": [
        "Netflix Premium Subscription", "Spotify Individual Plan", "YouTube Premium Family",
        "Amazon Prime Membership", "Apple iCloud 200GB", "Google One Storage",
        "Disney+ Hotstar", "ChatGPT Plus OpenAI", "The Ken Journalism",
    ],
    "Income": [
        "Monthly Salary Credited", "Wipro Payroll Transfer", "TCS Salary Deposit",
        "Freelance Client Payment Upwork", "Dividend Credit TCS", "Tax Refund Income Tax",
        "Rental Income from Tenant", "Interest Credited Savings Account", "Cashback Received",
        "salry", "salry credit",
    ],
    "Other": [
        "Misc General Store", "ATM Cash Withdrawal", "Transferred to Friend",
        "Pooja Store Items", "Courier DTDC Express", "Hardware Store Screws",
    ],
}

PAYMENT_METHODS = ["UPI", "GPay", "PhonePe", "PayTM", "Credit Card", "Debit Card", "Net Banking", "Cash", "Auto Debit"]

SMS_TEMPLATES = [
    "Dear Customer, your A/C {ac} is debited by Rs {amt:.2f} on {date} towards {merchant} via {pm}. Bal: Rs {bal}.",
    "Rs {amt:.2f} debited from your card ending {card} at {merchant} on {date}. If not you, call bank.",
    "Alert: Paid Rs {amt} to {merchant} via UPI Ref {ref}. Available balance Rs {bal}.",
    "Txn of INR {amt} done on your account for {merchant} via {pm} on {date}.",
    "Sent Rs {amt} to {merchant} from Bank A/c xx{ac} on {date}.",
    "Your a/c has been debited with INR {amt:.2f} towards {merchant} on {date}.",
]

CASUAL_PATTERNS = [
    "paid {amt} for {item} at {merchant}",
    "{amt} sent to {merchant} via {pm}",
    "bought {item} at {merchant} for {amt}",
    "{merchant} {amt} {pm}",
    "{merchant} bill {amt}",
    "spent {amt} on {item} ({merchant})",
    "{item} from {merchant} {amt} rupees",
    "ordered {item} on {merchant} for {amt}",
    "{merchant} payment of {amt}",
    "{amt} rs at {merchant} using {pm}",
    "{merchant} - {item} - {amt}",
    "paid {merchant} {amt} rs for {item}",
    "kharcha: {merchant} {amt}",
    "{merchant} charges {amt}",
]

SHORT_PATTERNS = [
    "{merchant}",
    "{merchant} {amt}",
    "{item} {amt}",
    "{merchant} {item}",
]

# --------------------------------------------------------------------------- #
# Generator Core
# --------------------------------------------------------------------------- #

def generate_samples_for_category(category: str, count: int = 500) -> list[dict]:
    merchants = MERCHANTS_BY_CATEGORY.get(category, ["Merchant"])
    samples = []
    
    for _ in range(count):
        merchant = random.choice(merchants)
        amt = random.choice([
            random.randint(15, 200),
            random.randint(200, 1500),
            random.randint(1500, 8000),
            random.randint(10000, 60000) if category in ["Income", "Investments", "Housing/Rent", "Travel"] else random.randint(50, 2500)
        ])
        pm = random.choice(PAYMENT_METHODS)
        ac = random.randint(1000, 9999)
        card = random.randint(1000, 9999)
        ref = random.randint(100000000, 999999999)
        bal = random.randint(5000, 150000)
        date = f"2026-10-{random.randint(1, 28):02d}"
        
        # Decide format: SMS (30%), Casual (50%), Short (20%)
        mode = random.choices(["sms", "casual", "short"], weights=[30, 50, 20])[0]
        
        if mode == "sms":
            tmpl = random.choice(SMS_TEMPLATES)
            text = tmpl.format(
                ac=ac, amt=amt, date=date, merchant=merchant, pm=pm, bal=bal, card=card, ref=ref
            )
        elif mode == "casual":
            tmpl = random.choice(CASUAL_PATTERNS)
            item = merchant.split()[0].lower()
            text = tmpl.format(
                amt=amt, item=item, merchant=merchant, pm=pm
            )
        else:
            tmpl = random.choice(SHORT_PATTERNS)
            item = merchant.split()[-1].lower()
            text = tmpl.format(merchant=merchant, amt=amt, item=item)
            
        samples.append({
            "text": text.strip(),
            "category": category,
            "merchant": merchant,
            "amount": amt,
            "payment_method": pm,
        })
        
    return samples


def main() -> None:
    all_samples: list[dict] = []
    
    print("Generating synthetic dataset across categories...")
    for cat in CATEGORIES:
        # Generate ~550 samples per category -> ~12,000 total
        samples = generate_samples_for_category(cat, count=550)
        all_samples.extend(samples)
        print(f"  + {cat:<22}: {len(samples)} samples")
        
    random.shuffle(all_samples)
    
    jsonl_path = DATA_DIR / "mobile_training_data.jsonl"
    csv_path = DATA_DIR / "mobile_training_data.csv"
    
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for s in all_samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
            
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "category", "merchant", "amount", "payment_method"])
        writer.writeheader()
        writer.writerows(all_samples)
        
    print(f"\nSuccessfully generated {len(all_samples):,} training samples!")
    print(f"  JSONL: {jsonl_path}")
    print(f"  CSV:   {csv_path}")


if __name__ == "__main__":
    main()
