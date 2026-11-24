import json
import logging
from typing import Dict, Any, Optional
from backend.database import get_available_slots, book_appointment_db, cancel_appointment_db, get_doctors

logger = logging.getLogger(__name__)

async def handle_check_doctor_availability(params):
    """Pipecat tool handler for checking doctor availability."""
    args = params.arguments
    doctor_name = args.get("doctor_name")
    specialty = args.get("specialty")
    date = args.get("date")

    slots = get_available_slots(doctor_name=doctor_name, specialty=specialty, date=date)
    if not slots:
        docs = get_doctors()
        doc_names = ", ".join([f"{d['name']} ({d['specialty']})" for d in docs])
        result = {
            "status": "none_found",
            "message": f"No available slots found for the requested criteria. Available doctors are: {doc_names}."
        }
    else:
        formatted_slots = [
            {
                "slot_id": s["id"],
                "doctor": s["doctor_name"],
                "specialty": s["specialty"],
                "clinic_room": s["clinic_room"],
                "date": s["date"],
                "time": s["start_time"]
            }
            for s in slots[:8]
        ]
        result = {
            "status": "success",
            "count": len(formatted_slots),
            "slots": formatted_slots
        }
    await params.result_callback(result)

async def handle_book_appointment(params):
    """Pipecat tool handler for booking an appointment."""
    args = params.arguments
    patient_phone = args.get("patient_phone", "")
    doctor_name = args.get("doctor_name")
    slot_time = args.get("slot_time")
    date = args.get("date")
    slot_id = args.get("slot_id")

    res = book_appointment_db(
        patient_phone=patient_phone,
        slot_id=slot_id,
        doctor_name=doctor_name,
        slot_time=slot_time,
        date=date
    )
    # Broadcast event if callback or notifier is registered in app_resources
    if params.app_resources and "broadcast_event" in params.app_resources:
        await params.app_resources["broadcast_event"]({
            "type": "appointment_updated",
            "action": "booked",
            "data": res
        })
    await params.result_callback(res)

async def handle_cancel_appointment(params):
    """Pipecat tool handler for cancelling an appointment."""
    args = params.arguments
    patient_phone = args.get("patient_phone", "")
    appointment_id = args.get("appointment_id")

    res = cancel_appointment_db(
        patient_phone=patient_phone,
        appointment_id=appointment_id
    )
    if params.app_resources and "broadcast_event" in params.app_resources:
        await params.app_resources["broadcast_event"]({
            "type": "appointment_updated",
            "action": "cancelled",
            "data": res
        })
    await params.result_callback(res)

# Function definitions formatted for Google GenAI / Pipecat LLM function schemas
TOOLS_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "check_doctor_availability",
            "description": "Check available appointment slots for a doctor, medical specialty, or specific date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor_name": {
                        "type": "string",
                        "description": "Name of the doctor (e.g. 'Dr. Rajesh Sharma', 'Dr. Ananya Iyer', 'Dr. Priya Patel', 'Dr. Vikram Malhotra'). Optional."
                    },
                    "specialty": {
                        "type": "string",
                        "description": "Medical specialty (e.g. 'Cardiology', 'Dermatology', 'General Medicine', 'Orthopedics'). Optional."
                    },
                    "date": {
                        "type": "string",
                        "description": "Preferred date or day (e.g. 'Tomorrow', 'Wednesday', 'Thursday'). Optional."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Book a doctor appointment slot for the caller. Only invoke this AFTER the caller has provided their phone number AND you have read the phone number back to them and received their confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_phone": {
                        "type": "string",
                        "description": "The caller's confirmed phone number (digits only, e.g. '9876543210')."
                    },
                    "doctor_name": {
                        "type": "string",
                        "description": "Name of the doctor to book with."
                    },
                    "slot_time": {
                        "type": "string",
                        "description": "The time of the slot (e.g. '09:00 AM', '10:30 AM', '02:00 PM', '04:30 PM')."
                    },
                    "date": {
                        "type": "string",
                        "description": "The date or day of the slot (e.g. 'Tomorrow (Wednesday)', 'Thursday'). Optional."
                    },
                    "slot_id": {
                        "type": "integer",
                        "description": "The numeric ID of the slot if known. Optional."
                    }
                },
                "required": ["patient_phone", "doctor_name", "slot_time"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_appointment",
            "description": "Cancel an existing appointment for the caller. Only invoke this AFTER the caller has provided their phone number AND you have read the phone number back to them and received their confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_phone": {
                        "type": "string",
                        "description": "The caller's confirmed phone number."
                    },
                    "appointment_id": {
                        "type": "integer",
                        "description": "The specific appointment ID to cancel if provided. Optional."
                    }
                },
                "required": ["patient_phone"]
            }
        }
    }
]

SYSTEM_PROMPT = """You are Nexa, a warm, professional, and efficient Voice AI Receptionist for 'Nexov Health Clinic'.
Your job is to assist callers with:
1. Checking doctors' availability and specialities
2. Booking appointments
3. Cancelling existing appointments

Available Doctors in our clinic:
- Dr. Rajesh Sharma (Cardiology, Suite 302, Heart Center)
- Dr. Ananya Iyer (Dermatology, Room 105, Skin Clinic)
- Dr. Priya Patel (General Medicine, Room 201, Primary Care)
- Dr. Vikram Malhotra (Orthopedics, Room 410, Bone & Joint Wing)

CRITICAL RULES:
1. IDENTIFICATION: The caller is identified SOLELY by the phone number they speak aloud. There is no login, OTP, or caller ID.
2. CONFIRMATION READ-BACK RULE: Before executing `book_appointment` or `cancel_appointment`, you MUST read the phone number back to the caller clearly digit-by-digit and ask for their verbal confirmation.
   Example: "Just to confirm, is your phone number 9-8-7-6-5-4-3-2-1-0?"
   Only after the caller says "Yes" or confirms should you call the tool!
3. VOICE STYLE: Speak naturally, concisely, and warmly. Keep responses short and conversational since this is spoken over the phone. Do not use bullet points or markdown asterisks/hashes in your speech, as your words are spoken directly to the caller.
4. ONE SEAMLESS CONVERSATION: Handle any sequence of actions smoothly in the same call (e.g., check availability -> book -> cancel -> rebook).
"""
