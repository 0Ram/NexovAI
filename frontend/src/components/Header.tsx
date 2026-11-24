import React from 'react';
import { Phone, Activity, RotateCcw, Stethoscope, Sparkles } from 'lucide-react';

interface HeaderProps {
  onStartCall: () => void;
  onResetDB: () => void;
  isCallActive: boolean;
  health: {
    status: string;
    gemini_configured: boolean;
    elevenlabs_configured: boolean;
    pipecat_ready: boolean;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({
  onStartCall,
  onResetDB,
  isCallActive,
  health,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Nexov Health</h1>
              <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Voice AI
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous Doctor Appointment & Scheduling Assistant</p>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* System Status Indicators */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Pipecat Engine
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              Gemini & ElevenLabs
            </span>
          </div>

          {/* Reset Demo Button */}
          <button
            onClick={onResetDB}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 rounded-xl transition"
            title="Reset slots and appointments to clean state"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Reset Demo DB</span>
          </button>

          {/* Primary CTA: Try Voice Call Button */}
          <button
            onClick={onStartCall}
            disabled={isCallActive}
            className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg ${
              isCallActive
                ? 'bg-emerald-600/50 text-emerald-200 cursor-not-allowed border border-emerald-500/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 active:scale-95'
            }`}
          >
            {!isCallActive && (
              <span className="absolute -inset-0.5 rounded-xl bg-emerald-500/30 blur-sm animate-pulse-subtle"></span>
            )}
            <Phone className={`w-4 h-4 relative z-10 ${isCallActive ? 'animate-bounce' : ''}`} />
            <span className="relative z-10">
              {isCallActive ? 'Call In Progress' : 'Try Call Assistant'}
            </span>
          </button>
        </div>

      </div>
    </header>
  );
};
