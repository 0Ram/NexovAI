import os
import json
import logging
import asyncio
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.database import (
    init_db,
    get_doctors,
    get_all_slots,
    get_all_appointments,
    get_available_slots,
    DB_PATH
)
from backend.conversational_agent import ConversationalDoctorAssistant
from backend.voice_pipeline import run_pipecat_pipeline

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend_main")

app = FastAPI(
    title="Nexov Health Voice AI Doctor Appointment Assistant",
    description="Real-time Voice AI pipeline using Pipecat, Gemini, ElevenLabs and FastAPI.",
    version="1.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database schema on startup
@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("Database initialized successfully.")

# Active WebSocket clients tracking for broadcasting updates
connected_clients: Set[WebSocket] = set()

async def broadcast_to_clients(message: dict):
    """Broadcast JSON message to all connected clients."""
    disconnected = set()
    for client in connected_clients:
        try:
            await client.send_text(json.dumps(message))
        except Exception:
            disconnected.add(client)
    for dc in disconnected:
        connected_clients.discard(dc)

# --- REST API Endpoints ---

@app.get("/api/health")
def health_check():
    has_gemini = bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))
    has_elevenlabs = bool(os.getenv("ELEVENLABS_API_KEY"))
    return {
        "status": "healthy",
        "gemini_configured": has_gemini,
        "elevenlabs_configured": has_elevenlabs,
        "pipecat_ready": has_gemini and has_elevenlabs
    }

@app.get("/api/doctors")
def api_get_doctors():
    doctors = get_doctors()
    return {"doctors": doctors}

@app.get("/api/slots")
def api_get_slots():
    slots = get_all_slots()
    return {"slots": slots}

@app.get("/api/appointments")
def api_get_appointments():
    appointments = get_all_appointments()
    return {"appointments": appointments}

@app.post("/api/reset")
def api_reset_db():
    """Resets database to clean initial state for clean demo recording."""
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception:
            pass
    init_db()
    return {"success": True, "message": "Database successfully reset to initial seed data."}

# --- WebSocket Voice Call Endpoint ---

@app.websocket("/ws/call")
async def websocket_call_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info("New caller connected to voice endpoint.")

    google_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    eleven_key = os.getenv("ELEVENLABS_API_KEY")

    # Broadcast initial connection state
    await websocket.send_text(json.dumps({
        "type": "status",
        "status": "connected",
        "message": "Call connected with Nexa."
    }))

    assistant_engine = ConversationalDoctorAssistant()

    # Initial Greeting
    welcome_text = "Hello! Thank you for calling Nexov Health Clinic. I'm Nexa, your appointment assistant. How may I help you today?"
    await websocket.send_text(json.dumps({
        "type": "transcript",
        "speaker": "agent",
        "text": welcome_text,
        "is_final": True
    }))

    async def pipeline_broadcast(event: dict):
        # Broadcast to caller and all dashboard listeners
        await broadcast_to_clients(event)

    try:
        # Check if keys are present for full Pipecat pipeline
        use_full_pipecat = bool(google_key and eleven_key)

        if use_full_pipecat:
            logger.info("Launching full live Pipecat Voice Pipeline with Gemini and ElevenLabs...")
            try:
                await run_pipecat_pipeline(
                    websocket=websocket,
                    broadcast_fn=pipeline_broadcast,
                    google_api_key=google_key,
                    elevenlabs_api_key=eleven_key
                )
                return
            except Exception as e:
                logger.error(f"Pipecat pipeline encountered error: {e}. Falling back to conversational engine.")

        # Fallback / Direct Conversational Session
        # Handles binary audio frames and JSON text messages
        while True:
            message = await websocket.receive()
            if "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "text_message":
                    user_text = data.get("text", "")
                    await websocket.send_text(json.dumps({
                        "type": "transcript",
                        "speaker": "caller",
                        "text": user_text,
                        "is_final": True
                    }))

                    # Process through assistant engine
                    reply = await assistant_engine.process_user_utterance(user_text)
                    
                    # Send transcript back
                    await websocket.send_text(json.dumps({
                        "type": "transcript",
                        "speaker": "agent",
                        "text": reply["text"],
                        "is_final": True
                    }))

                    # If an appointment event occurred, broadcast to all dashboards
                    if reply.get("event"):
                        await broadcast_to_clients(reply["event"])

                elif msg_type == "end_call":
                    break

            elif "bytes" in message:
                # Audio frame received from browser microphone
                # In simulator mode without STT key, we echo activity to keep waveform reacting
                pass

    except WebSocketDisconnect:
        logger.info("Caller disconnected.")
    except Exception as e:
        logger.error(f"WebSocket session exception: {e}")
    finally:
        connected_clients.discard(websocket)
        logger.info("Cleaned up caller session.")
