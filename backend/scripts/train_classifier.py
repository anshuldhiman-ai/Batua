#!/usr/bin/env python3
"""Train and persist the transaction classifier offline.

Usage (from project root):
    python backend/scripts/build_training_data.py   # refresh JSON corpus
    python backend/scripts/train_classifier.py      # fit + save joblib model
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

import ml_nlp  # noqa: E402


def main() -> None:
    json_path = BACKEND / "data" / "training_data.json"
    if not json_path.exists():
        print("training_data.json missing — run build_training_data.py first")
        sys.exit(1)

    # Remove stale persisted model so we force a fresh train.
    model_path = BACKEND / "data" / "classifier.joblib"
    if model_path.exists():
        model_path.unlink()
        print(f"Removed stale {model_path.name}")

    clf = ml_nlp.TransactionClassifier()
    t0 = time.perf_counter()
    ok = clf._initialize()
    elapsed = time.perf_counter() - t0
    if not ok:
        print("Training failed")
        sys.exit(1)

    merged = clf._merge_training_data()
    print(f"Trained on {len(merged)} samples in {elapsed:.1f}s")
    print(f"Model saved to {model_path}")

    # Quick smoke checks
    samples = [
        ("swiggy dinner order", "Food Delivery"),
        ("zerodha sip installment", "Investments"),
        ("bescom electricity bill", "Utilities"),
        ("ola cab airport", "Transportation"),
        ("unknown xyz merchant", "Other"),
    ]
    for desc, expected in samples:
        cat, conf, src = clf.predict_category_with_confidence(desc)
        mark = "ok" if cat == expected else "??"
        print(f"  [{mark}] {desc!r} -> {cat} ({src}, {conf:.2f})")


if __name__ == "__main__":
    main()
