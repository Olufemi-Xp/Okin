"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ChatFeed } from "@/components/ChatFeed";
import { InputDock } from "@/components/InputDock";
import { HelpModal } from "@/components/HelpModal";
import { VoiceModeModal } from "@/components/VoiceModeModal";
import { OrganizerModal } from "@/components/OrganizerModal";
import { PeacockLogo } from "@/components/PeacockLogo";
import { AuthView } from "@/components/AuthView";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import { UserProfile, getCurrentUser, signOutUser } from "@/lib/auth";
import {
  Thread,
  Message,
  fetchThreads,
  fetchThreadDetail,
  deleteThread,
  clearCrossSessionMemory,
  sendChatMessage,
  sendVoiceMessage,
  synthesizeSpeech,
  base64ToBlobUrl,
  fetchOrganizerData,
  generateImage,
} from "@/lib/api";
import {
  PanelLeftOpen,
  PanelLeft,
  SquarePen,
  AlertCircle,
  CheckCircle2,
  Bell,
  X,
} from "lucide-react";

function ChatMain() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialThreadId = searchParams.get("thread");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("Loading Okin...");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState("Thinking...");
  const [generatingAspectRatio, setGeneratingAspectRatio] = useState<string>("1:1");
  const [isColdStarting, setIsColdStarting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [isPinRequired, setIsPinRequired] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; city?: string } | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Automatically request browser geolocation for real-time Maps & Directions
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 }
      );
    }
  }, []);

  // Immediately stop any active voice speech playback
  const stopSpeaking = useCallback(() => {
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      } catch (e) {}
      activeAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsAssistantSpeaking(false);
  }, []);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Active alarm (persistent banner until dismissed)
  const [activeAlarm, setActiveAlarm] = useState<{ id: string; title: string; kind: "event" | "reminder" } | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Synthesized alarm chime (no audio file needed)
  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      [880, 1175, 1568].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {}
  }, []);

  const dismissAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    setActiveAlarm(null);
  }, []);

  const fireAlarm = useCallback(
    (id: string, title: string, kind: "event" | "reminder") => {
      setActiveAlarm({ id, title, kind });
      playChime();
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      // Repeat chime every 4s for up to 1 minute until dismissed
      let rings = 0;
      alarmIntervalRef.current = setInterval(() => {
        rings += 1;
        if (rings >= 15) {
          if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
          alarmIntervalRef.current = null;
          return;
        }
        playChime();
      }, 4000);

      // Native desktop notification (works even if tab is in background)
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(kind === "event" ? "Okin: Event starting now" : "Okin: Reminder", {
            body: title,
            requireInteraction: true,
          });
        }
      } catch {}
    },
    [playChime]
  );

  // Ask for desktop notification permission once
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {}
  }, []);

  // Check due events & reminders every 15 seconds
  useEffect(() => {
    let alerted: Set<string>;
    try {
      alerted = new Set<string>(JSON.parse(localStorage.getItem("suzzy_alerted_ids") || "[]"));
    } catch {
      alerted = new Set<string>();
    }
    const markAlerted = (key: string) => {
      alerted.add(key);
      try {
        localStorage.setItem("suzzy_alerted_ids", JSON.stringify(Array.from(alerted).slice(-300)));
      } catch {}
    };

    const isDue = (iso?: string | null) => {
      if (!iso) return false;
      const ms = new Date(iso).getTime();
      const now = Date.now();
      // Fire when due, within a 30-minute grace window (e.g. if the app was closed briefly)
      return !isNaN(ms) && ms <= now && now - ms < 30 * 60 * 1000;
    };

    const checkReminders = async () => {
      try {
        const data = await fetchOrganizerData();
        for (const ev of data.events || []) {
          const key = `ev-${ev.id}-${ev.start_time}`;
          if (!alerted.has(key) && isDue(ev.start_time)) {
            markAlerted(key);
            fireAlarm(ev.id, ev.title, "event");
            return;
          }
        }
        for (const task of data.tasks || []) {
          const key = `task-${task.id}-${task.due_time}`;
          if (!task.completed && !alerted.has(key) && isDue(task.due_time)) {
            markAlerted(key);
            fireAlarm(task.id, task.title, "reminder");
            return;
          }
        }
      } catch {}
    };

    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [fireAlarm]);

  // Restore saved theme from localStorage on initial render
  useEffect(() => {
    try {
      const saved = localStorage.getItem("suzzy_theme");
      if (saved) {
        setIsDarkMode(saved === "dark");
      } else if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        setIsDarkMode(false);
      }
    } catch (e) {}
  }, []);

  // Synchronize dark class on document with buttery-smooth fade transition
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Toggle theme with seamless fade effect
  const handleToggleTheme = useCallback(() => {
    document.documentElement.classList.add("theme-transitioning");
    setIsDarkMode((prev) => {
      const nextMode = !prev;
      try {
        localStorage.setItem("suzzy_theme", nextMode ? "dark" : "light");
      } catch (e) {}
      return nextMode;
    });

    setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 450);
  }, []);

  // Load threads on mount
  const loadThreads = useCallback(async () => {
    try {
      const data = await fetchThreads();
      setThreads(data);
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED_PIN_REQUIRED") {
        setIsPinRequired(true);
        setHelpOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load messages when activeThreadId changes
  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const { messages: threadMessages } = await fetchThreadDetail(threadId);
      setMessages(threadMessages || []);
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED_PIN_REQUIRED") {
        setIsPinRequired(true);
        setHelpOpen(true);
      } else {
        console.warn("Could not load thread:", err?.message || err);
        setMessages([]);
      }
    }
  }, []);

  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId, loadMessages]);

  // Restore authentication session from localStorage
  useEffect(() => {
    setCurrentUser(getCurrentUser());
    setIsAuthLoaded(true);
  }, []);

  // Switch to new empty chat
  const handleNewChat = () => {
    if (activeThreadId !== null) {
      setIsPageTransitioning(true);
      setTransitionMessage("Starting new chat...");
      setActiveThreadId(null);
      setMessages([]);
      router.push("/");
      setTimeout(() => {
        setIsPageTransitioning(false);
      }, 300);
    } else {
      setActiveThreadId(null);
      setMessages([]);
      router.push("/");
    }
  };

  // Cleanly sign out user and transition view to Auth screen
  const handleSignOut = useCallback(() => {
    setIsPageTransitioning(true);
    setTransitionMessage("Signing out of Okin...");
    setTimeout(() => {
      signOutUser();
      setCurrentUser(null);
      setActiveThreadId(null);
      setMessages([]);
      setThreads([]);
      router.push("/");
      setTimeout(() => {
        setIsPageTransitioning(false);
        showToast("Signed out successfully.");
      }, 250);
    }, 450);
  }, [router]);

  // Update active user profile
  const handleUpdateUser = (updated: UserProfile) => {
    setCurrentUser(updated);
    showToast("Profile updated successfully!");
  };

  // Open Add Account flow
  const handleOpenAddAccount = () => {
    setIsPageTransitioning(true);
    setTransitionMessage("Switching to account sign-in...");
    setTimeout(() => {
      signOutUser();
      setCurrentUser(null);
      setTimeout(() => {
        setIsPageTransitioning(false);
      }, 300);
    }, 400);
  };

  // Select a thread from sidebar with smooth transition feedback
  const handleSelectThread = (threadId: string) => {
    if (threadId !== activeThreadId) {
      setIsPageTransitioning(true);
      setTransitionMessage("Opening conversation...");
      setActiveThreadId(threadId);
      router.push(`/?thread=${threadId}`);
      setTimeout(() => {
        setIsPageTransitioning(false);
      }, 350);
    }
  };

  // Delete thread
  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        handleNewChat();
      }
      showToast("Thread deleted.");
    } catch (err) {
      showToast("Failed to delete thread.", "error");
    }
  };

  // Clear cross-session memory
  const handleClearMemory = async () => {
    try {
      await clearCrossSessionMemory();
      showToast("Memory cleared! All saved facts have been forgotten.");
    } catch (err) {
      showToast("Failed to clear memory.", "error");
    }
  };

  // Send typed chat message (with optional file & visual mode options)
  const handleSendMessage = async (
    text: string,
    file?: File,
    isVoiceInput?: boolean,
    imageGenOptions?: any
  ) => {
    if (text.toLowerCase().trim() === "/forget") {
      await handleClearMemory();
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          thread_id: activeThreadId || "default",
          session_id: "current",
          role: "user",
          modality: "text",
          content: "/forget",
          created_at: new Date().toISOString(),
        },
        {
          id: `local-reply-${Date.now()}`,
          thread_id: activeThreadId || "default",
          session_id: "current",
          role: "assistant",
          modality: "text",
          content: "Memory cleared. I have forgotten past stored facts. How can I help you?",
          agent_used: "GeneralResponder",
          created_at: new Date().toISOString(),
        },
      ]);
      return;
    }

    // Determine thinking message
    const lowerText = text.toLowerCase();
    const isImageIntent =
      Boolean(imageGenOptions?.isVisualMode) ||
      lowerText.startsWith("/imagine") ||
      lowerText.startsWith("/draw") ||
      lowerText.startsWith("/image") ||
      lowerText.startsWith("/generate") ||
      [
        "generate an image",
        "generate the image",
        "generate image",
        "create an image",
        "create the image",
        "create image",
        "image of a ",
        "image of an ",
        "picture of a ",
        "picture of an ",
        "draw me a",
        "draw me an",
        "draw a ",
        "draw an ",
        "draw the ",
        "make a picture of",
        "illustrate",
        "create an illustration",
        "generate an illustration",
        "design a ",
        "design an ",
        "visual reference",
        "show me a visual",
        "show me an image",
        "show me a picture",
        "create a visual",
        "make a visual",
        "concept art",
        "generate artwork",
        "render a 3d",
      ].some((kw) => lowerText.includes(kw));

    const inferredAspect =
      imageGenOptions?.aspectRatio ||
      (lowerText.includes("16:9") || lowerText.includes("landscape") || lowerText.includes("wide")
        ? "16:9"
        : lowerText.includes("9:16") || lowerText.includes("portrait") || lowerText.includes("vertical")
        ? "9:16"
        : "1:1");
    setGeneratingAspectRatio(inferredAspect);

    if (file) {
      setThinkingStatus(`Analyzing ${file.name}...`);
    } else if (isImageIntent) {
      setThinkingStatus("Okin is creating your visual...");
    } else if (lowerText.includes("search") || lowerText.includes("latest") || lowerText.includes("news") || lowerText.includes("today")) {
      setThinkingStatus("Searching the web...");
    } else if (lowerText.includes("code") || lowerText.includes("python") || lowerText.includes("run")) {
      setThinkingStatus("Running Python script...");
    } else {
      setThinkingStatus("Thinking...");
    }

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      thread_id: activeThreadId || "pending",
      session_id: "current",
      role: "user",
      modality: isVoiceInput ? "voice" : file ? "file" : "text",
      content: file && !text ? `[Attached file: ${file.name}]` : text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsThinking(true);

    try {
      let res: { response: string; thread_id: string; agent_used?: string; model_used?: string };

      if (imageGenOptions?.isVisualMode) {
        const cleanPrompt = text.replace(/^\/(?:imagine|draw|image|generate)\s*/i, "").trim() || text;
        const imgRes = await generateImage({
          prompt: cleanPrompt,
          style: imageGenOptions.style,
          aspect_ratio: imageGenOptions.aspectRatio,
          enhance_prompt: imageGenOptions.enhancePrompt,
          thread_id: activeThreadId || undefined,
        });

        const cardData = {
          kind: "image-generation",
          image_id: imgRes.image.image_id,
          url: imgRes.image.url,
          prompt: imgRes.image.prompt,
          enhanced_prompt: imgRes.image.enhanced_prompt,
          style: imgRes.image.style,
          aspect_ratio: imgRes.image.aspect_ratio,
          width: imgRes.image.width,
          height: imgRes.image.height,
          provider: imgRes.image.provider || "flux",
          created_at: imgRes.image.created_at,
        };
        const styleName = (imgRes.image.style || "Photorealistic").replace(/_/g, " ");
        res = {
          response: `Here is your **${styleName}** visual asset for *"${cleanPrompt}"* (${imgRes.image.aspect_ratio}):\n\n\`\`\`image-generation-card\n${JSON.stringify(cardData)}\n\`\`\``,
          thread_id: imgRes.thread_id || activeThreadId || "default",
          agent_used: "ImageGeneratorWorker",
          model_used: "flux-image-generator",
        };
      } else {
        res = await sendChatMessage(
          text,
          activeThreadId || undefined,
          file,
          (isWaking) => {
            setIsColdStarting(isWaking);
          },
          false,
          userLocation
        );
      }

      // Speech is delivered as clean text by default; users can click the speaker icon in the message footer anytime to listen on-demand.
      const assistantMsg: Message = {
        id: `asst-${Date.now()}`,
        thread_id: res.thread_id,
        session_id: "current",
        role: "assistant",
        modality: "text",
        content: res.response,
        agent_used: res.agent_used,
        created_at: new Date().toISOString(),
        animate: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (!activeThreadId) {
        setActiveThreadId(res.thread_id);
        router.push(`/?thread=${res.thread_id}`);
        loadThreads();
      }
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED_PIN_REQUIRED") {
        setIsPinRequired(true);
        setHelpOpen(true);
      } else {
        const errMsg = err?.message || "Failed to get response.";
        showToast(errMsg, "error");
        if (imageGenOptions?.isVisualMode || isImageIntent) {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              thread_id: activeThreadId || "default",
              session_id: "current",
              role: "assistant",
              modality: "text",
              content: `I couldn't generate that visual: **${errMsg}**`,
              agent_used: "ImageGeneratorWorker",
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } finally {
      setIsThinking(false);
      setIsColdStarting(false);
    }
  };

  // Send voice message
  const handleSendVoice = async (audioBlob: Blob) => {
    setIsThinking(true);
    setThinkingStatus("Transcribing speech with Whisper...");

    try {
      const res = await sendVoiceMessage(
        audioBlob,
        activeThreadId || undefined,
        (isWaking) => {
          setIsColdStarting(isWaking);
        },
        undefined,
        userLocation
      );

      if (res.transcript && res.transcript.trim()) {
        const userMsg: Message = {
          id: `voice-usr-${Date.now()}`,
          thread_id: res.thread_id,
          session_id: "current",
          role: "user",
          modality: "voice",
          content: res.transcript,
          created_at: new Date().toISOString(),
        };
        const asstMsg: Message = {
          id: `voice-asst-${Date.now()}`,
          thread_id: res.thread_id,
          session_id: "current",
          role: "assistant",
          modality: "voice",
          content: res.response,
          agent_used: res.agent_used,
          audio_url: res.audio_base64 || undefined,
          created_at: new Date().toISOString(),
          animate: true,
        };
        setMessages((prev) => [...prev, userMsg, asstMsg]);

        if (!activeThreadId) {
          setActiveThreadId(res.thread_id);
          router.push(`/?thread=${res.thread_id}`);
          loadThreads();
        }
      } else {
        const fallbackMsg: Message = {
          id: `voice-notice-${Date.now()}`,
          thread_id: activeThreadId || "default",
          session_id: "current",
          role: "assistant",
          modality: "text",
          content: res.response || "I didn't catch any speech. Please check your microphone and speak clearly.",
          agent_used: "VoiceSTT",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
        showToast("No speech detected. Please speak closer to your microphone.", "error");
      }
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED_PIN_REQUIRED") {
        setIsPinRequired(true);
        setHelpOpen(true);
      } else {
        showToast(err.message || "Voice processing failed.", "error");
      }
    } finally {
      setIsThinking(false);
      setIsColdStarting(false);
    }
  };

  // Initial loading placeholder until auth session is evaluated
  if (!isAuthLoaded) {
    return <PageTransitionOverlay isVisible={true} message="Loading Okin..." />;
  }

  // If user is logged out, render AuthView with smooth transition upon sign-in
  if (!currentUser) {
    return (
      <AuthView
        onSignInSuccess={(user) => {
          setIsPageTransitioning(true);
          setTransitionMessage(`Welcome back, ${user.name.split(" ")[0] || "there"}...`);
          setTimeout(() => {
            setCurrentUser(user);
            loadThreads();
            setTimeout(() => {
              setIsPageTransitioning(false);
              showToast(`Welcome back, ${user.name}!`);
            }, 350);
          }, 450);
        }}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f8fafc] text-slate-900 dark:bg-[#0d0f14] dark:text-slate-100 transition-colors duration-400 ease-in-out">
      {/* Route & Page Transition Screen with 3D Animated Rolling Peacock */}
      <PageTransitionOverlay
        isVisible={isPageTransitioning}
        message={transitionMessage}
        onClear={() => setIsPageTransitioning(false)}
      />

      {/* Sidebar */}
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        onDeleteThread={handleDeleteThread}
        onClearMemory={handleClearMemory}
        isOpen={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((prev) => !prev)}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenOrganizer={() => setOrganizerOpen(true)}
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onUpdateUser={handleUpdateUser}
        onOpenAddAccount={handleOpenAddAccount}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="h-12 border-b border-slate-200 dark:border-white/[0.07] px-3.5 flex items-center justify-between shrink-0 bg-white/80 dark:bg-[#0d0f14]/80 backdrop-blur-md z-10 transition-colors duration-400">
          <div className="flex items-center gap-1.5">
            {/* When sidebar is closed (or on mobile), show sidebar toggle button & primary logo */}
            {!sidebarOpen ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNewChat}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                  title="New chat"
                  aria-label="New chat"
                >
                  <SquarePen className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 ml-1.5">
                  <PeacockLogo className="w-[22px] h-[22px] shrink-0" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 tracking-tight">Okin</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                title="Toggle sidebar"
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Toast Notification */}
        {toastMessage && (
          <div
            className={`fixed top-14 right-4 z-50 px-3.5 py-2 rounded-xl border text-xs shadow-xl flex items-center gap-2 transition-all ${
              toastMessage.type === "success"
                ? "bg-white border-emerald-500/30 text-emerald-700 dark:bg-[#13161c] dark:border-emerald-500/30 dark:text-emerald-300"
                : "bg-white border-red-500/30 text-red-700 dark:bg-[#13161c] dark:border-red-500/30 dark:text-red-300"
            }`}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Chat Feed */}
        {activeAlarm && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-[#13161c] border border-amber-500/40 shadow-2xl">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 animate-pulse">
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {activeAlarm.kind === "event" ? "Event starting now" : "Reminder"}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{activeAlarm.title}</div>
              </div>
              <button
                onClick={dismissAlarm}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition"
                aria-label="Dismiss alarm"
              >
                <X className="w-3.5 h-3.5" />
                Dismiss
              </button>
            </div>
          </div>
        )}

        <ChatFeed
          messages={messages}
          isThinking={isThinking}
          thinkingStatus={thinkingStatus}
          generatingAspectRatio={generatingAspectRatio}
          isColdStarting={isColdStarting}
          onSelectPrompt={(prompt) => handleSendMessage(prompt)}
        />

        {/* Input Dock */}
        <InputDock
          onSendMessage={handleSendMessage}
          onSendVoice={handleSendVoice}
          onStartLiveVoice={() => setVoiceModeOpen(true)}
          disabled={isThinking}
          isSpeaking={isAssistantSpeaking}
          onStopSpeaking={stopSpeaking}
        />
      </main>

      {/* Live Voice Conversation Mode (ChatGPT-style circular voice UI) */}
      <VoiceModeModal
        isOpen={voiceModeOpen}
        onClose={() => setVoiceModeOpen(false)}
        activeThreadId={activeThreadId}
        onNewMessage={(userText, asstReply, audioUrl) => {
          const userMsg: Message = {
            id: `vm-usr-${Date.now()}`,
            thread_id: activeThreadId || "default",
            session_id: "current",
            role: "user",
            modality: "voice",
            content: userText,
            created_at: new Date().toISOString(),
          };
          const asstMsg: Message = {
            id: `vm-asst-${Date.now()}`,
            thread_id: activeThreadId || "default",
            session_id: "current",
            role: "assistant",
            modality: "voice",
            content: asstReply,
            audio_url: audioUrl,
            created_at: new Date().toISOString(),
            animate: true,
          };
          setMessages((prev) => [...prev, userMsg, asstMsg]);
          loadThreads();
        }}
        onColdStart={(isWaking) => setIsColdStarting(isWaking)}
      />

      {/* Help & PIN Modal */}
      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        isPinRequired={isPinRequired}
      />

      {/* Calendar, Reminders & To-Do Organizer Modal */}
      <OrganizerModal
        isOpen={organizerOpen}
        onClose={() => setOrganizerOpen(false)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<PageTransitionOverlay isVisible={true} message="Loading Okin..." />}>
      <ChatMain />
    </Suspense>
  );
}
