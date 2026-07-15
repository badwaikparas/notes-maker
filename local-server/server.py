import numpy as np
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import uvicorn
import asyncio
import json


version = json.loads(Path("../version.json").read_text())
API_VERSION = version["apiVersion"]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading Whisper model...")
print("(This may take a moment the very first time as it downloads the model)")
# Using the "tiny.en" model for extreme speed. You can change this to "base.en" or "small.en"
model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
print("Model loaded and ready!")

@app.get("/version")
async def version():
    return {
        "apiVersion": API_VERSION,
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Extension connected! Ready to transcribe.")
    
    audio_buffer = []
    silence_chunks = 0
    is_speaking = False
    
    # Configuration
    SILENCE_THRESHOLD = 0.005 # Volume threshold to detect speech
    SILENCE_CHUNKS_LIMIT = 5  # ~1.25 seconds of silence before forcing a sentence break
    MAX_BUFFER_CHUNKS = 110   # ~28 seconds maximum buffer (Whisper limit is 30s)
    
    try:
        while True:
            data = await websocket.receive_bytes()
            
            # Convert raw bytes from browser to a Float32 numpy array
            chunk = np.frombuffer(data, dtype=np.float32)
            
            # Calculate root mean square (RMS) volume of the chunk
            volume = np.sqrt(np.mean(chunk**2))
            
            if volume > SILENCE_THRESHOLD:
                # Voice detected
                is_speaking = True
                silence_chunks = 0
                audio_buffer.append(chunk)
            elif is_speaking:
                # Still capturing, but detecting silence
                silence_chunks += 1
                audio_buffer.append(chunk)
                
                # If they paused long enough, or reached max duration -> Transcribe Final!
                if silence_chunks >= SILENCE_CHUNKS_LIMIT or len(audio_buffer) >= MAX_BUFFER_CHUNKS:
                    # Ignore tiny glitches
                    if len(audio_buffer) > 3: 
                        full_audio = np.concatenate(audio_buffer)
                        # Run faster-whisper on the buffer
                        segments, _ = model.transcribe(full_audio, beam_size=5, condition_on_previous_text=False)
                        text = " ".join([s.text for s in segments]).strip()
                        
                        if text:
                            print(f"[FINAL] {text}")
                            await websocket.send_json({"type": "final", "text": text})
                    
                    # Reset the buffer for the next sentence
                    audio_buffer = []
                    is_speaking = False
                    silence_chunks = 0
            else:
                # Not speaking, waiting for them to start
                pass
            
            # Send interim (real-time preview) results every ~3 seconds if they speak continuously
            if is_speaking and len(audio_buffer) % 12 == 0 and len(audio_buffer) > 0:
                full_audio = np.concatenate(audio_buffer)
                segments, _ = model.transcribe(full_audio, beam_size=5, condition_on_previous_text=False)
                text = " ".join([s.text for s in segments]).strip()
                if text:
                    print(f"[INTERIM] {text}...")
                    await websocket.send_json({"type": "interim", "text": text + "..."})
                
    except Exception as e:
        print("Extension disconnected.", e)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
