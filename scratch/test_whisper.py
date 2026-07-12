import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

import transcribe as stt
print("Whisper enabled flag:", stt._ENABLED_FLAG)
print("Whisper package available:", stt._package_available())
print("Is enabled:", stt.is_enabled())

model = stt._get_model()
print("Model loaded successfully:", model is not None)
if not model:
    print("Load failed flag:", stt._load_failed)
