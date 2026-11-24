import React from 'react';
import { Appointment } from '../types';
import { CalendarCheck, PhoneCall, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface AppointmentsSectionProps {
  appointments: Appointment[];
  recentlyUpdatedId: number | null;
}

export const AppointmentsSection: React.FC<AppointmentsSectionProps> = ({
  appointments,
  recentlyUpdatedId,
}) => {
  const formatPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald-400" />
            <span>Live Appointments Log</span>
          </h2>
          <p className="text-xs text-slate-400">Real-time bookings synced from caller voice conversations</p>
        </div>
        <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded-xl border border-slate-700">
          {appointments.length} Total
        </span>
      </div>

      {/* Appointments Table */}
      {appointments.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
          <PhoneCall className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
          <p className="text-sm font-medium text-slate-400">No appointments scheduled yet</p>
          <p className="text-xs text-slate-500 mt-0.5">Click "Try Call Assistant" to book your first appointment via voice!</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="pb-3 pl-2">ID</th>
                <th className="pb-3">Caller Phone</th>
                <th className="pb-3">Doctor</th>
                <th className="pb-3">Date & Time</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 pr-2 text-right">Logged At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {appointments.map((appt) => {
                const isRecentlyUpdated = appt.id === recentlyUpdatedId;
                const isBooked = appt.status === 'booked';

                return (
                  <tr
                    key={appt.id}
                    className={`transition-all duration-700 ${
                      isRecentlyUpdated
                        ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* ID */}
                    <td className="py-3.5 pl-2 font-mono text-slate-400">
                      #{appt.id}
                    </td>

                    {/* Caller Phone */}
                    <td className="py-3.5">
                      <div className="flex items-center gap-1.5 font-mono font-medium text-slate-200">
                        <PhoneCall className="w-3 h-3 text-emerald-400" />
                        <span>{formatPhone(appt.patient_phone)}</span>
                      </div>
                    </td>

                    {/* Doctor */}
                    <td className="py-3.5">
                      <div className="font-semibold text-white">{appt.doctor_name}</div>
                      <div className="text-[11px] text-emerald-400">{appt.specialty}</div>
                    </td>

                    {/* Date & Time */}
                    <td className="py-3.5">
                      <div className="text-slate-200 font-medium">{appt.appointment_date}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{appt.appointment_time}</div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5">
                      {isBooked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Booked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          Cancelled
                        </span>
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3.5 pr-2 text-right font-mono text-slate-400 text-[11px]">
                      {appt.created_at}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
