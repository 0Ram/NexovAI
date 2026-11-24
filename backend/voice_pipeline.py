import os
import json
import asyncio
import logging
from typing import Optional, Callable, Dict, Any

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.elevenlabs.stt import ElevenLabsRealtimeSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
    TextFrame,
    LLMTextFrame,
    TTSSpeakFrame,
    EndFrame
)

from backend.tools import (
    TOOLS_DEFINITIONS,
    PIPECAT_TOOLS,
    SYSTEM_PROMPT,
    handle_check_doctor_availability,
    handle_book_appointment,
    handle_cancel_appointment
)

logger = logging.getLogger("voice_pipeline")
logger.setLevel(logging.INFO)

class TranscriptBroadcaster(FrameProcessor):
    """Intercepts transcript and text frames to broadcast live transcripts to the frontend."""
    def __init__(self, broadcast_fn: Callable[[Dict[str, Any]], Any]):
        super().__init__()
        self.broadcast_fn = broadcast_fn

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        try:
            if isinstance(frame, TranscriptionFrame):
                if frame.text and frame.text.strip():
                    await self.broadcast_fn({
                        "type": "transcript",
                        "speaker": "caller",
                        "text": frame.text.strip(),
                        "is_final": True
                    })
            elif isinstance(frame, InterimTranscriptionFrame):
                if frame.text and frame.text.strip():
                    await self.broadcast_fn({
                        "type": "transcript",
                        "speaker": "caller",
                        "text": frame.text.strip(),
                        "is_final": False
                    })
            elif isinstance(frame, (LLMTextFrame, TextFrame)):
                if frame.text and frame.text.strip():
                    await self.broadcast_fn({
                        "type": "transcript",
                        "speaker": "agent",
                        "text": frame.text,
                        "is_final": True
                    })
        except Exception as e:
            logger.error(f"Error broadcasting transcript frame: {e}")
        await self.push_frame(frame, direction)


async def run_pipecat_pipeline(
    websocket,
    broadcast_fn: Callable[[Dict[str, Any]], Any],
    google_api_key: str,
    elevenlabs_api_key: str,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM" # Rachel - professional, warm
):
    """Initializes and runs the full Pipecat Voice Pipeline over FastAPI WebSocket."""
    logger.info("Initializing Pipecat voice pipeline...")

    # 1. Transport
    transport_params = FastAPIWebsocketParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        audio_in_sample_rate=16000,
        audio_out_sample_rate=16000,
        add_wav_header=False
    )
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=transport_params
    )

    # 2. VAD: Silero VAD
    vad_analyzer = SileroVADAnalyzer()

    # 3. STT: ElevenLabs Realtime STT
    stt = ElevenLabsRealtimeSTTService(
        api_key=elevenlabs_api_key,
        model="scribe_v1"
    )

    # 4. LLM: Google Gemini with Function Calling Tools
    # gemini-2.5-flash or gemini-1.5-flash
    llm = GoogleLLMService(
        api_key=google_api_key,
        model="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
        tools=PIPECAT_TOOLS
    )

    # Register the 3 required tools
    llm.register_function("check_doctor_availability", handle_check_doctor_availability)
    llm.register_function("book_appointment", handle_book_appointment)
    llm.register_function("cancel_appointment", handle_cancel_appointment)

    # 5. TTS: ElevenLabs TTS
    tts = ElevenLabsTTSService(
        api_key=elevenlabs_api_key,
        voice_id=voice_id,
        model="eleven_turbo_v2_5"
    )

    # 6. Context & Aggregators
    context = LLMContext(
        messages=[{"role": "system", "content": SYSTEM_PROMPT}],
        tools=PIPECAT_TOOLS
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

    # 7. Transcript Broadcaster
    broadcaster = TranscriptBroadcaster(broadcast_fn)

    # 8. Pipeline Assembly
    # Caller audio -> Transport -> VAD -> STT -> Broadcaster -> User Aggregator -> LLM -> TTS -> Broadcaster -> Transport -> Assistant Aggregator
    pipeline = Pipeline([
        transport.input(),
        vad_analyzer,
        stt,
        broadcaster,
        user_aggregator,
        llm,
        tts,
        transport.output(),
        assistant_aggregator
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True
        )
    )

    # Pass app_resources to task worker so tool handlers can broadcast appointment events
    task._app_resources = {"broadcast_event": broadcast_fn}

    runner = PipelineRunner()

    # Queue warm welcome greeting
    welcome_text = "Hello! Thank you for calling Nexov Health Clinic. I am Nexa, your appointment assistant. How may I help you today?"
    await task.queue_frame(TTSSpeakFrame(welcome_text))
    await broadcast_fn({
        "type": "transcript",
        "speaker": "agent",
        "text": welcome_text,
        "is_final": True
    })

    logger.info("Pipecat pipeline running...")
    await runner.run(task)
