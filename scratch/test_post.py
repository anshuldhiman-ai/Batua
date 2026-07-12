import wave
import struct
import requests
import json

# Generate a 1-second silent WAV file
audio_path = "scratch/test_audio.wav"
with wave.open(audio_path, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(16000)
    for _ in range(16000):
        w.writeframes(struct.pack('<h', 0))

print("Generated dummy audio.")

# Send to backend
try:
    with open(audio_path, 'rb') as f:
        response = requests.post(
            "http://localhost:8001/api/transcribe",
            files={"file": ("test_audio.wav", f, "audio/wav")}
        )
    print("Status Code:", response.status_code)
    print("Response JSON:", response.text)
except Exception as e:
    print("Error sending request:", e)
