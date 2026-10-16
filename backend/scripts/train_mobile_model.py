#!/usr/bin/env python3
"""Train Batua's lightweight On-Device Mobile AI model.

Features:
- Dual-compatibility: runs fast on laptop CPU (takes ~5-15 seconds) or on cloud GPU
- Low memory footprint: model artifact is compact (< 10 MB)
- Evaluates accuracy, precision, recall and F1-score across all categories
- Exports:
    1. backend/data/classifier_mobile.joblib (Python / Chaquopy runtime)
    2. backend/data/classifier_mobile.onnx   (Native Android / ONNX Runtime)
    3. backend/data/mobile_model_metadata.json (Labels, thresholds, metrics)

Usage:
    python backend/scripts/train_mobile_model.py
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
DATA_DIR = BACKEND / "data"
sys.path.insert(0, str(BACKEND))

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


def load_dataset() -> tuple[list[str], list[str]]:
    csv_path = DATA_DIR / "mobile_training_data.csv"
    if not csv_path.exists():
        print("Dataset not found. Generating now...")
        from generate_mobile_dataset import main as gen_main
        gen_main()

    texts, labels = [], []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            txt = (row.get("text") or "").strip()
            cat = (row.get("category") or "").strip()
            if txt and cat:
                texts.append(txt)
                labels.append(cat)

    return texts, labels


def train_pipeline(texts: list[str], labels: list[str]):
    print(f"Loaded {len(texts):,} samples. Splitting into 80% train / 20% test...")
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    print("Building feature extraction (Word + Subword Character N-grams)...")
    from sklearn.pipeline import FeatureUnion

    word_vec = TfidfVectorizer(
        ngram_range=(1, 2),
        analyzer="word",
        min_df=2,
        sublinear_tf=True,
    )
    char_vec = TfidfVectorizer(
        ngram_range=(3, 5),
        analyzer="char_wb",
        min_df=2,
        max_features=15_000,
        sublinear_tf=True,
    )
    features = FeatureUnion([
        ("word", word_vec),
        ("char", char_vec),
    ])

    classifier = LogisticRegression(
        C=4.0,
        max_iter=1000,
        class_weight="balanced",
        solver="lbfgs",
        random_state=42,
    )

    pipeline = Pipeline([
        ("features", features),
        ("clf", classifier),
    ])

    print("Training lightweight model on CPU/laptop...")
    t0 = time.perf_counter()
    pipeline.fit(X_train, y_train)
    elapsed = time.perf_counter() - t0
    print(f"Training completed in {elapsed:.2f} seconds!")

    # Evaluation
    print("\nEvaluating on unseen test set (20% holdout)...")
    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n==========================================")
    print(f"  Overall Test Accuracy: {acc * 100:.2f}%")
    print(f"==========================================\n")

    report = classification_report(y_test, y_pred, digits=3, zero_division=0)
    print(report)

    # Save joblib model for mobile / chaquopy
    joblib_path = DATA_DIR / "classifier_mobile.joblib"
    joblib.dump(pipeline, joblib_path, compress=3)
    print(f"Saved optimized model to: {joblib_path} ({joblib_path.stat().st_size / 1024 / 1024:.2f} MB)")

    # Also save as backend/data/classifier.joblib for Batua's ml_nlp runtime
    backend_joblib = DATA_DIR / "classifier.joblib"
    joblib.dump(pipeline, backend_joblib, compress=3)
    print(f"Synced model to Batua backend: {backend_joblib}")

    # Try ONNX conversion if skl2onnx is installed
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import StringTensorType

        initial_type = [("text_input", StringTensorType([None, 1]))]
        onnx_model = convert_sklearn(pipeline, initial_types=initial_type)
        onnx_path = DATA_DIR / "classifier_mobile.onnx"
        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())
        print(f"Exported ONNX model for Android to: {onnx_path} ({onnx_path.stat().st_size / 1024 / 1024:.2f} MB)")
    except Exception as e:
        print(f"Notice: skl2onnx not present or skipped ONNX export ({e}).")
        print("Model is saved in .joblib format (directly runnable in Python / Chaquopy).")

    # Save metadata JSON
    classes = list(pipeline.classes_)
    metadata = {
        "model_name": "batua_mobile_ai_v1",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "num_classes": len(classes),
        "classes": classes,
        "test_accuracy": round(acc, 4),
        "training_samples": len(texts),
    }
    meta_path = DATA_DIR / "mobile_model_metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to: {meta_path}")

    # Live smoke check
    print("\n--- Live Test Predictions ---")
    test_queries = [
        "paid 450 to swiggy for biryani via upi",
        "starbucks cold coffee 320",
        "bescom electricity bill 1450 paid",
        "bought headphones on amazon for 1999",
        "uber trip to airport 650",
        "zerodha coin sip installment 5000",
        "received salary from company 75000",
        "hpcl petrol pump 1200",
    ]
    for q in test_queries:
        probs = pipeline.predict_proba([q])[0]
        best_idx = probs.argmax()
        cat = classes[best_idx]
        conf = probs[best_idx]
        print(f"  * {q!r}\n    -> Prediction: {cat} ({conf * 100:.1f}% confidence)\n")


if __name__ == "__main__":
    texts, labels = load_dataset()
    train_pipeline(texts, labels)
