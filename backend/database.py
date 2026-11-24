import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Optional, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "doctor_assistant.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        specialty TEXT NOT NULL,
        experience_years INTEGER NOT NULL,
        clinic_room TEXT NOT NULL,
        bio TEXT NOT NULL,
        avatar TEXT
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        is_booked INTEGER DEFAULT 0,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_phone TEXT NOT NULL,
        doctor_id INTEGER NOT NULL,
        slot_id INTEGER NOT NULL,
        status TEXT DEFAULT 'booked',
        created_at TEXT NOT NULL,
        cancelled_at TEXT,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id),
        FOREIGN KEY (slot_id) REFERENCES slots(id)
    );
    """)
    conn.commit()

    # Seed mock doctors if empty
    cursor.execute("SELECT COUNT(*) as count FROM doctors")
    if cursor.fetchone()["count"] == 0:
        doctors_data = [
            ("Dr. Rajesh Sharma", "Cardiology", 15, "Suite 302, Heart Center", "Senior Consultant Cardiologist specializing in preventive heart health and clinical arrhythmias.", "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=300"),
            ("Dr. Ananya Iyer", "Dermatology", 10, "Room 105, Skin Clinic", "Consultant Dermatologist and Trichologist focusing on skin health, aesthetics and clinical acne care.", "https://images.unsplash.com/photo-1659353888633-bc0db91345df?auto=format&fit=crop&q=80&w=300"),
            ("Dr. Priya Patel", "General Medicine", 12, "Room 201, Primary Care", "Consultant Physician dedicated to comprehensive family wellness, preventive health and primary care.", "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300"),
            ("Dr. Vikram Malhotra", "Orthopedics", 16, "Room 410, Bone & Joint Wing", "Senior Orthopedic Surgeon expert in joint rehabilitation, knee care and sports injury medicine.", "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300"),
        ]
        cursor.executemany("""
            INSERT INTO doctors (name, specialty, experience_years, clinic_room, bio, avatar)
            VALUES (?, ?, ?, ?, ?, ?)
        """, doctors_data)
        conn.commit()

        # Seed realistic slots for each doctor across today and tomorrow
        cursor.execute("SELECT id FROM doctors")
        doc_ids = [row["id"] for row in cursor.fetchall()]
        
        sample_dates = ["Tomorrow (Wednesday)", "Thursday"]
        times = ["09:00 AM", "10:30 AM", "02:00 PM", "04:30 PM"]

        slots_data = []
        for d_id in doc_ids:
            for s_date in sample_dates:
                for t in times:
                    slots_data.append((d_id, s_date, t, 0))

        cursor.executemany("""
            INSERT INTO slots (doctor_id, date, start_time, is_booked)
            VALUES (?, ?, ?, ?)
        """, slots_data)
        conn.commit()

    conn.close()

def get_doctors() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.*, 
            COUNT(s.id) as total_slots,
            SUM(CASE WHEN s.is_booked = 0 THEN 1 ELSE 0 END) as available_slots
        FROM doctors d
        LEFT JOIN slots s ON d.id = s.doctor_id
        GROUP BY d.id
    """)
    rows = cursor.fetchall()
    doctors = [dict(r) for r in rows]
    conn.close()
    return doctors

