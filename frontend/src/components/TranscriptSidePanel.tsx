import React, { useRef, useEffect } from 'react';
import { TranscriptMessage, CallStatus } from '../types';
import { MessageSquare, Sparkles, Volume2 } from 'lucide-react';

interface TranscriptSidePanelProps {
  transcripts: TranscriptMessage[];
  callStatus: CallStatus;
}

export const TranscriptSidePanel: React.FC<TranscriptSidePanelProps> = ({
  transcripts,
  callStatus,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Live Conversation Transcript</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          {callStatus === 'connected' ? (
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Live Call
            </span>
          ) : callStatus === 'calling' ? (
            <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              Connecting...
            </span>
          ) : (
            <span className="text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-full">
              Standby
            </span>
          )}
        </div>
      </div>

      {/* Transcript stream */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 text-xs">
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 px-4">
            <Sparkles className="w-7 h-7 text-slate-600 mb-2" />
            <p className="font-medium text-slate-400">Waiting for call stream</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Start a call to see live voice transcription and function tool calls here.
            </p>
          </div>
        ) : (
          transcripts.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-xl border text-xs leading-relaxed transition ${
                t.speaker === 'caller'
                  ? 'bg-slate-800/70 border-slate-700/80 text-slate-200'
                  : 'bg-emerald-950/30 border-emerald-500/20 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1 text-[10px]">
                <span className={`font-semibold flex items-center gap-1 ${
                  t.speaker === 'caller' ? 'text-slate-400' : 'text-emerald-400'
                }`}>
                  {t.speaker === 'agent' && <Volume2 className="w-3 h-3" />}
                  {t.speaker === 'caller' ? 'Caller' : 'Nexa (Agent)'}
                </span>
                <span className="font-mono text-slate-500">{t.timestamp}</span>
              </div>
              <p>{t.text}</p>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>

    </div>
  );
};
