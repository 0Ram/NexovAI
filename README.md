# Nexov Health — Voice AI Doctor Appointment Assistant

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Pipecat](https://img.shields.io/badge/Pipecat-1.17.0-purple.svg)](https://pipecat.ai)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg)](https://tailwindcss.com/)

A real-time voice-based doctor appointment booking system built for the **SDE Intern / Forward Deployed Engineer (FDE)** role. A caller speaks to an AI voice assistant ("Nexa") to check doctor availability, book appointments, and cancel existing appointments. The caller is identified solely by the spoken phone number, with strict digit-by-digit read-back verbal confirmation before any booking or cancellation.

---

## 🌟 Key Features

### 🎙️ Part A — Real-Time Voice Pipeline (Pipecat)
- **Audio Pipeline**: `Browser Mic` &rarr; `Silero VAD` &rarr; `ElevenLabs Realtime STT` &rarr; `Google Gemini LLM` &rarr; `ElevenLabs TTS` &rarr; `Browser Audio`.
- **Function Calling Tools**:
  - `check_doctor_availability`: Checks available slots by doctor name, specialty, or date.
  - `book_appointment`: Books a slot for a caller using their spoken phone number.
  - `cancel_appointment`: Cancels an existing appointment using their spoken phone number.
- **Strict Identification Rules**:
  - Identified **only** by the phone number spoken out loud (zero login, zero OTP, zero caller-ID).
  - **Mandatory Read-Back**: The agent always reads the number back digit-by-digit (*"Just to confirm, is 9 8 7 6 5 4 3 2 1 0 your phone number?"*) and waits for verbal confirmation before booking or cancelling.
  - Seamless handling of availability &rarr; booking &rarr; cancellation in a single ongoing conversation.
- **Voice Activity Detection (VAD)**: Powered by **Silero VAD** with local ONNX model for low-latency speech detection and interruptions.

### 💻 Part B & Bonus — Clinical Frontend Dashboard & Phone Call Interface
- **Top-Level Dashboard**: Displays doctors, specialties, open slots count, and live appointments log.
- **Phone-Style Call Modal (Bonus)**:
  - Simulated smartphone bezel with dynamic island, status bar, and home indicator.
  - Realistic audio cues: synthetic telephone ringing tones and call-end beeps via Web Audio API.
  - **Live Audio Waveform**: Real-time frequency visualizer canvas reacting to microphone and agent voice.
  - **In-Phone Live Transcript**: Scrolling conversation bubbles with speaker identifiers.
  - **In-Phone Booking Ticket**: Confirmation card renders directly inside the phone screen upon booking.
- **Instant Reactive Sync**: The dashboard appointments table dynamically highlights with an emerald flash when an appointment is booked or cancelled.
- **Resilient Fallback Mode**: If API keys are not yet configured, the system includes an intelligent conversational fallback engine so the entire dashboard and voice flow can be tested and demonstrated immediately.

---

## 📐 Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                           FRONTEND (React + Vite + Tailwind)                      |
|                                                                                   |
|   +-----------------------+   +----------------------+   +--------------------+   |
|   |   Doctors & Slots     |   |   Live Appointments  |   |  Phone Call Modal  |   |
|   |   (Schedules & Rooms) |   |   (Flash Highlight)  |   |  - Audio Waveform  |   |
|   +-----------------------+   +----------------------+   |  - Live Transcript |   |
|                                                          |  - Ringing Tones   |   |
|                                                          +--------------------+   |
+-----------------------------------------+-----------------------------------------+
                                          |
                      WebSockets (Audio Chunks & Events)
                                          |
+-----------------------------------------v-----------------------------------------+
|                           BACKEND (FastAPI + Pipecat)                             |
|                                                                                   |
|   +-------------------+      +-------------------+      +--------------------+    |
|   |    Silero VAD     | ---> |  ElevenLabs STT   | ---> |  Gemini 2.5 Flash  |    |
|   |  (Voice Activity) |      | (Realtime Scribe) |      | (Function Calling) |    |
|   +-------------------+      +-------------------+      +---------+----------+    |
|                                                                   |               |
|                                                                   v               |
|   +-------------------+      +-------------------+      +--------------------+    |
|   |   WebSocket Out   | <--- |  ElevenLabs TTS   | <--- | 3 Registered Tools |    |
|   |   (PCM to Client) |      |   (Rachel Voice)  |      |   (Check/Book/Del) |    |
|   +-------------------+      +-------------------+      +---------+----------+    |
+-------------------------------------------------------------------|---------------+
                                                                    v
                                                     +------------------------------+
                                                     |  SQLite DB (Doctors & Slots) |
                                                     +------------------------------+
```

---

## 🛠️ Tech Stack & LLM Choice

| Component | Technology | Rationale |
|---|---|---|
| **Voice Framework** | [Pipecat 1.17](https://github.com/pipecat-ai/pipecat) (Python) | Production-grade real-time audio pipeline orchestrator |
| **STT** | [ElevenLabs Realtime STT](https://elevenlabs.io) | Low-latency speech-to-text conversion |
| **TTS** | [ElevenLabs TTS](https://elevenlabs.io) | Ultra-natural synthesized voice (`Rachel`) |
| **LLM** | **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) | Fast reasoning, free quota tier, native tool calling |
| **VAD** | Silero VAD (ONNX) | Accurate local speech detection without external latency |
| **Backend** | FastAPI + Uvicorn + WebSockets | High throughput async server for audio & state sync |
| **Database** | SQLite3 | Mock doctors, specialties, and dynamic slot states |
| **Frontend** | React 18 + Vite + Tailwind CSS + Lucide Icons | Clean clinical UX, 60fps waveform, zero clutter |

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Python 3.12+
- Node.js 18+ (Node 22 recommended) and npm

### 2. Clone the Repository
```bash
git clone https://github.com/0Ram/NexovAI.git
cd NexovAI
```

### 3. Backend Setup
```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment variables (optional for live ElevenLabs/Gemini)
cp .env.example .env
```

Edit `.env` if you want to use your live API keys:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```
*(Note: If keys are omitted, the assistant seamlessly runs in simulated conversation mode for local testing).*

Start the backend server:
```bash
uvicorn backend.main:app --port 8000 --reload
```
The backend will be available at: `http://localhost:8000`

### 4. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: **`http://localhost:5173`**

---

## 🧪 Automated End-to-End Verification

To verify the complete flow (availability check &rarr; booking with phone number &rarr; read-back verification &rarr; database lock &rarr; cancellation &rarr; slot release), run the automated test suite:

```bash
# Make sure the backend server is running on port 8000
./venv/bin/python3 backend/test_e2e.py
```

Expected output:
```text
=== Step 1: Healthcheck and DB Reset ===
Loaded 4 doctors.
Total open slots: 32

=== Step 2: Connect WebSocket Voice Session ===
Received 2 (Greeting): Hello! Thank you for calling Nexov Health Clinic...

=== Step 3: Checking Doctor Availability ===
Caller: What slots are available for Dr. Rajesh Sharma?
Nexa: We have several open slots. For example: Dr. Rajesh Sharma on Thursday at 02:00 PM...

=== Step 4: Requesting Booking with Phone Number ===
Caller: Please book Dr. Sharma tomorrow at 10:30 AM, my phone number is 9876543210
Nexa (Read-back): Before I book it, just to confirm, is your phone number 9 8 7 6 5 4 3 2 1 0?

=== Step 5: Confirming Phone Number ===
Caller: Yes, that is correct
Nexa: Thank you! Your appointment with Dr. Rajesh Sharma has been confirmed...
Appointment #1 booked successfully!

=== Step 6: Requesting Cancellation ===
Caller: I need to cancel my appointment for 9876543210
Nexa (Read-back): Just to confirm, is your phone number 9 8 7 6 5 4 3 2 1 0?

=== Step 7: Confirming Cancellation ===
Caller: Yes please cancel it
Nexa: Your appointment with Dr. Rajesh Sharma has been successfully cancelled.

=== ALL END-TO-END FLOW TESTS PASSED WITH 100% SUCCESS ===
```

---

## 📋 Submission Checklist

- [x] **Pipecat Voice Pipeline** with STT, LLM, TTS, VAD, and 3 registered tools.
- [x] **Caller Identification** solely by spoken 10-digit phone number.
- [x] **Mandatory Read-Back Confirmation** before booking or cancelling.
- [x] **Clean Frontend Dashboard** displaying doctors, available slots, and live appointments.
- [x] **Bonus**: Silero VAD integrated.
- [x] **Bonus**: Smartphone-style call modal with ringing audio, live waveform visualizer, in-phone transcript, and booking confirmation card.
- [x] **Bonus**: Reactive flash highlights on dashboard when appointments update.
- [x] **Submission Notes**: Check `SUBMISSION_NOTES.md` for the pipeline description and 3-minute video recording script.
