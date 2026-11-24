export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  experience_years: number;
  clinic_room: string;
  bio: string;
  avatar: string;
  available_slots: number;
  total_slots: number;
}

export interface Slot {
  id: number;
  doctor_id: number;
  date: string;
  start_time: string;
  is_booked: number;
  doctor_name?: string;
  specialty?: string;
}

export interface Appointment {
  id: number;
  patient_phone: string;
  doctor_name: string;
  specialty: string;
  clinic_room: string;
  appointment_date: string;
  appointment_time: string;
  status: 'booked' | 'cancelled';
  created_at: string;
  cancelled_at?: string;
}

export interface TranscriptMessage {
  id: string;
  speaker: 'caller' | 'agent';
  text: string;
  timestamp: string;
  is_final: boolean;
}

export type CallStatus = 'idle' | 'calling' | 'connected' | 'ended';

export interface BookingEventData {
  success: boolean;
  appointment_id: number;
  patient_phone: string;
  doctor_name: string;
  specialty: string;
  clinic_room?: string;
  date: string;
  time: string;
  message: string;
}
