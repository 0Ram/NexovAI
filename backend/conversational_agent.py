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
        self.state = "idle" # idle, offered_slots, awaiting_booking_phone, awaiting_booking_confirmation, awaiting_cancel_phone, awaiting_cancel_confirmation
        self.pending_action: Optional[Dict[str, Any]] = None
        self.history: List[Dict[str, str]] = []
        self.last_mentioned_doctor: Optional[str] = None
        self.last_offered_time: Optional[str] = None
        self.last_action: Optional[str] = None
        self.last_booked_info: Optional[Dict[str, Any]] = None
        self.last_cancelled_info: Optional[Dict[str, Any]] = None

    def reset(self):
        self.state = "idle"
        self.pending_action = None
        self.history = []
        self.last_mentioned_doctor = None
        self.last_offered_time = None
        self.last_action = None
        self.last_booked_info = None
        self.last_cancelled_info = None

    def _extract_phone(self, text: str) -> Optional[str]:
        digits = clean_phone_number(text)
        if len(digits) >= 10:
            return digits[-10:]
        return None

    def _format_phone_for_speech(self, phone: str) -> str:
        return " ".join(list(phone))

    def _detect_doctor(self, text: str) -> Optional[str]:
        """Detects any of the 4 doctors or their specialties."""
        t = text.lower()
        if any(w in t for w in ["sharma", "rajesh", "cardio", "cardiologist", "heart"]):
            return "Dr. Rajesh Sharma"
        elif any(w in t for w in ["iyer", "ananya", "derma", "dermatol", "dermatologist", "skin", "hair", "acne"]):
            return "Dr. Ananya Iyer"
        elif any(w in t for w in ["patel", "priya", "general", "medicine", "physician", "family", "fever", "cough", "cold"]):
            return "Dr. Priya Patel"
        elif any(w in t for w in ["malhotra", "vikram", "ortho", "orthopedic", "bone", "joint", "knee", "spine", "back"]):
            return "Dr. Vikram Malhotra"
        return None

    def _has_time_mention(self, text: str) -> bool:
        t = text.lower().replace(".", "")
        return any(w in t for w in [
            "9:00", "900", "9 am", "9am", "9:00am",
            "10:30", "1030", "10 am", "10am", "10:30am",
            "2:00", "200", "2 pm", "2pm", "2:00pm",
            "4:30", "430", "4 pm", "4pm", "4:30pm",
            "morning", "afternoon", "first slot", "second slot"
        ])

    def _detect_time_slot(self, text: str, default_doc: Optional[str] = None) -> str:
        t = text.lower().replace(".", "")
        if any(w in t for w in ["9:00", "900", "9 am", "9am", "9:00am"]):
            return "09:00 AM"
        if any(w in t for w in ["10:30", "1030", "10 am", "10am", "10:30am"]):
            return "10:30 AM"
        if any(w in t for w in ["2:00", "200", "2 pm", "2pm", "2:00pm"]) and "9" not in t:
            return "02:00 PM"
        if any(w in t for w in ["4:30", "430", "4 pm", "4pm", "4:30pm"]):
            return "04:30 PM"
        
        if default_doc:
            slots = get_available_slots(doctor_name=default_doc)
            if slots:
                return slots[0]["start_time"]

        return "09:00 AM"

    async def process_user_utterance(self, user_text: str) -> Dict[str, Any]:
        """Processes user utterance and returns response text and optional action event."""
        text = user_text.lower().strip()
        self.history.append({"speaker": "caller", "text": user_text})
        response_text = ""
        event_payload = None

        # Check for confirmations
        is_yes = any(w in text for w in [
            "yes", "yeah", "yep", "yup", "correct", "right", "sure", "proceed",
            "confirm", "confirmed", "please", "okay", "ok", "my number",
            "that is my number", "that's my number", "it is my number", "it's my number",
            "that's correct", "that is correct", "that is right", "that's right",
            "book it", "go ahead", "perfect", "done", "fine", "true", "sounds good"
        ])
        is_no = any(w in text for w in ["no", "nope", "wrong", "incorrect", "cancel that", "not that", "different number"])

        # Update last mentioned doctor if detected
        detected_doc = self._detect_doctor(text)
        if detected_doc:
            self.last_mentioned_doctor = detected_doc

        phone_candidate = self._extract_phone(text)

        # State 1: Awaiting Booking Confirmation
        if self.state == "awaiting_booking_confirmation" and self.pending_action:
            is_same_phone = bool(phone_candidate and phone_candidate == self.pending_action.get("phone"))
            if is_yes or is_same_phone:
                res = book_appointment_db(
                    patient_phone=self.pending_action["phone"],
                    slot_id=self.pending_action.get("slot_id"),
                    doctor_name=self.pending_action["doctor_name"],
                    slot_time=self.pending_action["slot_time"],
                    date=self.pending_action.get("date")
                )
                if res["success"]:
                    response_text = (
                        f"Thank you! Your appointment with {res['doctor_name']} ({res['specialty']}) "
                        f"has been confirmed for {res['date']} at {res['time']}. "
                        f"Your confirmation ID is #{res['appointment_id']}. Is there anything else I can help you with today?"
                    )
                    event_payload = {
                        "type": "appointment_updated",
                        "action": "booked",
                        "data": res
                    }
                    self.last_action = "booked"
                    self.last_booked_info = res
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
            is_same_phone = bool(phone_candidate and phone_candidate == self.pending_action.get("phone"))
            if is_yes or is_same_phone:
                res = cancel_appointment_db(patient_phone=self.pending_action["phone"])
                if res["success"]:
                    response_text = (
                        f"Your appointment with {res['doctor_name']} on {res['date']} at {res['time']} "
                        f"has been successfully cancelled. Thank you for calling Nexov Health Clinic. Have a wonderful day. Goodbye!"
                    )
                    event_payload = {
                        "type": "appointment_updated",
                        "action": "cancelled",
                        "data": res,
                        "auto_end_call": True
                    }
                    self.last_action = "cancelled"
                    self.last_cancelled_info = res
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

        # State 3: Normal Conversation, Inquiries, or Slot Selection
        else:
            phone = self._extract_phone(text)
            has_time = self._has_time_mention(text)

            # Check if user is cancelling
            if "cancel" in text:
                if phone:
                    self.state = "awaiting_cancel_confirmation"
                    self.pending_action = {"phone": phone}
                    spoken_phone = self._format_phone_for_speech(phone)
                    response_text = f"I can certainly help you cancel that. Before I proceed, just to confirm, is your phone number {spoken_phone}?"
                else:
                    self.state = "awaiting_cancel_phone"
                    response_text = "I can help cancel your appointment. Could you please state the phone number you used when booking?"

            elif self.state == "awaiting_cancel_phone":
                if phone:
                    self.state = "awaiting_cancel_confirmation"
                    self.pending_action = {"phone": phone}
                    spoken_phone = self._format_phone_for_speech(phone)
                    response_text = f"Thank you. Just to confirm, is your phone number {spoken_phone}?"
                else:
                    response_text = "Please tell me your 10-digit phone number so I can look up your appointment."

            elif self.state == "awaiting_booking_phone":
                if phone:
                    self.state = "awaiting_booking_confirmation"
                    self.pending_action["phone"] = phone
                    spoken_phone = self._format_phone_for_speech(phone)
                    doc_name = self.pending_action.get("doctor_name", self.last_mentioned_doctor or "Dr. Rajesh Sharma")
                    time_slot = self.pending_action.get("slot_time", "09:00 AM")
                    date_slot = self.pending_action.get("date", "Tomorrow")
                    response_text = (
                        f"Thank you. Just to confirm before booking {doc_name} on {date_slot} at {time_slot}, is your phone number {spoken_phone}?"
                    )
                else:
                    response_text = "Could you please tell me your 10-digit phone number so I can proceed with the booking?"

            # Check for booking intent (words like book/schedule OR mentioning a time like "9:00 a.m." OR answering yes after slots offered)
            elif (
                "book" in text 
                or "schedule" in text 
                or "reserve" in text
                or has_time
                or (self.state == "offered_slots" and (is_yes or has_time))
            ):
                doc_name = detected_doc or self.last_mentioned_doctor

                if not doc_name:
                    response_text = (
                        "Which doctor would you like to book with? We have Dr. Rajesh Sharma (Cardiology), "
                        "Dr. Ananya Iyer (Dermatology), Dr. Priya Patel (General Medicine), and Dr. Vikram Malhotra (Orthopedics)."
                    )
                else:
                    self.last_mentioned_doctor = doc_name
                    # Find actual available slot in database
                    avail_slots = get_available_slots(doctor_name=doc_name)
                    time_slot = self._detect_time_slot(text, default_doc=doc_name)

                    matched_slot = None
                    if avail_slots:
                        clean_time = time_slot.replace(" ", "").replace(":00", "").lower()
                        for s in avail_slots:
                            if s["start_time"] == time_slot or clean_time in s["start_time"].replace(" ", "").replace(":00", "").lower():
                                matched_slot = s
                                break
                        if not matched_slot:
                            matched_slot = avail_slots[0]

                    slot_id = matched_slot["id"] if matched_slot else None
                    slot_date = matched_slot["date"] if matched_slot else "Tomorrow"
                    slot_time = matched_slot["start_time"] if matched_slot else time_slot
                    doc_name = matched_slot["doctor_name"] if matched_slot else doc_name

                    if phone:
                        self.state = "awaiting_booking_confirmation"
                        self.pending_action = {
                            "slot_id": slot_id,
                            "phone": phone,
                            "doctor_name": doc_name,
                            "slot_time": slot_time,
                            "date": slot_date
                        }
                        spoken_phone = self._format_phone_for_speech(phone)
                        response_text = (
                            f"I have a slot available with {doc_name} on {slot_date} at {slot_time}. "
                            f"Before I book it, just to confirm, is your phone number {spoken_phone}?"
                        )
                    else:
                        self.state = "awaiting_booking_phone"
                        self.pending_action = {
                            "slot_id": slot_id,
                            "doctor_name": doc_name,
                            "slot_time": slot_time,
                            "date": slot_date
                        }
                        response_text = f"Great! I can book {doc_name} on {slot_date} at {slot_time}. What is your 10-digit phone number?"

            # Availability / Doctor inquiry
            elif any(w in text for w in ["available", "availability", "slot", "slots", "doctor", "doctors", "when", "free", "schedule", "starts", "timing", "timings"]):
                target_doc = detected_doc or self.last_mentioned_doctor

                target_specialty = None
                if "cardio" in text:
                    target_specialty = "Cardiology"
                    target_doc = target_doc or "Dr. Rajesh Sharma"
                elif "derma" in text or "skin" in text:
                    target_specialty = "Dermatology"
                    target_doc = target_doc or "Dr. Ananya Iyer"
                elif "general" in text or "primary" in text or "fever" in text:
                    target_specialty = "General Medicine"
                    target_doc = target_doc or "Dr. Priya Patel"
                elif "ortho" in text or "bone" in text or "joint" in text:
                    target_specialty = "Orthopedics"
                    target_doc = target_doc or "Dr. Vikram Malhotra"

                if target_doc:
                    self.last_mentioned_doctor = target_doc

                slots = get_available_slots(doctor_name=target_doc, specialty=target_specialty)
                if slots:
                    first_three = slots[:3]
                    slot_desc = ", ".join([f"{s['doctor_name']} on {s['date']} at {s['start_time']}" for s in first_three])
                    doc_label = f"with {target_doc}" if target_doc else "available"
                    self.state = "offered_slots"
                    response_text = f"We have several open slots {doc_label}. For example: {slot_desc}. Would you like me to book one of these for you?"
                else:
                    response_text = "I checked our schedule, but no open slots were found. Would you like to check with another specialist?"

            # If user repeats confirmation after already booked
            elif self.last_action == "booked" and (is_yes or "that is my number" in text or "my number" in text):
                doc_name = self.last_booked_info.get("doctor_name", "your doctor") if self.last_booked_info else "your doctor"
                time_slot = self.last_booked_info.get("time", "") if self.last_booked_info else ""
                date_slot = self.last_booked_info.get("date", "") if self.last_booked_info else ""
                app_id = self.last_booked_info.get("appointment_id", "") if self.last_booked_info else ""
                response_text = (
                    f"Your appointment with {doc_name} is already booked and confirmed for {date_slot} at {time_slot} "
                    f"(ID #{app_id}). Is there anything else I can help you with, or should I end the call?"
                )

            # User answering "no" after an action is completed (e.g. "no that's all", "nothing else")
            elif self.last_action in ["booked", "cancelled"] and (is_no or "nothing" in text or "that's all" in text or "thats all" in text or "all set" in text):
                response_text = "Understood! Thank you for calling Nexov Health Clinic. Have a wonderful day. Goodbye!"
                event_payload = {
                    "type": "call_ended",
                    "reason": "user_completed",
                    "auto_end_call": True
                }

            # General greetings & completions
            elif any(w in text for w in ["end call", "hang up", "bye", "goodbye", "stop call", "close call"]):
                response_text = "Thank you for calling Nexov Health Clinic. Have a wonderful day! Goodbye."
                event_payload = {
                    "type": "call_ended",
                    "reason": "user_completed",
                    "auto_end_call": True
                }
            elif any(w in text for w in ["thank", "thanks"]):
                response_text = "You're very welcome! Thank you for calling Nexov Health Clinic. Have a wonderful day. Goodbye!"
                event_payload = {
                    "type": "call_ended",
                    "reason": "user_completed",
                    "auto_end_call": True
                }
            elif any(w in text for w in ["hi", "hello", "hey", "good morning", "good afternoon"]):
                response_text = "Hello! I can help you check doctor availability, book an appointment, or cancel an existing one. How can I assist you today?"
            else:
                response_text = "I can check doctor availability, book an appointment, or cancel a booking with Dr. Rajesh Sharma, Dr. Ananya Iyer, Dr. Priya Patel, or Dr. Vikram Malhotra. Which doctor or specialty would you like?"

        self.history.append({"speaker": "agent", "text": response_text})
        return {
            "text": response_text,
            "event": event_payload
        }
