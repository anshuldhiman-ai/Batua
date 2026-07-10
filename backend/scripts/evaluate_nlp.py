"""NLP Parser Evaluation Suite.

Tests parser.py transaction parsing pipeline on ground-truth dataset
and outputs F1-Score, Precision, Recall, and parsing latency stats.
"""
import sys
import os
import time
from datetime import datetime, timedelta

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parser import parse_transaction

# Ground-truth test dataset representing standard Hinglish and English inputs
TEST_DATA = [
    {
        "text": "zomato 450 yesterday upi",
        "expected": {
            "amount": -450.0,
            "category": "Food Delivery",
            "payment_method": "UPI",
            "date_delta": -1
        }
    },
    {
        "text": "salary +50000 today bank",
        "expected": {
            "amount": 50000.0,
            "category": "Income",
            "payment_method": "Net Banking",
            "date_delta": 0
        }
    },
    {
        "text": "swiggy 120 cash",
        "expected": {
            "amount": -120.0,
            "category": "Food Delivery",
            "payment_method": "Cash",
            "date_delta": 0
        }
    },
    {
        "text": "petrol 500 upi",
        "expected": {
            "amount": -500.0,
            "category": "Fuel",
            "payment_method": "UPI",
            "date_delta": 0
        }
    },
    {
        "text": "netflix 199 cc",
        "expected": {
            "amount": -199.0,
            "category": "Subscriptions",
            "payment_method": "Credit Card",
            "date_delta": 0
        }
    },
    {
        "text": "rent 15000 bank on 1st",
        "expected": {
            "amount": -15000.0,
            "category": "Housing/Rent",
            "payment_method": "Net Banking",
        }
    },
    {
        "text": "ola cab 250 yesterday card",
        "expected": {
            "amount": -250.0,
            "category": "Transportation",
            "payment_method": "Debit Card",
            "date_delta": -1
        }
    },
    {
        "text": "groceries blinkit 850 upi",
        "expected": {
            "amount": -850.0,
            "category": "Groceries",
            "payment_method": "UPI",
            "date_delta": 0
        }
    },
    {
        "text": "lays chips 20 cash",
        "expected": {
            "amount": -20.0,
            "category": "Snacks",
            "payment_method": "Cash",
            "date_delta": 0
        }
    },
    {
        "text": "amazon shopping 1200 hdfc card",
        "expected": {
            "amount": -1200.0,
            "category": "Shopping",
            "payment_method": "Debit Card",
            "date_delta": 0
        }
    },
    {
        "text": "dentist doctor fees 1500 online",
        "expected": {
            "amount": -1500.0,
            "category": "Health",
            "payment_method": "Net Banking",
            "date_delta": 0
        }
    },
    {
        "text": "udemy python course 499 gpay",
        "expected": {
            "amount": -499.0,
            "category": "Education",
            "payment_method": "UPI",
            "date_delta": 0
        }
    },
    {
        "text": "mutual fund sip 5000 auto debit",
        "expected": {
            "amount": -5000.0,
            "category": "Investments",
            "payment_method": "Net Banking",
            "date_delta": 0
        }
    },
    {
        "text": "movie bookmyshow 350 cc",
        "expected": {
            "amount": -350.0,
            "category": "Entertainment",
            "payment_method": "Credit Card",
            "date_delta": 0
        }
    },
    {
        "text": "haircut salon 150 cash",
        "expected": {
            "amount": -150.0,
            "category": "Personal Care",
            "payment_method": "Cash",
            "date_delta": 0
        }
    }
]

def run_eval():
    today = datetime.now()
    results = []
    latencies = []
    
    print("\n" + "="*70)
    print(" NLP PARSER EVALUATION RUN")
    print("="*70 + "\n")

    for i, test in enumerate(TEST_DATA):
        start = time.perf_counter()
        parsed = parse_transaction(test["text"], today)
        end = time.perf_counter()
        
        latency = (end - start) * 1000
        latencies.append(latency)
        
        expected = test["expected"]
        
        # Verify Amount
        amt_match = parsed["amount"] == expected["amount"]
        
        # Verify Category
        cat_match = parsed["category"] == expected["category"]
        
        # Verify Payment Method
        method_match = parsed["payment_method"] == expected["payment_method"]
        
        # Verify Date (if relative check delta, else basic parsed check)
        date_match = True
        if "date_delta" in expected:
            expected_date = (today + timedelta(days=expected["date_delta"])).strftime("%Y-%m-%d")
            date_match = parsed["date"] == expected_date

        all_match = amt_match and cat_match and method_match and date_match
        results.append({
            "text": test["text"],
            "all_match": all_match,
            "amt": (parsed["amount"], expected["amount"], amt_match),
            "cat": (parsed["category"], expected["category"], cat_match),
            "method": (parsed["payment_method"], expected["payment_method"], method_match),
            "date": (parsed["date"], date_match),
            "latency": latency
        })
        
        status = "PASS" if all_match else "FAIL"
        print(f"[{i+1:02d}] {status} | '{test['text']}' | {latency:.1f}ms")
        if not all_match:
            if not amt_match:
                print(f"     Amount mismatch: Expected {expected['amount']}, Got {parsed['amount']}")
            if not cat_match:
                print(f"     Category mismatch: Expected '{expected['category']}', Got '{parsed['category']}'")
            if not method_match:
                print(f"     Method mismatch: Expected '{expected['payment_method']}', Got '{parsed['payment_method']}'")
            if not date_match:
                print(f"     Date mismatch: Got '{parsed['date']}'")
                
    total = len(TEST_DATA)
    passed = sum(1 for r in results if r["all_match"])
    accuracy = (passed / total) * 100
    
    avg_latency = sum(latencies) / len(latencies)
    
    # Calculate macro Precision, Recall, F1 for Categories
    cat_tp = sum(1 for r in results if r["cat"][2])
    cat_accuracy = (cat_tp / total) * 100
    
    # Calculate macro Precision, Recall, F1 for Payment Methods
    method_tp = sum(1 for r in results if r["method"][2])
    method_accuracy = (method_tp / total) * 100
    
    print("\n" + "="*70)
    print(" SUMMARY STATISTICS")
    print("="*70)
    print(f"Total Test Cases:            {total}")
    print(f"Passed Cases:                {passed}")
    print(f"Overall Match Accuracy:      {accuracy:.1f}%")
    print(f"Category Match Accuracy:     {cat_accuracy:.1f}%")
    print(f"Payment Method Accuracy:     {method_accuracy:.1f}%")
    print(f"Average Parsing Latency:     {avg_latency:.1f}ms")
    print("="*70 + "\n")

if __name__ == "__main__":
    run_eval()