def get_available_slots(doctor_name: Optional[str] = None, specialty: Optional[str] = None, date: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT s.id, s.doctor_id, s.date, s.start_time, d.name as doctor_name, d.specialty, d.clinic_room
        FROM slots s
        JOIN doctors d ON s.doctor_id = d.id
        WHERE s.is_booked = 0
    """
    params = []
    
    if doctor_name:
        query += " AND LOWER(d.name) LIKE ?"
        params.append(f"%{doctor_name.lower().replace('dr.', '').strip()}%")
        
    if specialty:
        query += " AND LOWER(d.specialty) LIKE ?"
        params.append(f"%{specialty.lower().strip()}%")
        
    if date:
        query += " AND LOWER(s.date) LIKE ?"
        params.append(f"%{date.lower().strip()}%")
        
    query += " ORDER BY s.date, s.start_time ASC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    slots = [dict(r) for r in rows]
    conn.close()
    return slots

def clean_phone_number(phone: str) -> str:
    """Normalize phone number to digits."""
    return "".join(c for c in phone if c.isdigit())

def book_appointment_db(patient_phone: str, slot_id: Optional[int] = None, doctor_name: Optional[str] = None, slot_time: Optional[str] = None, date: Optional[str] = None) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    phone = clean_phone_number(patient_phone)
    if not phone or len(phone) < 7:
        conn.close()
        return {"success": False, "error": f"Invalid phone number '{patient_phone}'. Please provide a valid 10-digit phone number."}

    # Find the target slot
    target_slot = None
    if slot_id:
        cursor.execute("SELECT s.*, d.name as doctor_name, d.specialty, d.clinic_room FROM slots s JOIN doctors d ON s.doctor_id = d.id WHERE s.id = ? AND s.is_booked = 0", (slot_id,))
        target_slot = cursor.fetchone()
    else:
        # Match by doctor name and slot time/date
        query = "SELECT s.*, d.name as doctor_name, d.specialty, d.clinic_room FROM slots s JOIN doctors d ON s.doctor_id = d.id WHERE s.is_booked = 0"
        params = []
        if doctor_name:
            query += " AND LOWER(d.name) LIKE ?"
            params.append(f"%{doctor_name.lower().replace('dr.', '').strip()}%")
        if slot_time:
            # normalize time format like "10:30" or "10:30 AM" or "10 am"
            clean_time = slot_time.lower().replace(" ", "").replace(":00", "")
            query += " AND (REPLACE(LOWER(s.start_time), ' ', '') LIKE ? OR LOWER(s.start_time) LIKE ?)"
            params.extend([f"%{clean_time}%", f"%{slot_time.lower()}%"])
        if date:
            query += " AND LOWER(s.date) LIKE ?"
            params.append(f"%{date.lower().strip()}%")
            
        cursor.execute(query, params)
        target_slot = cursor.fetchone()

    if not target_slot:
        conn.close()
        return {"success": False, "error": "No matching available slot found. Please check available slots first."}

    slot_id_val = target_slot["id"]
    doc_id_val = target_slot["doctor_id"]
    doc_name = target_slot["doctor_name"]
    doc_specialty = target_slot["specialty"]
    clinic_room = target_slot["clinic_room"]
    booked_date = target_slot["date"]
    booked_time = target_slot["start_time"]
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Mark slot booked
    cursor.execute("UPDATE slots SET is_booked = 1 WHERE id = ?", (slot_id_val,))
    # Insert appointment
    cursor.execute("""
        INSERT INTO appointments (patient_phone, doctor_id, slot_id, status, created_at)
        VALUES (?, ?, ?, 'booked', ?)
    """, (phone, doc_id_val, slot_id_val, now_str))
    
    appointment_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "success": True,
        "appointment_id": appointment_id,
        "patient_phone": phone,
        "doctor_name": doc_name,
        "specialty": doc_specialty,
        "clinic_room": clinic_room,
        "date": booked_date,
        "time": booked_time,
        "message": f"Appointment #{appointment_id} confirmed with {doc_name} ({doc_specialty}) on {booked_date} at {booked_time}."
    }

def cancel_appointment_db(patient_phone: str, appointment_id: Optional[int] = None) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    phone = clean_phone_number(patient_phone)
    if not phone:
        conn.close()
        return {"success": False, "error": "Please provide your phone number to cancel the appointment."}

    if appointment_id:
        cursor.execute("""
            SELECT a.*, s.start_time, s.date, d.name as doctor_name, d.specialty 
            FROM appointments a
            JOIN slots s ON a.slot_id = s.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = ? AND a.patient_phone = ? AND a.status = 'booked'
        """, (appointment_id, phone))
    else:
        cursor.execute("""
            SELECT a.*, s.start_time, s.date, d.name as doctor_name, d.specialty 
            FROM appointments a
            JOIN slots s ON a.slot_id = s.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.patient_phone = ? AND a.status = 'booked'
            ORDER BY a.id DESC LIMIT 1
        """, (phone,))

    appt = cursor.fetchone()
    if not appt:
        conn.close()
        return {"success": False, "error": f"No active appointment found for phone number {phone}."}

    appt_id = appt["id"]
    slot_id = appt["slot_id"]
    doc_name = appt["doctor_name"]
    doc_specialty = appt["specialty"]
    appt_time = appt["start_time"]
    appt_date = appt["date"]
    cancelled_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Mark appointment cancelled
    cursor.execute("UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ?", (cancelled_now, appt_id))
    # Release the slot
    cursor.execute("UPDATE slots SET is_booked = 0 WHERE id = ?", (slot_id,))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "appointment_id": appt_id,
        "patient_phone": phone,
        "doctor_name": doc_name,
        "specialty": doc_specialty,
        "date": appt_date,
        "time": appt_time,
        "message": f"Appointment #{appt_id} with {doc_name} on {appt_date} at {appt_time} has been successfully cancelled."
    }

def get_all_appointments() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.id, a.patient_phone, a.status, a.created_at, a.cancelled_at,
               d.name as doctor_name, d.specialty, d.clinic_room,
               s.date as appointment_date, s.start_time as appointment_time
        FROM appointments a
        JOIN doctors d ON a.doctor_id = d.id
        JOIN slots s ON a.slot_id = s.id
        ORDER BY a.id DESC
    """)
    rows = cursor.fetchall()
    appts = [dict(r) for r in rows]
    conn.close()
    return appts

def get_all_slots() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, s.doctor_id, s.date, s.start_time, s.is_booked,
               d.name as doctor_name, d.specialty
        FROM slots s
        JOIN doctors d ON s.doctor_id = d.id
        ORDER BY d.name, s.date, s.start_time ASC
    """)
    rows = cursor.fetchall()
    slots = [dict(r) for r in rows]
    conn.close()
    return slots
