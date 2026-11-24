import React, { useState } from 'react';
import { Doctor, Slot } from '../types';
import { Calendar, Clock, MapPin, Award, CheckCircle, Search, Phone } from 'lucide-react';

interface DoctorsSectionProps {
  doctors: Doctor[];
  slots: Slot[];
  selectedDoctorId: number | null;
  onSelectDoctor: (doctorId: number | null) => void;
  onCallDoctor?: (doctorName: string) => void;
}

export const DoctorsSection: React.FC<DoctorsSectionProps> = ({
  doctors,
  slots,
  selectedDoctorId,
  onSelectDoctor,
  onCallDoctor,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');

  const specialties = ['all', ...Array.from(new Set(doctors.map((d) => d.specialty)))];

  const filteredDoctors = doctors.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doc.specialty.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSpecialty = selectedSpecialty === 'all' || doc.specialty === selectedSpecialty;
    return matchesSearch && matchesSpecialty;
  });

  return (
    <div className="space-y-4">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Specialists & Available Slots</span>
            <span className="text-xs font-normal text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              {slots.filter((s) => s.is_booked === 0).length} Slots Open
            </span>
          </h2>
          <p className="text-xs text-slate-400">View doctor schedules synced with voice AI bookings</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Specialty Selector */}
          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            {specialties.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All Specialties' : s}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doctor..."
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-xl focus:outline-none focus:border-emerald-500 w-36 sm:w-44 placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Doctors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredDoctors.map((doc) => {
          const docSlots = slots.filter((s) => s.doctor_id === doc.id);
          const availableSlots = docSlots.filter((s) => s.is_booked === 0);

          return (
            <div
              key={doc.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4.5 hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div>
                {/* Doctor Header */}
                <div className="flex items-start gap-3.5">
                  <img
                    src={doc.avatar}
                    alt={doc.name}
                    className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shadow-md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white truncate">{doc.name}</h3>
                      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        {doc.specialty}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Award className="w-3 h-3 text-amber-400" />
                        {doc.experience_years} yrs exp
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-400" />
                        {doc.clinic_room}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {doc.bio}
                    </p>
                  </div>
                </div>

                {/* Slots section */}
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      Available Slots
                    </span>
                    <span className="text-emerald-400 font-mono text-[11px]">
                      {availableSlots.length} available
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {docSlots.slice(0, 4).map((slot) => {
                      const isBooked = slot.is_booked === 1;
                      return (
                        <div
                          key={slot.id}
                          className={`text-center py-1.5 px-2 rounded-xl text-[11px] font-mono transition-all ${
                            isBooked
                              ? 'bg-slate-800/40 text-slate-600 line-through border border-slate-800'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/50'
                          }`}
                          title={`${slot.date} • ${slot.start_time} ${isBooked ? '(Booked)' : '(Available)'}`}
                        >
                          {slot.start_time}
                        </div>
                      );
                    })}
                  </div>

                  {/* Call Doctor CTA */}
                  <div className="mt-3 pt-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Tap to schedule with AI</span>
                    <button
                      onClick={() => onCallDoctor && onCallDoctor(doc.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold border border-emerald-500/30 transition shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Book with {doc.name.split(" ")[1]}</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};
