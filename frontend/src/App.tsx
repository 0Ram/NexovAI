import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DoctorsSection } from './components/DoctorsSection';
import { AppointmentsSection } from './components/AppointmentsSection';
import { TranscriptSidePanel } from './components/TranscriptSidePanel';
import { PhoneCallModal } from './components/PhoneCallModal';
import { useVoiceCall } from './hooks/useVoiceCall';
import { Doctor, Slot, Appointment, BookingEventData } from './types';
import { Calendar, Users, PhoneCall, ShieldCheck, Sparkles } from 'lucide-react';

export function App() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<number | null>(null);
  const [health, setHealth] = useState<any>(null);

  // Fetch doctors and slots
  const fetchDoctorsAndSlots = useCallback(async () => {
    try {
      const [docsRes, slotsRes] = await Promise.all([
        fetch('http://localhost:8000/api/doctors'),
        fetch('http://localhost:8000/api/slots'),
      ]);
      const docsData = await docsRes.json();
      const slotsData = await slotsRes.json();
      setDoctors(docsData.doctors || []);
      setSlots(slotsData.slots || []);
    } catch (e) {
      console.error('Error fetching doctors or slots:', e);
    }
  }, []);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/appointments');
      const data = await res.json();
      setAppointments(data.appointments || []);
    } catch (e) {
      console.error('Error fetching appointments:', e);
    }
  }, []);

  // Health check
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (e) {
      console.error('Error fetching health status:', e);
    }
  }, []);

  useEffect(() => {
    fetchDoctorsAndSlots();
    fetchAppointments();
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchDoctorsAndSlots, fetchAppointments, fetchHealth]);

  // Handle appointment updated event from Voice AI
  const handleAppointmentUpdated = useCallback(
    (event: { action: 'booked' | 'cancelled'; data: BookingEventData }) => {
      fetchDoctorsAndSlots();
      fetchAppointments();
      if (event.data?.appointment_id) {
        setRecentlyUpdatedId(event.data.appointment_id);
        setTimeout(() => setRecentlyUpdatedId(null), 4000);
      }
    },
    [fetchDoctorsAndSlots, fetchAppointments]
  );

  // Reset demo DB
  const handleResetDB = async () => {
    try {
      await fetch('http://localhost:8000/api/reset', { method: 'POST' });
      await fetchDoctorsAndSlots();
      await fetchAppointments();
    } catch (e) {
      console.error('Error resetting DB:', e);
    }
  };

  const {
    callStatus,
    callDuration,
    isMuted,
    transcripts,
    latestBooking,
    latestCancellation,
    analyserNode,
    startCall,
    endCall,
    toggleMute,
    sendTextMessage,
  } = useVoiceCall({
    onAppointmentUpdated: handleAppointmentUpdated,
  });

  const handleStartCall = () => {
    setIsModalOpen(true);
    startCall();
  };

  const handleCallDoctor = (doctorName: string) => {
    setIsModalOpen(true);
    startCall();
    setTimeout(() => {
      sendTextMessage(`What slots are available for ${doctorName}?`);
    }, 1800);
  };

  const availableSlotsCount = slots.filter((s) => s.is_booked === 0).length;
  const bookedAppointmentsCount = appointments.filter((a) => a.status === 'booked').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation & Status Header */}
      <Header
        onStartCall={handleStartCall}
        onResetDB={handleResetDB}
        isCallActive={callStatus === 'calling' || callStatus === 'connected'}
        health={health}
      />

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* KPI Metrics Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Specialists</p>
              <h3 className="text-xl font-bold text-white">{doctors.length} Doctors</h3>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="p-3 bg-teal-500/10 text-teal-400 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Available Slots</p>
              <h3 className="text-xl font-bold text-white">{availableSlotsCount} Open</h3>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Active Bookings</p>
              <h3 className="text-xl font-bold text-white">{bookedAppointmentsCount} Confirmed</h3>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Phone Verification</p>
              <h3 className="text-xl font-bold text-emerald-400">Strict Read-Back</h3>
            </div>
          </div>
        </div>

        {/* 2-Column Core Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left 2 Columns: Doctors & Live Appointments Table */}
          <div className="lg:col-span-2 space-y-8">
            <DoctorsSection
              doctors={doctors}
              slots={slots}
              selectedDoctorId={null}
              onSelectDoctor={() => {}}
              onCallDoctor={handleCallDoctor}
            />

            <AppointmentsSection
              appointments={appointments}
              recentlyUpdatedId={recentlyUpdatedId}
            />
          </div>

          {/* Right Column: Live Transcript Monitor & Quick Info */}
          <div className="space-y-6">
            <TranscriptSidePanel
              transcripts={transcripts}
              callStatus={callStatus}
            />

            {/* Voice AI Instructions Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/30 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>Voice Pipeline Architecture</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Powered by <strong>Pipecat</strong> with <strong>Silero VAD</strong>, 
                <strong> ElevenLabs Realtime STT</strong>, <strong>Google Gemini</strong> function calling, and <strong>ElevenLabs TTS</strong>.
              </p>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                <li><strong className="text-slate-200">Zero OTP / Zero Login:</strong> Identified solely by spoken phone number.</li>
                <li><strong className="text-slate-200">Confirmation Safety:</strong> Agent repeats back digits before executing any booking or cancellation.</li>
                <li><strong className="text-slate-200">Real-Time Sync:</strong> Dashboard updates live as conversation proceeds.</li>
              </ul>
            </div>
          </div>

        </div>

      </main>

      {/* Interactive Phone Call Modal (Bonus Feature) */}
      <PhoneCallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        callStatus={callStatus}
        callDuration={callDuration}
        isMuted={isMuted}
        transcripts={transcripts}
        latestBooking={latestBooking}
        latestCancellation={latestCancellation}
        analyserNode={analyserNode}
        onToggleMute={toggleMute}
        onEndCall={endCall}
        onSendText={sendTextMessage}
      />
    </div>
  );
}
export default App;
