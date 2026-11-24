import re
import json
import asyncio
from typing import Dict, Any, List, Optional
from backend.database import (
    get_doctors,
    get_available_slots,
    book_appointment_db,
    cancel_appointment_db,
    clean_phone_number
)

class ConversationalDoctorAssistant:
    """Conversational Doctor Assistant Engine.
    Implements the full business logic, doctor availability checks,
    booking, and cancellation, enforcing strict phone number read-back confirmation.
    """
    def __init__(self):
        self.state = "idle" # idle, awaiting_booking_phone, awaiting_booking_confirmation, awaiting_cancel_phone, awaiting_cancel_confirmation
        self.pending_action = None # Dict with details of booking/cancellation waiting for confirmation
        self.history: List[Dict[str, str]] = []

    def reset(self):
        self.state = "idle"
        self.pending_action = None
        self.history = []

    def _extract_phone(self, text: str) -> Optional[str]:
        # Extract sequences of digits, spaces or dashes
        digits = clean_phone_number(text)
        if len(digits) >= 10:
            return digits[-10:] # take last 10 digits
        return None

    def _format_phone_for_speech(self, phone: str) -> str:
        # Formats phone like "9 8 7 6 5 4 3 2 1 0" for clear speech synthesis
        return " ".join(list(phone))

    async def process_user_utterance(self, user_text: str) -> Dict[str, Any]:
        """Processes user utterance and returns response text and optional action event."""
        text = user_text.lower().strip()
        self.history.append({"speaker": "caller", "text": user_text})
        response_text = ""
        event_payload = None

        # Check if caller is confirming an action
        is_yes = any(w in text for w in ["yes", "yeah", "correct", "yep", "sure", "that's right", "right", "confirm", "proceed"])
        is_no = any(w in text for w in ["no", "nope", "wrong", "incorrect", "cancel that", "not that"])

        # State 1: Awaiting Booking Confirmation
        if self.state == "awaiting_booking_confirmation" and self.pending_action:
            if is_yes:
                # Proceed with booking
                res = book_appointment_db(
                    patient_phone=self.pending_action["phone"],
                    doctor_name=self.pending_action["doctor_name"],
                    slot_time=self.pending_action["slot_time"],
                    date=self.pending_action.get("date")
                )
                if res["success"]:
                    response_text = (
                        f"Thank you! Your appointment with {res['doctor_name']} ({res['specialty']}) "
                        f"has been confirmed for {res['date']} at {res['time']}. "
                        f"Your confirmation ID is #{res['appointment_id']}."
                    )
                    event_payload = {
                        "type": "appointment_updated",
                        "action": "booked",
                        "data": res
                    }
                else:
                    response_text = f"I'm sorry, but {res['error']}"
                self.state = "idle"
                self.pending_action = None
            elif is_no:
                self.state = "idle"
                self.pending_action = None
                response_text = "No problem, I have not booked the appointment. What phone number would you like to use, or how else may I help you?"
            else:
                phone_candidate = self._extract_phone(text)
                if phone_candidate:
                    self.pending_action["phone"] = phone_candidate
                    spoken_phone = self._format_phone_for_speech(phone_candidate)
                    response_text = f"Got it. Just to confirm, is {spoken_phone} your correct phone number?"
                else:
                    response_text = f"Please confirm with yes or no: should I book this appointment for phone number {self._format_phone_for_speech(self.pending_action['phone'])}?"

        # State 2: Awaiting Cancel Confirmation
        elif self.state == "awaiting_cancel_confirmation" and self.pending_action:
            if is_yes:
                res = cancel_appointment_db(patient_phone=self.pending_action["phone"])
                if res["success"]:
                    response_text = (
                        f"Your appointment with {res['doctor_name']} on {res['date']} at {res['time']} "
                        f"has been successfully cancelled."
                    )
                    event_payload = {
                        "type": "appointment_updated",
                        "action": "cancelled",
                        "data": res
                    }
                else:
                    response_text = f"I checked our records, but {res['error']}"
                self.state = "idle"
                self.pending_action = None
            elif is_no:
                self.state = "idle"
                self.pending_action = None
                response_text = "Understood, your appointment remains active and has not been cancelled. Anything else I can do for you?"
            else:
                phone_candidate = self._extract_phone(text)
                if phone_candidate:
                    self.pending_action["phone"] = phone_candidate
                    spoken_phone = self._format_phone_for_speech(phone_candidate)
                    response_text = f"Just to confirm, should I cancel the appointment for phone number {spoken_phone}?"
                else:
                    response_text = f"Please confirm: would you like to cancel the appointment for {self._format_phone_for_speech(self.pending_action['phone'])}?"

        # State 3: Normal Conversation & Inquiries
        else:
            # Check for cancellation request
            if "cancel" in text:
                phone = self._extract_phone(text)
                if phone:
                    self.state = "awaiting_cancel_confirmation"
                    self.pending_action = {"phone": phone}
                    spoken_phone = self._format_phone_for_speech(phone)
                    response_text = f"I can certainly help you cancel that. Before I proceed, just to confirm, is your phone number {spoken_phone}?"
                else:
                    self.state = "awaiting_cancel_phone"
                    response_text = "I can help cancel your appointment. Could you please state the phone number you used when booking?"

            elif self.state == "awaiting_cancel_phone":
                phone = self._extract_phone(text)
                if phone:
                    self.state = "awaiting_cancel_confirmation"
                    self.pending_action = {"phone": phone}
                    spoken_phone = self._format_phone_for_speech(phone)
                    response_text = f"Thank you. Just to confirm, is your phone number {spoken_phone}?"
                else:
                    response_text = "Please tell me your 10-digit phone number so I can look up your appointment."

            # Check for booking request
            elif "book" in text or "schedule" in text or "reserve" in text:
                phone = self._extract_phone(text)
                # Detect doctor requested
                doc_name = None
                if "sharma" in text or "rajesh" in text or "cardio" in text:
                    doc_name = "Dr. Rajesh Sharma"
                elif "iyer" in text or "ananya" in text or "dermatol" in text or "skin" in text:
                    doc_name = "Dr. Ananya Iyer"
                elif "patel" in text or "priya" in text or "general" in text or "medicine" in text:
                    doc_name = "Dr. Priya Patel"
                elif "malhotra" in text or "vikram" in text or "ortho" in text or "bone" in text:
                    doc_name = "Dr. Vikram Malhotra"

                # Detect slot time
                time_slot = None
                for t in ["9:00", "9 am", "09:00", "9"]:
                    if t in text:
                        time_slot = "09:00 AM"
                        break
                for t in ["10:30", "10:30 am", "10:30am"]:
                    if t in text:
                        time_slot = "10:30 AM"
                        break
                for t in ["2:00", "2 pm", "02:00", "2"]:
                    if t in text and "09" not in text:
                        time_slot = "02:00 PM"
                        break
                for t in ["4:30", "4:30 pm", "4:30pm"]:
                    if t in text:
                        time_slot = "04:30 PM"
                        break

                if not time_slot:
                    time_slot = "10:30 AM" # default convenient morning slot

                if not doc_name:
                    doc_name = "Dr. Rajesh Sharma"

                if phone:
                    self.state = "awaiting_booking_confirmation"
                    self.pending_action = {
                        "phone": phone,
                        "doctor_name": doc_name,
                        "slot_time": time_slot,
                        "date": "Tomorrow (Wednesday)"
                    }
                    spoken_phone = self._format_phone_for_speech(phone)
                    response_text = (
                        f"I have a slot available with {doc_name} tomorrow at {time_slot}. "
                        f"Before I book it, just to confirm, is your phone number {spoken_phone}?"
                    )
                else:
                    self.state = "awaiting_booking_phone"
                    self.pending_action = {
                        "doctor_name": doc_name,
                        "slot_time": time_slot,
                        "date": "Tomorrow (Wednesday)"
                    }
                    response_text = f"I'd be glad to book {doc_name} for tomorrow at {time_slot}. What is your phone number?"

            elif self.state == "awaiting_booking_phone":
                phone = self._extract_phone(text)
                if phone:
                    self.state = "awaiting_booking_confirmation"
                    self.pending_action["phone"] = phone
                    spoken_phone = self._format_phone_for_speech(phone)
                    response_text = (
                        f"Thank you. Just to confirm before booking, is your phone number {spoken_phone}?"
                    )
                else:
                    response_text = "Could you please state your 10-digit phone number so I can book your appointment?"

            # Check for availability / doctor inquiry
            elif any(w in text for w in ["available", "availability", "slot", "slots", "doctor", "doctors", "when", "time", "free"]):
                target_doc = None
                target_specialty = None
                if "cardio" in text:
                    target_specialty = "Cardiology"
                elif "derma" in text or "skin" in text:
                    target_specialty = "Dermatology"
                elif "general" in text or "primary" in text or "fever" in text:
                    target_specialty = "General Medicine"
                elif "ortho" in text or "bone" in text or "joint" in text:
                    target_specialty = "Orthopedics"

                if "sharma" in text or "rajesh" in text:
                    target_doc = "Dr. Rajesh Sharma"
                elif "iyer" in text or "ananya" in text:
                    target_doc = "Dr. Ananya Iyer"
                elif "patel" in text or "priya" in text:
                    target_doc = "Dr. Priya Patel"
                elif "malhotra" in text or "vikram" in text:
                    target_doc = "Dr. Vikram Malhotra"

                slots = get_available_slots(doctor_name=target_doc, specialty=target_specialty)
                if slots:
                    first_three = slots[:3]
                    slot_desc = ", ".join([f"{s['doctor_name']} on {s['date']} at {s['start_time']}" for s in first_three])
                    response_text = f"We have several open slots. For example: {slot_desc}. Would you like me to book one of these for you?"
                else:
                    response_text = "I checked our schedule, but no open slots were found for that doctor. Would you like to check with another specialist?"

            # General greeting or other query
            elif any(w in text for w in ["hi", "hello", "hey", "good morning", "good afternoon"]):
                response_text = "Hello! I can help you check doctor availability, book an appointment, or cancel an existing one. How can I assist you today?"
            elif any(w in text for w in ["bye", "goodbye", "thank", "thanks"]):
                response_text = "You're welcome! Thank you for calling Nexov Health Clinic. Have a wonderful day!"
            else:
                response_text = "I can check doctor availability, book an appointment, or cancel a booking. Would you like to check available slots with one of our doctors?"

        self.history.append({"speaker": "agent", "text": response_text})
        return {
            "text": response_text,
            "event": event_payload
        }
