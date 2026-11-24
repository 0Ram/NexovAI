import { useState, useRef, useEffect, useCallback } from 'react';
import { TranscriptMessage, CallStatus, BookingEventData } from '../types';
import { phoneSounds } from '../utils/audioEffects';

interface UseVoiceCallProps {
  onAppointmentUpdated?: (data: { action: 'booked' | 'cancelled'; data: BookingEventData }) => void;
}

export function useVoiceCall({ onAppointmentUpdated }: UseVoiceCallProps = {}) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [latestBooking, setLatestBooking] = useState<BookingEventData | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Play audio chunk received from backend (16-bit PCM 16kHz mono)
  const playPCMChunk = useCallback((pcmData: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: 16000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const int16Array = new Int16Array(pcmData);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32Array.length, 16000);
      buffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      // Connect to analyser so agent voice also shows on waveform
      if (analyserRef.current) {
        source.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + buffer.duration;
    } catch (e) {
      console.error('Error playing audio chunk:', e);
    }
  }, []);

  // Convert float32 audio frame to 16-bit PCM
  const floatTo16BitPCM = (input: Float32Array): ArrayBuffer => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output.buffer;
  };

  // Start Voice Call
  const startCall = useCallback(async () => {
    if (callStatus !== 'idle' && callStatus !== 'ended') return;

    setCallStatus('calling');
    setCallDuration(0);
    setTranscripts([]);
    setLatestBooking(null);
    phoneSounds.startRinging();

    // 1. Initialize Web Audio Context and Analyser
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;
    nextPlayTimeRef.current = audioCtx.currentTime;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    analyserRef.current = analyser;

    // 2. Capture Microphone
    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(analyser);

      // ScriptProcessor for streaming mic audio
      const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      micSource.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      scriptProcessor.onaudioprocess = (e) => {
        if (isMuted || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBuffer = floatTo16BitPCM(inputData);
        socketRef.current.send(pcmBuffer);
      };
    } catch (err) {
      console.warn('Microphone permission not granted or unavailable. Text/Simulated voice mode active:', err);
    }

    // 3. Establish WebSocket connection with Backend
    const wsUrl = `ws://${window.location.hostname}:8000/ws/call`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      // Simulate ringing time then connect
      setTimeout(() => {
        phoneSounds.playConnectedChime();
        setCallStatus('connected');
        // Start duration timer
        timerIntervalRef.current = window.setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }, 1500);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary audio chunk from TTS
        playPCMChunk(event.data);
      } else if (typeof event.data === 'string') {
        try {
          const msg = jsonParseSafe(event.data);
          if (!msg) return;

          if (msg.type === 'transcript') {
            const newMsg: TranscriptMessage = {
              id: `${Date.now()}-${Math.random()}`,
              speaker: msg.speaker,
              text: msg.text,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              is_final: msg.is_final ?? true,
            };
            setTranscripts((prev) => {
              // If last was interim from caller, replace it
              if (prev.length > 0 && prev[prev.length - 1].speaker === 'caller' && !prev[prev.length - 1].is_final && msg.speaker === 'caller') {
                return [...prev.slice(0, -1), newMsg];
              }
              return [...prev, newMsg];
            });

            // If agent speaks in browser without mic/TTS, synthesize with Web Speech API
            if (msg.speaker === 'agent' && 'speechSynthesis' in window && !event.data.includes('binary')) {
              try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(msg.text);
                utterance.rate = 1.0;
                utterance.pitch = 1.05;
                window.speechSynthesis.speak(utterance);
              } catch {
                // speech synthesis fallback
              }
            }
          } else if (msg.type === 'appointment_updated') {
            if (msg.action === 'booked' && msg.data) {
              setLatestBooking(msg.data);
            }
            if (onAppointmentUpdated) {
              onAppointmentUpdated({ action: msg.action, data: msg.data });
            }
          }
        } catch (e) {
          console.error('Error handling websocket text frame:', e);
        }
      }
    };

    ws.onclose = () => {
      endCall();
    };

    ws.onerror = (e) => {
      console.error('WebSocket encountered error:', e);
    };
  }, [callStatus, isMuted, playPCMChunk, onAppointmentUpdated]);

  // End Call
  const endCall = useCallback(() => {
    phoneSounds.playEndCallTone();
    setCallStatus('ended');

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'end_call' }));
      }
      socketRef.current.close();
      socketRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Send text message (for fast testing or voice transcript injection)
  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'text_message',
        text: text.trim(),
      }));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      phoneSounds.stopRinging();
    };
  }, []);

  return {
    callStatus,
    callDuration,
    isMuted,
    transcripts,
    latestBooking,
    analyserNode: analyserRef.current,
    startCall,
    endCall,
    toggleMute,
    sendTextMessage,
  };
}

function jsonParseSafe(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
