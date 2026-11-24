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
  const callStatusRef = useRef<CallStatus>('idle');
  const speechRecognitionRef = useRef<any>(null);
  const isAgentSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

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

  const floatTo16BitPCM = (input: Float32Array): ArrayBuffer => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output.buffer;
  };

  // Send text message over websocket
  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'text_message',
        text: text.trim(),
      }));
    }
  }, []);

  // End Call
  const endCall = useCallback(() => {
    phoneSounds.playEndCallTone();
    setCallStatus('ended');
    callStatusRef.current = 'ended';

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

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

  // Start Voice Call
  const startCall = useCallback(async () => {
    if (callStatusRef.current !== 'idle' && callStatusRef.current !== 'ended') return;

    setCallStatus('calling');
    callStatusRef.current = 'calling';
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
      console.warn('Microphone permission not granted or unavailable:', err);
    }

    // 3. Connect WebSocket
    const wsUrl = `ws://${window.location.hostname}:8000/ws/call`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      setTimeout(() => {
        phoneSounds.playConnectedChime();
        setCallStatus('connected');
        callStatusRef.current = 'connected';

        // Start duration timer
        timerIntervalRef.current = window.setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);

        // 4. Initialize Real-Time Browser Speech Recognition (Voice Input)
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (e: any) => {
              const lastIdx = e.results.length - 1;
              const spoken = e.results[lastIdx][0]?.transcript?.trim();
              if (!spoken) return;

              // Check if agent is speaking
              if (isAgentSpeakingRef.current) {
                const lower = spoken.toLowerCase();
                // Allow confirmation / short answers through even during speech
                const isQuickAnswer = /^(yes|yeah|yep|yup|correct|right|sure|no|nope|ok|okay|\d+|cancel|proceed)/.test(lower);
                if (!isQuickAnswer) {
                  return; // ignore potential speaker echo
                }
              }

              console.log('User spoken voice captured:', spoken);
              sendTextMessage(spoken);
            };

            recognition.onerror = (e: any) => {
              console.warn('Speech recognition warning:', e.error);
            };

            recognition.onend = () => {
              // Automatically keep listening while call is connected with debounce to avoid InvalidStateError
              if (callStatusRef.current === 'connected') {
                setTimeout(() => {
                  try {
                    if (callStatusRef.current === 'connected') {
                      recognition.start();
                    }
                  } catch {}
                }, 300);
              }
            };

            recognition.start();
            speechRecognitionRef.current = recognition;
          } catch (err) {
            console.warn('Speech recognition start failed:', err);
          }
        }
      }, 1500);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
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
              if (prev.length > 0 && prev[prev.length - 1].speaker === 'caller' && !prev[prev.length - 1].is_final && msg.speaker === 'caller') {
                return [...prev.slice(0, -1), newMsg];
              }
              return [...prev, newMsg];
            });

            // Speak out loud agent responses using speech synthesis
            if (msg.speaker === 'agent' && 'speechSynthesis' in window) {
              try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(msg.text);
                utterance.rate = 1.0;
                utterance.pitch = 1.05;

                // Retain reference on window to prevent Chrome GC bug
                (window as any)._activeUtterance = utterance;
                isAgentSpeakingRef.current = true;

                utterance.onend = () => {
                  (window as any)._activeUtterance = null;
                  isAgentSpeakingRef.current = false;
                };
                utterance.onerror = () => {
                  (window as any)._activeUtterance = null;
                  isAgentSpeakingRef.current = false;
                };

                // Safety fallback timeout: clear agent speaking flag after 7s max
                setTimeout(() => {
                  isAgentSpeakingRef.current = false;
                }, 7000);

                window.speechSynthesis.speak(utterance);
              } catch {}
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
          console.error('Error handling websocket frame:', e);
        }
      }
    };

    ws.onclose = () => {
      endCall();
    };

    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
    };
  }, [isMuted, playPCMChunk, onAppointmentUpdated, sendTextMessage, endCall]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      phoneSounds.stopRinging();
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
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
