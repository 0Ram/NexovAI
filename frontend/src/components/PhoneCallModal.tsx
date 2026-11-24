import React, { useEffect, useRef, useState } from 'react';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Calendar, 
  CheckCircle2, 
  Send, 
  Clock, 
  User, 
  Sparkles,
  Signal,
  Wifi,
  Battery
} from 'lucide-react';
import { TranscriptMessage, CallStatus, BookingEventData } from '../types';

interface PhoneCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  callStatus: CallStatus;
  callDuration: number;
  isMuted: boolean;
  transcripts: TranscriptMessage[];
  latestBooking: BookingEventData | null;
  latestCancellation?: BookingEventData | null;
  analyserNode: AnalyserNode | null;
  onToggleMute: () => void;
  onEndCall: () => void;
  onSendText: (text: string) => void;
}

export const PhoneCallModal: React.FC<PhoneCallModalProps> = ({
  isOpen,
  onClose,
  callStatus,
  callDuration,
  isMuted,
  transcripts,
  latestBooking,
  latestCancellation,
  analyserNode,
  onToggleMute,
  onEndCall,
  onSendText,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Waveform Visualizer on Canvas
  useEffect(() => {
    if (!canvasRef.current || callStatus !== 'connected') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);

      if (analyserNode) {
        analyserNode.getByteFrequencyData(dataArray);
      } else {
        // Subtle idle simulation
        for (let i = 0; i < dataArray.length; i++) {
          dataArray[i] = Math.sin(Date.now() / 200 + i) * 10 + 15;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / 32) - 2;
      let x = 0;

      for (let i = 0; i < 32; i++) {
        const val = dataArray[i * 2] || 0;
        const percent = val / 255;
        const barHeight = Math.max(4, percent * height * 0.9);

        // Gradient color: Emerald to Teal
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(1, '#34d399');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, height / 2 - barHeight / 2, barWidth, barHeight, 4);
        ctx.fill();

        x += barWidth + 2;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode, callStatus]);

  if (!isOpen) return null;

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleSendPrompt = (text: string) => {
    onSendText(text);
    setInputText('');
  };

  const promptSuggestions = [
    "What slots are available for Dr. Rajesh Sharma?",
    "Book Dr. Rajesh Sharma tomorrow at 10:30 AM, my number is 9876543210",
    "What slots are available for Dr. Ananya Iyer?",
    "Book Dr. Ananya Iyer tomorrow at 10:30 AM, my number is 9876543210",
    "What slots are available for Dr. Vikram Malhotra?",
    "What slots are available for Dr. Priya Patel?",
    "Cancel my appointment for 1234567898",
    "Cancel my appointment for 9876543210",
    "That's all, thank you! Goodbye",
  ];

  const lastMsg = transcripts.length > 0 ? transcripts[transcripts.length - 1] : null;
  const lastTextLower = lastMsg?.text?.toLowerCase() || '';
  const isAwaitingConfirmation = Boolean(
    callStatus === 'connected' &&
    lastMsg &&
    lastMsg.speaker === 'agent' &&
    lastMsg.text.trim().endsWith('?') &&
    !lastTextLower.includes('has been confirmed') &&
    !lastTextLower.includes('successfully cancelled') &&
    !lastTextLower.includes('already booked') &&
    (lastTextLower.includes('just to confirm') ||
     lastTextLower.includes('please confirm') ||
     lastTextLower.includes('is your phone number') ||
     lastTextLower.includes('should i book') ||
     lastTextLower.includes('should i cancel'))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      {/* Smartphone Shell Frame */}
      <div className="relative w-full max-w-[410px] h-[780px] bg-slate-900 rounded-[50px] p-3.5 shadow-2xl border-[5px] border-slate-700/80 flex flex-col justify-between ring-1 ring-white/10">
        
        {/* Phone Speaker Notch & Dynamic Island */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center">
          <div className="w-28 h-5 bg-black rounded-full flex items-center justify-between px-3">
            <div className="w-2 h-2 rounded-full bg-slate-800"></div>
            <div className="w-10 h-1 bg-slate-800 rounded-full"></div>
            <div className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse"></div>
          </div>
        </div>

        {/* Inner Phone Screen Content */}
        <div className="w-full h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 rounded-[40px] flex flex-col overflow-hidden relative">
          
          {/* iOS-style Top Status Bar */}
          <div className="flex items-center justify-between px-6 pt-3 text-xs text-slate-400 font-medium z-20">
            <span>9:41</span>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Signal className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-4 h-4 text-emerald-400" />
            </div>
          </div>

          {/* Caller / Agent Header */}
          <div className="flex flex-col items-center pt-6 pb-3 px-4 text-center z-10">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-lg shadow-emerald-500/20">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                  <span className="text-xl font-bold text-emerald-400">NX</span>
                </div>
              </div>
              {callStatus === 'connected' && (
                <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full animate-ping"></span>
              )}
            </div>

            <h3 className="text-lg font-semibold text-white tracking-wide">Nexa (AI Clinic Assistant)</h3>
            <p className="text-xs text-emerald-400 font-medium">Nexov Health Clinic</p>
            
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Clock className="w-3 h-3 text-emerald-400" />
              {callStatus === 'calling' && <span className="text-amber-400 animate-pulse">Ringing...</span>}
              {callStatus === 'connected' && <span className="text-emerald-400">{formatDuration(callDuration)}</span>}
              {callStatus === 'ended' && <span className="text-rose-400">Call Ended</span>}
            </div>

            {/* Live Waveform Canvas */}
            <div className="w-full max-w-[220px] h-9 mt-2 flex items-center justify-center">
              <canvas ref={canvasRef} width={220} height={36} className="w-full h-full" />
            </div>
          </div>

          {/* In-Call Live Transcript Window */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5 text-xs">
            {transcripts.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 px-6">
                <Sparkles className="w-8 h-8 text-emerald-500/40 mb-2 animate-bounce" />
                <p>Nexa is connecting to your call...</p>
                <p className="text-[11px] text-slate-600 mt-1">Speak into your microphone or tap the suggested prompts below.</p>
              </div>
            )}

            {transcripts.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col ${t.speaker === 'caller' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5 px-1">
                  <span>{t.speaker === 'caller' ? 'You' : 'Nexa'}</span>
                  <span>•</span>
                  <span>{t.timestamp}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed shadow-sm ${
                    t.speaker === 'caller'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-bl-none'
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}

            {/* In-Phone Confirmed Booking Card (Bonus) */}
            {latestBooking && latestBooking.success && (
              <div className="bg-gradient-to-br from-emerald-950/80 to-slate-900 border border-emerald-500/40 rounded-2xl p-3 my-2 text-slate-200 shadow-xl animate-fade-in">
                <div className="flex items-center justify-between pb-1.5 border-b border-emerald-500/20 mb-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Booking Confirmed</span>
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                    #{latestBooking.appointment_id}
                  </span>
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Doctor:</span>
                    <span className="font-medium text-white">{latestBooking.doctor_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Time:</span>
                    <span className="font-medium text-emerald-300">{latestBooking.date} • {latestBooking.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-300">{latestBooking.patient_phone}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Cancellation Confirmation Card inside Phone */}
            {latestCancellation && (
              <div className="bg-gradient-to-br from-rose-950/80 to-slate-900 border border-rose-500/40 rounded-2xl p-3 my-2 text-slate-200 shadow-xl animate-fade-in">
                <div className="flex items-center justify-between pb-1.5 border-b border-rose-500/20 mb-2">
                  <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Appointment Cancelled</span>
                  </div>
                  <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded">
                    Cancelled
                  </span>
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Doctor:</span>
                    <span className="font-medium text-white">{latestCancellation.doctor_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Time:</span>
                    <span className="font-medium text-rose-300">{latestCancellation.date} • {latestCancellation.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-300">{latestCancellation.patient_phone}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>

          {/* Quick Confirmation Action Bar */}
          {isAwaitingConfirmation && (
            <div className="px-3 py-2 bg-emerald-950/90 border-t border-emerald-500/50 flex items-center justify-between gap-2 shadow-lg animate-fade-in">
              <span className="text-[11px] text-emerald-300 font-medium">Verify your phone:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleSendPrompt("Yes, that is my number")}
                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow transition active:scale-95"
                >
                  ✅ Yes, That's My Number
                </button>
                <button
                  onClick={() => handleSendPrompt("No")}
                  className="px-2 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Prompt Suggestions Pills */}
          <div className="px-3 py-1.5 bg-slate-950/60 border-t border-slate-800/80 overflow-x-auto no-scrollbar flex items-center gap-1.5">
            {promptSuggestions.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendPrompt(prompt)}
                disabled={callStatus !== 'connected'}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] bg-slate-800/90 hover:bg-emerald-600/30 hover:border-emerald-500/40 text-slate-300 hover:text-white rounded-full border border-slate-700/60 transition-all disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Text Message Input Bar for Quick Testing */}
          <div className="px-3 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt(inputText)}
              placeholder="Speak or type to Nexa..."
              disabled={callStatus !== 'connected'}
              className="flex-1 bg-slate-900 border border-slate-700/70 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 disabled:opacity-50 placeholder:text-slate-500"
            />
            <button
              onClick={() => handleSendPrompt(inputText)}
              disabled={!inputText.trim() || callStatus !== 'connected'}
              className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Phone Call Controls (Mute, Speaker, End Call) */}
          <div className="px-6 py-4 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-around z-20">
            {/* Mute Toggle */}
            <button
              onClick={onToggleMute}
              className={`p-3.5 rounded-full transition-all ${
                isMuted
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
              title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* End Call Button (Big Red Circular Button) */}
            <button
              onClick={() => {
                onEndCall();
                setTimeout(onClose, 800);
              }}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 active:scale-95 transition-all"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>

            {/* Speaker Toggle */}
            <button
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className={`p-3.5 rounded-full transition-all ${
                isSpeakerOn
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700'
              }`}
              title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
            >
              {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          </div>

          {/* Bottom Home Indicator Bar */}
          <div className="w-full flex justify-center pb-2 pt-1">
            <div className="w-32 h-1 bg-slate-700 rounded-full"></div>
          </div>

        </div>
      </div>
    </div>
  );
};
