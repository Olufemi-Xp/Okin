"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, PhoneOff, X, ArrowUp } from "lucide-react";
import { sendVoiceMessage, base64ToBlobUrl } from "@/lib/api";
import { PeacockLogo } from "./PeacockLogo";

interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeThreadId: string | null;
  onNewMessage: (userText: string, assistantReply: string, audioUrl?: string) => void;
  onColdStart?: (isWaking: boolean) => void;
}

type VoiceState = "listening" | "thinking" | "speaking" | "muted";

// Dynamically detects the browser's supported MediaRecorder MIME type & file extension
function detectSupportedCodec(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "", extension: "webm" };
  }
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
    { mimeType: "audio/ogg", extension: "ogg" },
    { mimeType: "audio/wav", extension: "wav" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "", extension: "webm" };
}

export const VoiceModeModal: React.FC<VoiceModeModalProps> = ({
  isOpen,
  onClose,
  activeThreadId,
  onNewMessage,
  onColdStart,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>("listening");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [lastAssistantReply, setLastAssistantReply] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeakingDetected, setIsSpeakingDetected] = useState(false);

  // References
  const stateRef = useRef<VoiceState>("listening");
  const isMutedRef = useRef(false);
  const isEchoMutedRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const cancelRecorderRef = useRef<(() => void) | null>(null);
  const stopAndCollectRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);
  const liveTextRef = useRef<string>("");

  // VAD tracking & Minimum Audio Gate
  const hasSpokenRef = useRef(false);
  const speechStartRef = useRef<number | null>(null);
  const peakVolumeRef = useRef<number>(0);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingTurnRef = useRef(false);

  useEffect(() => {
    stateRef.current = voiceState;
  }, [voiceState]);

  // Clean stop all audio, recognition and stream resources
  const cleanupAll = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (cancelRecorderRef.current) {
      cancelRecorderRef.current();
      cancelRecorderRef.current = null;
    }
    stopAndCollectRef.current = null;
    activeRecorderRef.current = null;

    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
      } catch (e) {}
      currentAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    hasSpokenRef.current = false;
    speechStartRef.current = null;
    peakVolumeRef.current = 0;
    isEchoMutedRef.current = false;
    isProcessingTurnRef.current = false;
    liveTextRef.current = "";
    setIsSpeakingDetected(false);
  }, []);

  // Web Speech synthesis fallback
  const fallbackSpeech = useCallback((text: string, onEnd: () => void) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const cleanText = text.replace(/[*_#`[\]()]/g, "").trim();
        if (!cleanText) {
          onEnd();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        currentUtteranceRef.current = utterance;
        utterance.lang = "en-US";
        utterance.rate = 1.0;
        utterance.volume = 1.0;

        let finished = false;
        const safeFinish = () => {
          if (!finished) {
            finished = true;
            onEnd();
          }
        };

        utterance.onend = safeFinish;
        utterance.onerror = safeFinish;

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        setTimeout(onEnd, 1500);
      }
    } else {
      setTimeout(onEnd, 1500);
    }
  }, []);

  // Start fresh recording session for user's next spoken turn
  const startNewSpeechRecording = useCallback(() => {
    if (!mediaStreamRef.current || isEchoMutedRef.current || isMutedRef.current) return;
    try {
      // Cancel previous recorder cleanly without mixing chunks
      if (cancelRecorderRef.current) {
        cancelRecorderRef.current();
        cancelRecorderRef.current = null;
      }

      hasSpokenRef.current = false;
      speechStartRef.current = null;
      peakVolumeRef.current = 0;
      isProcessingTurnRef.current = false;
      liveTextRef.current = "";
      setIsSpeakingDetected(false);

      // Start Web Speech live subtitle recognition if supported
      if (typeof window !== "undefined" && !recognitionRef.current) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            const recognizer = new SpeechRecognition();
            recognizer.continuous = true;
            recognizer.interimResults = true;
            recognizer.lang = "en-US";

            recognizer.onresult = (evt: any) => {
              if (isEchoMutedRef.current || stateRef.current !== "listening") return;
              let interim = "";
              for (let i = evt.resultIndex; i < evt.results.length; ++i) {
                const transcriptPiece = evt.results[i][0].transcript;
                if (evt.results[i].isFinal) {
                  liveTextRef.current = (liveTextRef.current + " " + transcriptPiece).trim();
                } else {
                  interim += transcriptPiece;
                }
              }
              const combined = (liveTextRef.current + " " + interim).trim();
              if (combined) {
                setLiveTranscript(combined);
                hasSpokenRef.current = true;
                setIsSpeakingDetected(true);
                if (!speechStartRef.current) {
                  speechStartRef.current = Date.now();
                }
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
              }
            };

            recognizer.onerror = () => {};
            recognizer.start();
            recognitionRef.current = recognizer;
          } catch (e) {}
        }
      }

      const codec = detectSupportedCodec();
      const options: MediaRecorderOptions = {};
      if (codec.mimeType) {
        options.mimeType = codec.mimeType;
      }

      const recorder = options.mimeType
        ? new MediaRecorder(mediaStreamRef.current, options)
        : new MediaRecorder(mediaStreamRef.current);
      activeRecorderRef.current = recorder;

      const localChunks: Blob[] = [];
      let isCancelled = false;

      recorder.ondataavailable = (event) => {
        if (!isCancelled && event.data && event.data.size > 0) {
          localChunks.push(event.data);
        }
      };

      cancelRecorderRef.current = () => {
        isCancelled = true;
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch (e) {}
        }
      };

      stopAndCollectRef.current = () =>
        new Promise<Blob | null>((resolve) => {
          const finalMime = recorder.mimeType || codec.mimeType || "audio/webm";
          if (isCancelled) {
            resolve(null);
            return;
          }
          if (recorder.state === "inactive") {
            resolve(localChunks.length ? new Blob(localChunks, { type: finalMime }) : null);
            return;
          }
          recorder.onstop = () => {
            if (isCancelled) {
              resolve(null);
              return;
            }
            resolve(new Blob(localChunks, { type: finalMime }));
          };
          try {
            recorder.stop();
          } catch (e) {
            resolve(null);
          }
        });

      // Record full standalone stream
      recorder.start();
    } catch (e) {
      console.warn("Failed to start speech recording:", e);
    }
  }, []);

  // Play assistant voice reply with echo suppression
  const playAssistantSpeech = useCallback(
    (text: string, audioBase64?: string) => {
      setVoiceState("speaking");
      setIsSpeakingDetected(false);
      isEchoMutedRef.current = true;

      // Cancel recorder during assistant speech so Suzzy does not hear herself
      if (cancelRecorderRef.current) {
        cancelRecorderRef.current();
        cancelRecorderRef.current = null;
      }
      activeRecorderRef.current = null;
      stopAndCollectRef.current = null;

      const resumeListeningAfterSpeech = () => {
        // Automatically resume listening 300ms after playback ends to let room echo dissipate
        setTimeout(() => {
          if (stateRef.current === "speaking" && !isMutedRef.current) {
            isEchoMutedRef.current = false;
            setVoiceState("listening");
            setLiveTranscript("");
            liveTextRef.current = "";
            startNewSpeechRecording();
          } else if (stateRef.current === "speaking") {
            setVoiceState("muted");
          }
        }, 300);
      };

      // 1. Play high-quality Edge-TTS audio via Blob URL
      if (audioBase64 && audioBase64.length > 100) {
        try {
          const blobUrl = base64ToBlobUrl(audioBase64, "audio/mp3");
          const audio = new Audio(blobUrl);
          audio.volume = 1.0;
          currentAudioRef.current = audio;

          audio.onended = () => {
            if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
            resumeListeningAfterSpeech();
          };

          audio.onerror = (e) => {
            console.warn("Audio playback error, falling back to Web Speech:", e);
            if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
            fallbackSpeech(text, resumeListeningAfterSpeech);
          };

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn("Autoplay block or playback error:", err);
              fallbackSpeech(text, resumeListeningAfterSpeech);
            });
          }
          return;
        } catch (e) {
          console.warn("Blob audio playback exception:", e);
        }
      }

      // 2. Speech synthesis fallback
      fallbackSpeech(text, resumeListeningAfterSpeech);
    },
    [fallbackSpeech, startNewSpeechRecording]
  );

  // Process the recorded turn blob
  const handleTurnComplete = useCallback(async () => {
    if (isProcessingTurnRef.current) return;
    isProcessingTurnRef.current = true;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    const stopAndCollect = stopAndCollectRef.current;
    stopAndCollectRef.current = null;
    cancelRecorderRef.current = null;

    const blob = stopAndCollect ? await stopAndCollect() : null;
    const browserTranscript = liveTextRef.current.trim();
    const peakVol = peakVolumeRef.current;

    // Minimum Audio Gate:
    // Never send audio blobs smaller than 3KB or recordings where volume never crossed the speech threshold.
    // In that case, smoothly reset to listening without calling the backend.
    const isBlobValid = Boolean(blob && blob.size >= 3000);
    const isVolumeValid = peakVol >= 10;
    const hasBrowserText = browserTranscript.length >= 2;

    if ((!isBlobValid && !hasBrowserText) || (!isVolumeValid && !hasBrowserText)) {
      console.log("Audio dropped by minimum gate: size =", blob?.size, "peakVolume =", peakVol);
      isProcessingTurnRef.current = false;
      setVoiceState("listening");
      startNewSpeechRecording();
      return;
    }

    setVoiceState("thinking");
    setIsSpeakingDetected(false);

    try {
      setLiveTranscript(browserTranscript ? `"${browserTranscript}"` : "Thinking...");
      const audioPayload = blob || new Blob([], { type: "audio/webm" });

      const res = await sendVoiceMessage(
        audioPayload,
        activeThreadId || undefined,
        onColdStart,
        browserTranscript || undefined
      );

      // If backend detected silence or hallucination, it returns status: "no_speech"
      if (res.status === "no_speech" || !res.response) {
        console.log("Server detected no speech/silence. Seamlessly resuming listening.");
        isProcessingTurnRef.current = false;
        setVoiceState("listening");
        startNewSpeechRecording();
        return;
      }

      if (res.response) {
        const finalTranscript = res.transcript || browserTranscript || "";
        setLiveTranscript(finalTranscript);
        setLastAssistantReply(res.response);

        if (finalTranscript && finalTranscript.trim()) {
          onNewMessage(finalTranscript, res.response, res.audio_base64 || undefined);
        }

        // Speak back response aloud with Edge-TTS and prevent self-listening
        playAssistantSpeech(res.response, res.audio_base64 || undefined);
        return;
      }
    } catch (err: any) {
      console.error("Voice processing error:", err);
      setLiveTranscript("Could not reach Okin. Please try again.");
    }

    // Fallback reset
    isProcessingTurnRef.current = false;
    setVoiceState("listening");
    startNewSpeechRecording();
  }, [activeThreadId, onColdStart, onNewMessage, playAssistantSpeech, startNewSpeechRecording]);

  // Initialize Audio hardware and VAD
  const initAudio = useCallback(async () => {
    try {
      // 1. Microphone access with explicit voice processing constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Web Audio API with AnalyserNode for real-time RMS monitoring
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.25;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start initial speech recording session
      startNewSpeechRecording();

      // Real-time RMS VAD Loop
      const timeDomainData = new Uint8Array(analyser.fftSize);
      let ambientNoise = 3;
      let sampleFrames = 0;

      const checkVAD = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(timeDomainData);

        // Compute true RMS volume amplitude
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const norm = (timeDomainData[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        const volumeLevel = Math.min(100, Math.round(rms * 160));
        setAudioLevel(volumeLevel);

        // Calibrate ambient noise floor
        if (sampleFrames < 50) {
          ambientNoise = Math.max(2, (ambientNoise * sampleFrames + volumeLevel) / (sampleFrames + 1));
          sampleFrames++;
        }

        const speechThreshold = Math.max(10, Math.round(ambientNoise + 7));

        // VAD evaluation: active only during listening mode and when not echo-muted
        if (
          stateRef.current === "listening" &&
          !isMutedRef.current &&
          !isEchoMutedRef.current &&
          !isProcessingTurnRef.current
        ) {
          if (volumeLevel > speechThreshold) {
            // Speech actively detected
            if (!speechStartRef.current) {
              speechStartRef.current = Date.now();
            }
            hasSpokenRef.current = true;
            peakVolumeRef.current = Math.max(peakVolumeRef.current, volumeLevel);
            setIsSpeakingDetected(true);

            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (hasSpokenRef.current) {
            // User has spoken and paused: wait 1.5s of silence before auto-submitting turn
            const spokenDuration = speechStartRef.current ? Date.now() - speechStartRef.current : 0;
            if (spokenDuration > 400 && !silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                handleTurnComplete();
              }, 1500); // 1.5 seconds silence gate
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(checkVAD);
      };

      checkVAD();
    } catch (err: any) {
      console.error("Microphone access failed:", err);
      setLiveTranscript("Microphone permission denied. Please allow microphone access in your browser.");
    }
  }, [handleTurnComplete, startNewSpeechRecording]);

  // Lifecycle on modal open/close
  useEffect(() => {
    if (isOpen) {
      isMutedRef.current = false;
      isEchoMutedRef.current = false;
      setVoiceState("listening");
      setLiveTranscript("");
      setLastAssistantReply("");
      initAudio();
    } else {
      cleanupAll();
    }

    return () => {
      cleanupAll();
    };
  }, [isOpen, initAudio, cleanupAll]);

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    if (nextMuted) {
      setVoiceState("muted");
      setIsSpeakingDetected(false);
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    } else {
      setVoiceState("listening");
      startNewSpeechRecording();
    }
  };

  // Tap Circle to send immediately or interrupt Suzzy
  const handleCircleClick = () => {
    if (voiceState === "speaking") {
      // Interrupt Suzzy while speaking
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        } catch (e) {}
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
      isEchoMutedRef.current = false;
      setVoiceState("listening");
      setLiveTranscript("");
      startNewSpeechRecording();
    } else if (voiceState === "listening") {
      // User tapped circle while listening: trigger turn immediately
      handleTurnComplete();
    }
  };

  if (!isOpen) return null;

  // Dynamic scale driven directly by live microphone volume
  const dynamicScale = Math.min(1.4, 1 + (audioLevel / 100) * 0.65);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#07080b]/95 backdrop-blur-2xl text-slate-100 select-none animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="w-full max-w-3xl px-6 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <PeacockLogo className="w-[22px] h-[22px] shrink-0" />
          <span className="font-medium text-sm text-slate-200 tracking-tight">Okin Live Voice</span>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Exit voice mode"
          aria-label="Exit voice mode"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Center Voice Circle Area */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-lg px-6 text-center my-auto">
        {/* Animated Reactive Suzzy Orb */}
        <div
          onClick={handleCircleClick}
          className={`relative flex items-center justify-center cursor-pointer transition-transform duration-100 ${
            voiceState === "speaking" ? "hover:opacity-90" : ""
          }`}
          style={{
            transform: voiceState === "listening" ? `scale(${dynamicScale})` : "scale(1)",
          }}
          title={
            voiceState === "speaking"
              ? "Tap to interrupt Okin"
              : hasSpokenRef.current
              ? "Tap to send immediately"
              : "Listening... Speak naturally"
          }
        >
          {/* Ambient Outer Glow Rings */}
          <div
            className={`absolute w-56 h-56 md:w-64 md:h-64 rounded-full transition-all duration-300 blur-2xl ${
              voiceState === "speaking"
                ? "bg-emerald-500/35 scale-125 animate-pulse"
                : voiceState === "thinking"
                ? "bg-cyan-500/30 scale-110 animate-spin"
                : voiceState === "listening"
                ? isSpeakingDetected || audioLevel > 10
                  ? "bg-emerald-500/35 scale-125"
                  : "bg-white/[0.08] scale-100"
                : "bg-transparent"
            }`}
          />

          {/* Secondary Ripple Ring */}
          <div
            className={`absolute w-44 h-44 md:w-52 md:h-52 rounded-full border transition-all duration-200 ${
              voiceState === "speaking"
                ? "border-emerald-400/50 scale-110 animate-ping"
                : voiceState === "thinking"
                ? "border-cyan-400/40 animate-pulse"
                : isSpeakingDetected || audioLevel > 10
                ? "border-emerald-400/50 scale-110"
                : "border-white/[0.08]"
            }`}
          />

          {/* Primary Fluid Circle Core */}
          <div
            className={`relative w-36 h-36 md:w-44 md:h-44 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 ${
              voiceState === "speaking"
                ? "bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-300 shadow-emerald-500/40 scale-105"
                : voiceState === "thinking"
                ? "bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-500 shadow-cyan-500/30 animate-pulse"
                : voiceState === "listening"
                ? isSpeakingDetected || audioLevel > 10
                  ? "bg-gradient-to-tr from-[#163325] to-[#234d38] border-2 border-emerald-400/80 shadow-emerald-950/70"
                  : "bg-gradient-to-tr from-[#1b1f28] to-[#2c3240] border border-white/[0.14] shadow-black/60"
                : "bg-[#14171d] border border-white/[0.06] opacity-60"
            }`}
          >
            {/* Center Visual Cue */}
            {voiceState === "speaking" ? (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-6 bg-white rounded-full animate-bounce" />
                <span className="w-1.5 h-10 bg-white rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-7 bg-white rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            ) : voiceState === "thinking" ? (
              <div className="w-6 h-6 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
            ) : voiceState === "muted" ? (
              <MicOff className="w-7 h-7 text-slate-500" />
            ) : (
              <div
                className={`rounded-full transition-all duration-100 ${
                  isSpeakingDetected || audioLevel > 10
                    ? "w-5 h-5 bg-emerald-400 animate-ping"
                    : "w-3 h-3 bg-white/70 animate-pulse"
                }`}
              />
            )}
          </div>
        </div>

        {/* Status Indicator */}
        <div className="mt-8 flex flex-col items-center">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            {voiceState === "listening" && (
              <>
                <span
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isSpeakingDetected ? "bg-emerald-400 animate-ping" : "bg-emerald-400 animate-pulse"
                  }`}
                />
                <span>
                  {isSpeakingDetected
                    ? "Hearing you speak..."
                    : hasSpokenRef.current
                    ? "Listening (pause to send)..."
                    : "Listening... Speak naturally"}
                </span>
              </>
            )}
            {voiceState === "thinking" && (
              <>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Okin is thinking...</span>
              </>
            )}
            {voiceState === "speaking" && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Speaking... (Tap circle to interrupt)</span>
              </>
            )}
            {voiceState === "muted" && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Microphone Muted</span>
              </>
            )}
          </div>

          {/* Tap to send pill button when speaking */}
          {voiceState === "listening" && hasSpokenRef.current && (
            <button
              onClick={handleCircleClick}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all cursor-pointer animate-in fade-in"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Tap to send now</span>
            </button>
          )}

          {/* Live Subtitle Transcript */}
          <div className="mt-4 min-h-[48px] max-w-md text-center">
            {liveTranscript ? (
              <p className="text-sm text-slate-200 leading-relaxed font-normal bg-white/[0.04] px-4 py-2 rounded-xl border border-white/[0.06]">
                &ldquo;{liveTranscript}&rdquo;
              </p>
            ) : lastAssistantReply ? (
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                {lastAssistantReply}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Speak anytime. Okin replies aloud when you pause, or tap the circle when done speaking.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Controls Dock */}
      <div className="w-full max-w-md px-6 py-8 flex items-center justify-center gap-6">
        {/* Mute Button */}
        <button
          onClick={handleToggleMute}
          className={`p-3.5 rounded-full transition-all border cursor-pointer ${
            voiceState === "muted"
              ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
              : "bg-white/[0.06] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.1]"
          }`}
          title={voiceState === "muted" ? "Unmute microphone" : "Mute microphone"}
          aria-label={voiceState === "muted" ? "Unmute microphone" : "Mute microphone"}
        >
          {voiceState === "muted" ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        {/* End Voice Conversation Button */}
        <button
          onClick={onClose}
          className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all hover:scale-105 cursor-pointer"
          title="End conversation"
          aria-label="End conversation"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
