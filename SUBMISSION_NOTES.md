# Assignment Submission Notes & Guide

This document contains everything needed to complete the round 1 assignment submission for the **Voice AI Doctor Appointment Assistant** role.

---

## 1. Pipeline Description (For the Google Form)
> Copy and paste this directly into the **"Pipeline description"** field in the submission form:

```text
The voice assistant is built on a real-time, low-latency audio pipeline powered by Pipecat in Python. When a caller dials in from the browser, raw audio frames are streamed over WebSocket to the FastAPI backend. Silero VAD detects speech boundaries and interruptions, which feeds directly into ElevenLabs Realtime STT for speech-to-text.

The transcribed utterances are fed into Google Gemini (gemini-2.5-flash) using structured tool function calling for `check_doctor_availability`, `book_appointment`, and `cancel_appointment`. The agent enforces strict patient verification solely by spoken phone number and is hard-coded to read the 10-digit number back to the caller for explicit verbal confirmation before executing any booking or cancellation.

Once verified, the tool interacts with an SQLite database to update doctor slots and log the appointment. The LLM's conversational response is synthesized into speech via ElevenLabs TTS (Rachel voice) and streamed back as PCM audio to the browser, while JSON update events are broadcast to instantly flash and update the frontend clinical dashboard.
```

---

## 2. LLM Used
- **Google Gemini 2.5 Flash (`gemini-2.5-flash`)**
- Why chosen: Zero-latency streaming, generous free tier via Google AI Studio, native tool/function calling support with Pipecat `GoogleLLMService`, and reliable adherence to phone verification read-back constraints.

---

## 3. Video Recording Script (Under 3 Minutes)

Record your screen showing the browser running the dashboard (`http://localhost:5173`) and speak into your microphone (or use the simulated prompt buttons):

### **Step 1: Introduction (0:00 - 0:20)**
- *"Hi, this is my submission for the Voice AI Doctor Appointment Assistant assignment. I've built a full-stack real-time voice pipeline with Pipecat, ElevenLabs STT/TTS, Google Gemini for function calling, and a clinical dashboard with a phone interface."*
- Point out the 4 doctors, available slots count (32 open slots), and empty/clean appointments table.

### **Step 2: Start Voice Call (0:20 - 0:40)**
- Click **"Try Call Assistant"**.
- The smartphone popup appears with ringing sound, connects, and timer starts.
- Agent speaks greeting: *"Hello! Thank you for calling Nexov Health Clinic. I'm Nexa, your appointment assistant. How may I help you today?"*
- Waveform visualizer reacts to voice.

### **Step 3: Check Doctor Availability (0:40 - 1:10)**
- **Caller speaks**: *"What slots are available for Dr. Rajesh Sharma?"*
- **Agent replies**: *"We have several open slots with Dr. Rajesh Sharma on Thursday at 9:00 AM, 10:30 AM, and 2:00 PM. Would you like me to book one of these for you?"*

### **Step 4: Book Appointment with Phone Number & Confirmation (1:10 - 1:50)**
- **Caller speaks**: *"Please book Dr. Sharma tomorrow at 10:30 AM, my phone number is 9876543210."*
- **Agent reads back the phone number**: *"I have a slot available with Dr. Rajesh Sharma tomorrow at 10:30 AM. Before I book it, just to confirm, is your phone number 9-8-7-6-5-4-3-2-1-0?"*
- **Caller confirms**: *"Yes, that's correct."*
- **Agent confirms booking**: *"Thank you! Your appointment with Dr. Rajesh Sharma (Cardiology) has been confirmed for tomorrow at 10:30 AM. Your confirmation ID is #1."*
- Highlight in the video:
  1. The booking confirmation card pops up inside the phone screen.
  2. The Appointments table in the background highlights and updates with Appointment #1!

### **Step 5: Cancel Appointment (1:50 - 2:30) [Bonus]**
- **Caller speaks**: *"Actually, I need to cancel my appointment for 9876543210."*
- **Agent reads back number**: *"I can certainly help you cancel that. Before I proceed, just to confirm, is your phone number 9-8-7-6-5-4-3-2-1-0?"*
- **Caller confirms**: *"Yes, please cancel."*
- **Agent confirms cancellation**: *"Your appointment with Dr. Michael Chen has been successfully cancelled."*
- Show the dashboard row status turn red to `Cancelled` and the slot re-appear as available.

### **Step 6: End Call & Wrap Up (2:30 - 2:50)**
- Click the red **End Call** button. Disconnect tone plays.
- *"Everything is fully tested end-to-end, adheres strictly to the phone read-back rules, and synchronizes live. Thank you!"*

---

## 4. How to Submit

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: complete Voice AI Doctor Appointment Assistant"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. **Submit via Google Form**:
   - Form URL: [https://docs.google.com/forms/d/e/1FAIpQLSdruhcgKFC4LjnlwHfYDRZoGsa0r-qy4k68SJ8RsmxsPbYxpg/viewform?usp=publish-editor](https://docs.google.com/forms/d/e/1FAIpQLSdruhcgKFC4LjnlwHfYDRZoGsa0r-qy4k68SJ8RsmxsPbYxpg/viewform?usp=publish-editor)
   - Attach your GitHub repository URL
   - Attach your recording video link (Google Drive / Loom / YouTube unlisted)
   - Paste the Pipeline Description above
   - Submit before **Wednesday, 25 November, 11:00 PM IST**
