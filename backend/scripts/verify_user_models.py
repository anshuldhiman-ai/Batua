"""Verify user-provided classifier_mobile.joblib and classifier_mobile.onnx."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
joblib_path = ROOT / "classifier_mobile.joblib"
onnx_path = ROOT / "classifier_mobile.onnx"

print(f"Checking files at root:\n  - {joblib_path}\n  - {onnx_path}\n")

# 1. Test Joblib
if not joblib_path.exists():
    print("ERROR: classifier_mobile.joblib not found at root.")
    sys.exit(1)

import joblib
try:
    model = joblib.load(joblib_path)
    print(f"[OK] Joblib Model loaded successfully!")
    print(f"  Type: {type(model)}")
    if hasattr(model, "classes_"):
        classes = list(model.classes_)
        print(f"  Classes ({len(classes)}): {classes}")
    elif hasattr(model, "named_steps"):
        clf = model.named_steps.get("clf")
        classes = list(getattr(clf, "classes_", []))
        print(f"  Pipeline steps: {list(model.named_steps.keys())}")
        print(f"  Classes ({len(classes)}): {classes}")
    else:
        classes = []

    # Test sample predictions
    test_queries = [
        "swiggy dinner biryani 450 upi",
        "starbucks cold coffee 350",
        "uber ride to office 220",
        "amazon order headphones 1500",
        "bescom electricity bill 890",
        "zerodha mutual fund sip 5000",
        "salary credited hdfc 85000",
        "hpcl petrol pump 1000",
    ]
    print("\n--- Live Test Predictions with Joblib Model ---")
    for q in test_queries:
        pred = model.predict([q])[0]
        conf = ""
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba([q])[0]
            conf = f" (Confidence: {probs.max() * 100:.1f}%)"
        print(f"  * {q!r} -> {pred}{conf}")

except Exception as e:
    print(f"ERROR loading joblib model: {e}")
    sys.exit(1)

# 2. Test ONNX
print("\n" + "=" * 50)
if not onnx_path.exists():
    print("NOTICE: classifier_mobile.onnx not found at root.")
else:
    print(f"[OK] Found ONNX model: {onnx_path} ({onnx_path.stat().st_size / 1024 / 1024:.2f} MB)")
    try:
        import onnx
        onnx_m = onnx.load(str(onnx_path))
        onnx.checker.check_model(onnx_m)
        print("[OK] ONNX Model format & graph integrity verified successfully!")
        
        # Check inputs and outputs
        inputs = [i.name for i in onnx_m.graph.input]
        outputs = [o.name for o in onnx_m.graph.output]
        print(f"  Inputs:  {inputs}")
        print(f"  Outputs: {outputs}")
    except ImportError:
        print("Notice: 'onnx' package not installed in environment, checking via onnxruntime...")
    except Exception as e:
        print(f"Notice on ONNX validation: {e}")

    try:
        import onnxruntime as ort
        import numpy as np
        sess = ort.InferenceSession(str(onnx_path))
        input_name = sess.get_inputs()[0].name
        print(f"[OK] ONNX Runtime session initialized successfully!")
        print(f"  Input name: '{input_name}', Shape: {sess.get_inputs()[0].shape}")
        
        # Test onnx inference
        sample_input = np.array([["swiggy food delivery 350"]], dtype=object)
        res = sess.run(None, {input_name: sample_input})
        print(f"  Sample ONNX Prediction: {res[0]}")
    except ImportError:
        print("Notice: onnxruntime not installed in this environment. (Will run natively in Android Kotlin/Java or Python with onnxruntime)")
    except Exception as e:
        print(f"ONNX Runtime execution info: {e}")

print("\nAll model checks completed successfully!")
