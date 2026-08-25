import sys
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, 'backend')
from parser import parse_transaction, _TYPED_EACH_RE

# Test cases for "X of Y each" pattern
test_cases = [
    "madangles 2 packets of 20 rs each",
    "2 packets of 20 rs each",
    "20 each",
    "3 bottles of 50 each",
    "5 items of 10 rs each upi",
    "zomato 2 packets of 20 rs each yesterday",
]

print("Testing 'X of Y each' pattern parsing:")
print("=" * 60)

for test in test_cases:
    print(f"\nInput: {test}")
    m = _TYPED_EACH_RE.search(test)
    if m:
        print(f"  Regex matched: {m.group(0)}")
    else:
        print(f"  Regex did NOT match")

    try:
        result = parse_transaction(test)
        print(f"  Description: {result.get('description')}")
        print(f"  Amount: {result.get('amount')}")
        print(f"  Quantity: {result.get('quantity')}")
        print(f"  Price: {result.get('price')}")
        print(f"  Price Text: {result.get('price_text', 'N/A')}")
        print(f"  Category: {result.get('category')}")
        print(f"  Payment Method: {result.get('payment_method')}")
    except Exception as e:
        print(f"  ERROR: {e}")

print("\n" + "=" * 60)
print("Test complete!")
