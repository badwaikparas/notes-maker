import numpy as np
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import uvicorn
import asyncio
import json


version_data = json.loads(Path("../version.json").read_text())
API_VERSION = version_data["apiVersion"]

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
print(f"Model loaded! API version: {API_VERSION}")

@app.get("/version")
async def get_version():
    return {"apiVersion": API_VERSION}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Extension connected! Waiting for API version handshake…")

    # ── API version handshake ─────────────────────────────────────────────────
    # The client MUST send a JSON handshake message first:
    # { "type": "handshake", "version": <int> }
    # We reject connections from clients with a different API version.
    try:
        raw = await asyncio.wait_for(websocket.receive(), timeout=10.0)
    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "message": "Handshake timeout"})
        await websocket.close(code=4001)
        return

    # Handle both text (JSON) and binary (raw audio) first messages
    if "text" in raw:
        try:
            msg = json.loads(raw["text"])
        except Exception:
            msg = {}
        if msg.get("type") == "ping":
            # Keep-alive ping — respond and continue
            await websocket.send_json({"type": "pong"})
        elif msg.get("type") == "handshake":
            client_version = msg.get("version")
            if client_version != API_VERSION:
                await websocket.send_json({
                    "type": "error",
                    "message": (
                        f"API version mismatch: server is v{API_VERSION}, "
                        f"client sent v{client_version}. "
                        f"Please reload the extension or upgrade the server."
                    ),
                })
                await websocket.close(code=4000)
                return
            else:
                await websocket.send_json({"type": "handshake_ok", "version": API_VERSION})
                print(f"Handshake OK (API v{API_VERSION}). Ready to transcribe.")
        # else: treat as legacy client (no handshake), proceed normally

    audio_buffer = []
    silence_chunks = 0
    is_speaking = False

    # Configuration
    SILENCE_THRESHOLD = 0.005  # Volume threshold to detect speech
    SILENCE_CHUNKS_LIMIT = 5   # ~1.25 seconds of silence before forcing a sentence break
    MAX_BUFFER_CHUNKS = 110    # ~28 seconds maximum buffer (Whisper limit is 30s)

    async def transcribe_and_send(buf, msg_type="final"):
        """Run Whisper on a buffer and send each segment as a separate line."""
        full_audio = np.concatenate(buf)
        segments, _ = model.transcribe(
            full_audio,
            beam_size=5,
            condition_on_previous_text=False,
        )
        lines = [s.text.strip() for s in segments if s.text.strip()]
        if not lines:
            return
        if msg_type == "final":
            # Send each segment (line) as its own final message
            for line in lines:
                print(f"[FINAL] {line}")
                await websocket.send_json({"type": "final", "text": line})
        else:
            # For interim, join them (previewing the whole phrase is fine)
            text = " ".join(lines)
            print(f"[INTERIM] {text}...")
            await websocket.send_json({"type": "interim", "text": text + "..."})

    try:
        while True:
            raw = await websocket.receive()

            # Handle keep-alive pings (text JSON)
            if "text" in raw:
                try:
                    msg = json.loads(raw["text"])
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
                continue

            data = raw.get("bytes")
            if data is None:
                continue

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

                # If they paused long enough, or reached max duration → Transcribe Final!
                if silence_chunks >= SILENCE_CHUNKS_LIMIT or len(audio_buffer) >= MAX_BUFFER_CHUNKS:
                    # Ignore tiny glitches
                    if len(audio_buffer) > 3:
                        await transcribe_and_send(audio_buffer, "final")

                    # Reset the buffer for the next sentence
                    audio_buffer = []
                    is_speaking = False
                    silence_chunks = 0
            else:
                # Not speaking, waiting for them to start
                pass

            # Send interim (real-time preview) results every ~3 seconds of continuous speech
            if is_speaking and len(audio_buffer) % 12 == 0 and len(audio_buffer) > 0:
                await transcribe_and_send(audio_buffer, "interim")

    except WebSocketDisconnect:
        print("Extension disconnected cleanly.")
    except Exception as e:
        print(f"Extension disconnected with error: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
