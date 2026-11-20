"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  ArrowUp,
  Plus,
  Mic,
  Square,
  X,
  FileText,
  Image as ImageIcon,
  Camera,
  Film,
  AlertCircle,
  AudioLines,
  Loader2,
} from "lucide-react";
import { transcribeAudio } from "@/lib/api";
import {
  getWordSuggestions,
  getActiveWordAtCaret,
  SuggestionItem,
} from "@/lib/wordSuggestions";
import { WordSuggestionPopup } from "./WordSuggestionPopup";

export interface ImageGenOptions {
  isVisualMode: boolean;
  style: string;
  aspectRatio: string;
  enhancePrompt: boolean;
}

interface InputDockProps {
  onSendMessage: (
    message: string,
    file?: File,
    isVoice?: boolean,
    imageGenOptions?: ImageGenOptions
  ) => void;
  onSendVoice?: (audioBlob: Blob) => void;
  onStartLiveVoice?: () => void;
  disabled?: boolean;
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
}

export const InputDock: React.FC<InputDockProps> = ({
  onSendMessage,
  onSendVoice,
  onStartLiveVoice,
  disabled = false,
  isSpeaking = false,
  onStopSpeaking,
}) => {
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isVoiceSpoken, setIsVoiceSpoken] = useState(false);

  // AI Image / Visual Mode states
  const [isVisualMode, setIsVisualMode] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [visualStyle, setVisualStyle] = useState<string>("photorealistic");
  const [enhancePrompt, setEnhancePrompt] = useState(true);

  // Audio recording state & Visualizer
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const shouldAutoSendRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const baseTextRef = useRef<string>("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const suggestionContainerRef = useRef<HTMLDivElement>(null);

  // Smart Word Prediction & Typo Suggestions
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [activeWordInfo, setActiveWordInfo] = useState<{
    word: string;
    start: number;
    end: number;
  } | null>(null);
  const dismissedWordRef = useRef<string | null>(null);

  // File input refs
  const docInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [inputText]);

  // Close upload menu on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Dismiss suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionContainerRef.current &&
        !suggestionContainerRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
      }
    };
    if (suggestions.length > 0) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [suggestions.length]);

  // Thumbnail preview for images
  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    const maxSize = 25 * 1024 * 1024; // 25 MB
    if (file.size > maxSize) {
      setFileError("File exceeds the 25MB maximum upload limit.");
      return;
    }

    setSelectedFile(file);
    setMenuOpen(false);
    e.target.value = "";
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileError(null);
  };

  // Submit chat message (or stop & direct-send if recording)
  const handleSend = () => {
    if (disabled || isTranscribing) return;

    if (isRecording) {
      // Direct send while recording: immediately finalize recording, transcribe, and auto-submit
      shouldAutoSendRef.current = true;
      setIsTranscribing(true);
      stopRecording();
      return;
    }

    const trimmed = inputText.trim();
    if (!trimmed && !selectedFile) return;

    let finalMessage = trimmed;
    const isSlashImagine = trimmed.startsWith("/imagine") || trimmed.startsWith("/draw") || trimmed.startsWith("/image");
    const activeVisual = isVisualMode || isSlashImagine;

    if (activeVisual && !isSlashImagine) {
      finalMessage = `/imagine ${trimmed}`;
    }

    onSendMessage(
      finalMessage,
      selectedFile || undefined,
      isVoiceSpoken,
      activeVisual
        ? {
            isVisualMode: true,
            style: visualStyle,
            aspectRatio: aspectRatio,
            enhancePrompt: enhancePrompt,
          }
        : undefined
    );

    setInputText("");
    setSuggestions([]);
    setActiveWordInfo(null);
    setSelectedSuggestionIndex(0);
    dismissedWordRef.current = null;
    setIsVoiceSpoken(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Update word suggestions based on text and caret position
  const updateWordSuggestions = (text: string, caretPos: number) => {
    if (isRecording || isTranscribing) {
      setSuggestions([]);
      setActiveWordInfo(null);
      return;
    }

    const info = getActiveWordAtCaret(text, caretPos);
    if (!info) {
      setSuggestions([]);
      setActiveWordInfo(null);
      dismissedWordRef.current = null;
      return;
    }

    // Don't re-show if user deliberately dismissed suggestions on this exact word
    if (dismissedWordRef.current === info.word) {
      return;
    }

    const results = getWordSuggestions(info.word, 4);
    setSuggestions(results);
    setActiveWordInfo(info);
    setSelectedSuggestionIndex(0);
  };

  const handleAcceptSuggestion = (item: SuggestionItem) => {
    if (!activeWordInfo) return;
    const before = inputText.slice(0, activeWordInfo.start);
    const after = inputText.slice(activeWordInfo.end);
    const newText = before + item.word + " " + after;
    setInputText(newText);
    setSuggestions([]);
    setActiveWordInfo(null);
    setSelectedSuggestionIndex(0);
    dismissedWordRef.current = null;

    // Reposition cursor immediately after the inserted word and space
    const newCaretPos = activeWordInfo.start + item.word.length + 1;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCaretPos, newCaretPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSpeaking && onStopSpeaking) {
      onStopSpeaking();
    }

    // Keyboard navigation and acceptance for word suggestions
    if (suggestions.length > 0 && activeWordInfo) {
      if (e.key === "Tab") {
        e.preventDefault();
        const itemToApply = suggestions[selectedSuggestionIndex] || suggestions[0];
        handleAcceptSuggestion(itemToApply);
        return;
      }

      if (e.key === "ArrowRight") {
        const caret = textareaRef.current?.selectionStart;
        if (caret === activeWordInfo.end) {
          e.preventDefault();
          const itemToApply = suggestions[selectedSuggestionIndex] || suggestions[0];
          handleAcceptSuggestion(itemToApply);
          return;
        }
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        dismissedWordRef.current = activeWordInfo.word;
        setSuggestions([]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setSuggestions([]);
      setActiveWordInfo(null);
      handleSend();
    }
  };

  // Stop audio visualizer & audio context
  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  // Microphone recording & dictation into chat box
  const startRecording = async () => {
    // If Suzzy is currently speaking, stop playback immediately!
    if (onStopSpeaking) {
      onStopSpeaking();
    }
    setFileError(null);
    setSuggestions([]);
    setActiveWordInfo(null);
    setIsTranscribing(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    baseTextRef.current = inputText;

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Microphone API not supported in this browser context.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Live volume analyser for instant visual feedback
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.3;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round(avg * 1.6)));
          animFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.warn("Audio analyser initialization error:", e);
      }

      const options: MediaRecorderOptions = {};
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          options.mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          options.mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options.mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          options.mimeType = "audio/ogg";
        }
      }

      const recorder = options.mimeType ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopAudioAnalyser();

        const mime = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        audioChunksRef.current = [];

        // Stop all audio hardware tracks
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        const isDirectSend = shouldAutoSendRef.current;
        shouldAutoSendRef.current = false;

        if (audioBlob.size > 500) {
          try {
            setIsTranscribing(true);
            const transcript = await transcribeAudio(audioBlob);
            if (transcript && transcript.trim()) {
              const fullSpeechText = transcript.trim();
              if (isDirectSend) {
                // Direct Send: combine with any pre-existing text/attachment and submit immediately!
                const existing = baseTextRef.current.trim();
                const combined = existing ? `${existing} ${fullSpeechText}` : fullSpeechText;

                onSendMessage(
                  combined,
                  selectedFile || undefined,
                  true, // isVoice = true
                  undefined
                );

                setInputText("");
                setIsVoiceSpoken(false);
                setSelectedFile(null);
                setPreviewUrl(null);
                setFileError(null);
                if (textareaRef.current) {
                  textareaRef.current.style.height = "auto";
                }
              } else {
                setInputText((prev) => {
                  const trimmedPrev = prev.trim();
                  return trimmedPrev ? `${trimmedPrev} ${fullSpeechText}` : fullSpeechText;
                });
                setIsVoiceSpoken(true);
              }
            } else {
              setFileError("No words detected. Please speak closer to your microphone and try again.");
            }
          } catch (err: any) {
            console.warn("Transcription error:", err);
            setFileError("Transcription failed. Please check microphone permissions and try again.");
          } finally {
            setIsTranscribing(false);
          }
        } else {
          setFileError("Recording was too short. Speak and click Send when done.");
          setIsTranscribing(false);
        }

        textareaRef.current?.focus();
      };

      // Start recording cleanly with no timeslice for complete WebM container integrity
      recorder.start();
      setIsRecording(true);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("Microphone access failed:", err);
      setIsRecording(false);
      stopAudioAnalyser();
      setFileError("Microphone access denied. Please click the permissions icon in your browser address bar to allow microphone access.");
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (e) {}
    } else {
      stopAudioAnalyser();
      setIsTranscribing(false);
      textareaRef.current?.focus();
    }
  };

  const cancelRecording = () => {
    shouldAutoSendRef.current = false;
    setIsRecording(false);
    setIsTranscribing(false);
    setRecordingSeconds(0);
    stopAudioAnalyser();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null; // discard
      try {
        recorder.stop();
      } catch (e) {}
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    audioChunksRef.current = [];
    setInputText(baseTextRef.current);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getFileBadge = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"].includes(ext || "")) {
      return { label: "IMAGE", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
    }
    if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext || "")) {
      return { label: "VIDEO", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" };
    }
    if (["pdf"].includes(ext || "")) {
      return { label: "PDF", color: "text-red-400 bg-red-500/10 border-red-500/20" };
    }
    if (["docx", "doc"].includes(ext || "")) {
      return { label: "DOCX", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" };
    }
    if (["py", "js", "ts", "json", "csv", "sql", "html"].includes(ext || "")) {
      return { label: "CODE", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    }
    return { label: "FILE", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
  };

  const canSend =
    !disabled &&
    !isTranscribing &&
    (isRecording || inputText.trim().length > 0 || selectedFile !== null);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={docInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.md,.markdown,.csv,.tsv,.json,.py,.js,.jsx,.ts,.tsx,.html,.css,.xml,.yaml,.yml,.sql,.sh,.bat"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/heic,image/*"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
        capture="environment"
      />
      <input
        type="file"
        ref={videoInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
      />

      {/* Error Toast */}
      {fileError && (
        <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{fileError}</span>
          </div>
          <button onClick={() => setFileError(null)} className="p-0.5 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Selected File Card */}
      {selectedFile && (
        <div className="mb-2 inline-flex items-center gap-3 p-1.5 pr-3 rounded-xl bg-slate-100 dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.1] text-xs text-slate-800 dark:text-slate-200 shadow-xs transition-colors duration-300">
          {previewUrl ? (
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-200 dark:bg-black/40 border border-slate-300 dark:border-white/[0.08] shrink-0">
              <img
                src={previewUrl}
                alt={selectedFile.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-slate-200/60 dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.08] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
          )}

          <div className="flex flex-col min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium truncate max-w-[220px]">
                {selectedFile.name}
              </span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded border font-mono uppercase ${
                  getFileBadge(selectedFile.name).color
                }`}
              >
                {getFileBadge(selectedFile.name).label}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>

          <button
            onClick={removeFile}
            className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            title="Remove attachment"
            aria-label="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Speaking Active Indicator with Instant Stop Button */}
      {isSpeaking && (
        <div className="mb-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-300 animate-in fade-in slide-in-from-bottom-1 duration-200 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-medium">Okin is speaking aloud...</span>
          </div>
          <button
            type="button"
            onClick={onStopSpeaking}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
            title="Stop Okin from speaking"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>Stop speaking</span>
          </button>
        </div>
      )}

      {/* Input Container Box */}
      <div className="relative flex flex-col bg-white dark:bg-[#13161c] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl shadow-xs dark:shadow-none focus-within:border-slate-400 dark:focus-within:border-white/[0.2] transition-colors duration-300">
        {/* Word Prediction & Typo Suggestions Popup */}
        {!menuOpen && !isRecording && !isTranscribing && suggestions.length > 0 && (
          <div ref={suggestionContainerRef}>
            <WordSuggestionPopup
              suggestions={suggestions}
              selectedIndex={selectedSuggestionIndex}
              onSelectIndex={setSelectedSuggestionIndex}
              onAccept={handleAcceptSuggestion}
              onDismiss={() => {
                if (activeWordInfo) {
                  dismissedWordRef.current = activeWordInfo.word;
                }
                setSuggestions([]);
              }}
            />
          </div>
        )}

        {/* Upload Options Pop-out Menu */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute bottom-full left-2 mb-2 w-64 bg-white dark:bg-[#181b22] border border-slate-200 dark:border-white/[0.12] rounded-xl shadow-2xl p-1.5 z-50 text-xs backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 transition-colors"
          >
            <div className="px-2 py-1 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Upload to Okin
            </div>

            {/* Option 1: Document */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                docInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-xs">Document</span>
                <span className="text-[10px] text-slate-400 truncate">PDF, Word (.docx), TXT, Code</span>
              </div>
            </button>

            {/* Option 2: Photos & Images */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                galleryInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0">
                <ImageIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-xs">Photos &amp; Images</span>
                <span className="text-[10px] text-slate-400 truncate">From gallery or file browser</span>
              </div>
            </button>

            {/* Option 3: Camera */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                cameraInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Camera className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-xs">Camera</span>
                <span className="text-[10px] text-slate-400 truncate">Capture directly with camera</span>
              </div>
            </button>

            {/* Option 4: Video */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                videoInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-500 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Film className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-xs">Video</span>
                <span className="text-[10px] text-slate-400 truncate">MP4, MOV, WebM clips</span>
              </div>
            </button>
          </div>
        )}

        {/* Recording active banner with live voice volume waves */}
        {isRecording && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-red-500/20 bg-red-950/30 text-xs rounded-t-2xl">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${audioLevel > 5 ? "bg-emerald-400 animate-ping" : "bg-red-500 animate-pulse"}`} />
              <div className="flex items-center gap-1 h-3.5">
                {[0.4, 0.7, 1.0, 0.6, 0.8].map((mult, i) => {
                  const barH = Math.max(3, Math.min(14, (audioLevel * mult) / 3));
                  return (
                    <span
                      key={i}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        audioLevel > 5 ? "bg-emerald-400" : "bg-red-400/60"
                      }`}
                      style={{ height: `${barH}px` }}
                    />
                  );
                })}
              </div>
              <span className={`font-medium ${audioLevel > 5 ? "text-emerald-300 font-semibold" : "text-slate-300"}`}>
                {audioLevel > 5 ? "Voice detected — listening..." : "Listening... speak and click Send"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-slate-400 text-xs">{formatTimer(recordingSeconds)}</span>
              <button
                type="button"
                onClick={cancelRecording}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-slate-300 hover:text-white hover:bg-white/[0.1] text-xs transition-colors cursor-pointer"
                title="Discard recording without sending"
              >
                <X className="w-3 h-3" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        {/* Transcribing banner */}
        {isTranscribing && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300 rounded-t-2xl text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
            <span className="font-medium">
              {shouldAutoSendRef.current ? "Transcribing & sending message..." : "Transcribing speech into chat box..."}
            </span>
          </div>
        )}

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => {
            if (isSpeaking && onStopSpeaking) {
              onStopSpeaking();
            }
            const val = e.target.value;
            setInputText(val);
            const caret = e.target.selectionStart ?? val.length;
            updateWordSuggestions(val, caret);
          }}
          onClick={() => {
            if (textareaRef.current) {
              const caret = textareaRef.current.selectionStart ?? inputText.length;
              updateWordSuggestions(inputText, caret);
            }
          }}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
              if (textareaRef.current) {
                const caret = textareaRef.current.selectionStart ?? inputText.length;
                updateWordSuggestions(inputText, caret);
              }
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording
              ? "Listening... spoken words will appear here. Click Send when done."
              : isTranscribing
              ? "Transcribing your speech..."
              : selectedFile
              ? `Ask a question about ${selectedFile.name}...`
              : "Message Okin..."
          }
          disabled={disabled && !isRecording}
          rows={1}
          className="w-full bg-transparent px-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none resize-none max-h-48 transition-colors duration-200"
        />

        {/* Bottom Control Bar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-white/[0.05] transition-colors duration-300">
          {/* Upload Button (+) */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              disabled={disabled || isRecording || isTranscribing}
              className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors disabled:opacity-40 flex items-center justify-center ${
                menuOpen ? "bg-slate-200/80 text-slate-900 dark:bg-white/[0.1] dark:text-white" : ""
              }`}
              title="Upload file, image, camera photo, or document"
              aria-label="Upload options"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons (Live Voice Mode + Mic + Send) */}
          <div className="flex items-center gap-1.5">
            {/* Live Voice Conversation Mode (ChatGPT-style circular voice UI) */}
            {onStartLiveVoice && !isRecording && !isTranscribing && (
              <button
                type="button"
                onClick={onStartLiveVoice}
                disabled={disabled}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors disabled:opacity-40"
                title="Start Live Voice Conversation"
                aria-label="Start Live Voice Conversation"
              >
                <AudioLines className="w-4 h-4" />
              </button>
            )}

            {/* Mic Button */}
            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm transition-all"
                title="Stop recording and review text before sending"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : isTranscribing ? (
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-white/[0.08] text-slate-600 dark:text-slate-300 text-xs font-medium cursor-wait"
              >
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                <span>Transcribing...</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (disabled) {
                    setFileError("Please wait until Okin finishes responding.");
                    return;
                  }
                  startRecording();
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/[0.05] transition-colors"
                title="Dictate message (Microphone)"
                aria-label="Voice input"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={`p-1.5 rounded-lg transition-all duration-200 ${
                canSend
                  ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 cursor-pointer shadow-xs"
                  : "bg-slate-200/80 text-slate-400 dark:bg-white/[0.08] dark:text-slate-500 cursor-not-allowed"
              }`}
              title={isRecording ? "Finish recording & send (Enter)" : "Send message (Enter)"}
              aria-label="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2 transition-colors">
        Okin can make mistakes. Verify important info.
      </p>
    </div>
  );
};
