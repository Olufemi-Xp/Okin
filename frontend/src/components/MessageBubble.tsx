"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Message, synthesizeSpeech, base64ToBlobUrl, sendApprovedDraft, toggleOrganizerTask, generateVisual, API_BASE } from "@/lib/api";
import {
  Volume2,
  VolumeX,
  Copy,
  Check,
  Loader2,
  Globe,
  Terminal,
  Mail,
  Send,
  AlertCircle,
  Calendar,
  Bell,
  Clock,
  MapPin,
  Compass,
  Navigation,
  Plane,
  Building,
  Play,
  Tv,
  ExternalLink,
  Star,
  Image as ImageIcon,
  Download,
  Maximize2,
  RefreshCw,
  X,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

interface MessageBubbleProps {
  message: Message;
  onStreamUpdate?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onStreamUpdate }) => {
  const isUser = message.role === "user";
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(message.audio_url || null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  // Progressive typewriter reveal for newly generated assistant messages
  const shouldAnimate = !isUser && Boolean(message.animate);
  const [visibleLength, setVisibleLength] = useState<number>(
    shouldAnimate ? 0 : message.content.length
  );
  const [isAnimating, setIsAnimating] = useState<boolean>(shouldAnimate);
  const hasAnimatedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!shouldAnimate || hasAnimatedRef.current) {
      setVisibleLength(message.content.length);
      setIsAnimating(false);
      return;
    }

    const fullText = message.content;
    const totalLen = fullText.length;
    if (totalLen === 0) {
      setIsAnimating(false);
      return;
    }

    let currentIndex = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const step = () => {
      if (isCancelled) return;

      if (currentIndex >= totalLen) {
        setVisibleLength(totalLen);
        hasAnimatedRef.current = true;
        setIsAnimating(false);
        if (onStreamUpdate) onStreamUpdate();
        return;
      }

      // 1. Check if at the start of a fenced block (e.g. interactive cards or code blocks)
      if (fullText.startsWith("```", currentIndex)) {
        const endBlock = fullText.indexOf("```", currentIndex + 3);
        if (endBlock !== -1) {
          // Reveal the entire fenced block at once so cards don't flicker with incomplete JSON
          currentIndex = endBlock + 3;
          setVisibleLength(currentIndex);
          if (onStreamUpdate) onStreamUpdate();
          timeoutId = setTimeout(step, 60);
          return;
        }
      }

      // 2. Line break handling: step across newlines and pause calmly for smooth line-by-line flow
      if (fullText[currentIndex] === "\n") {
        let nextChar = currentIndex + 1;
        while (nextChar < totalLen && fullText[nextChar] === "\n") {
          nextChar++;
        }
        currentIndex = nextChar;
        setVisibleLength(currentIndex);
        if (onStreamUpdate) onStreamUpdate();
        timeoutId = setTimeout(step, 55); // Calm pause between lines
        return;
      }

      // 3. Find the next word/token boundary
      const nextWhitespace = fullText.slice(currentIndex + 1).search(/[\s\n]/);
      let target = nextWhitespace === -1 ? totalLen : currentIndex + 1 + nextWhitespace;

      // For long responses (> 1200 chars), take 2 words per step for a balanced, readable pace
      if (totalLen > 1200 && target < totalLen && fullText[target] === " ") {
        const secondSpace = fullText.slice(target + 1).search(/[\s\n]/);
        if (secondSpace !== -1) {
          target = target + 1 + secondSpace;
        }
      }

      // Natural conversational cadence based on punctuation
      const word = fullText.slice(currentIndex, target);
      let delay = 24;
      if (/[.!?]$/.test(word.trim())) {
        delay = 48; // Slight sentence breath
      } else if (/[,;:]$/.test(word.trim())) {
        delay = 32;
      }

      // Keep bold/italic delimiter attached if adjacent
      if (target < totalLen && fullText.startsWith("**", target)) {
        target += 2;
      }

      currentIndex = Math.min(totalLen, target);
      setVisibleLength(currentIndex);
      if (onStreamUpdate) onStreamUpdate();

      timeoutId = setTimeout(step, delay);
    };

    // Kick off animation
    timeoutId = setTimeout(step, 30);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [message.content, shouldAnimate, onStreamUpdate]);

  const handleSpeak = async () => {
    if (isPlaying && currentAudio) {
      currentAudio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      let urlToPlay = audioUrl;
      if (!urlToPlay) {
        setIsLoadingAudio(true);
        const res = await synthesizeSpeech(message.content);
        if (res) {
          urlToPlay = base64ToBlobUrl(res, "audio/mp3");
          setAudioUrl(urlToPlay);
        }
      }

      if (urlToPlay) {
        const audio = new Audio(urlToPlay);
        setCurrentAudio(audio);
        setIsPlaying(true);
        audio.onended = () => {
          setIsPlaying(false);
          setCurrentAudio(null);
        };
        audio.onerror = () => {
          setIsPlaying(false);
          setCurrentAudio(null);
        };
        await audio.play();
      }
    } catch (e) {
      console.warn("Speech playback error:", e);
      setIsPlaying(false);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const renderWorkerNote = (agent?: string) => {
    if (!agent) return null;
    if (agent === "CalendarWorker") {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2 transition-colors">
          <Calendar className="w-3.5 h-3.5 text-emerald-500" />
          <span>Calendar &amp; Organizer</span>
        </div>
      );
    }
    if (agent === "DiscoveryWorker") {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2 transition-colors">
          <Compass className="w-3.5 h-3.5 text-amber-500" />
          <span>Navigation &amp; Discovery</span>
        </div>
      );
    }
    if (agent === "EmailWorker") {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2 transition-colors">
          <Mail className="w-3.5 h-3.5 text-red-500" />
          <span>Gmail Assistant</span>
        </div>
      );
    }
    if (agent === "WebSearchWorker") {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2 transition-colors">
          <Globe className="w-3.5 h-3.5 text-emerald-500 dark:text-slate-400" />
          <span>Searched the web</span>
        </div>
      );
    }
    if (agent === "CoderWorker") {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2 transition-colors">
          <Terminal className="w-3.5 h-3.5 text-blue-500 dark:text-slate-400" />
          <span>Ran Python script</span>
        </div>
      );
    }
    return null;
  };

  if (isUser) {
    return (
      <div className="w-full flex justify-end mb-5">
        <div className="max-w-[85%] md:max-w-[70%] bg-slate-200/90 text-slate-900 dark:bg-[#191d24] dark:text-slate-100 rounded-2xl px-4 py-2.5 text-sm leading-relaxed border border-slate-300/80 dark:border-white/[0.08] shadow-xs whitespace-pre-wrap break-words transition-colors duration-400">
          {message.content}
        </div>
      </div>
    );
  }

  const displayedText = isAnimating ? message.content.slice(0, visibleLength) : message.content;

  return (
    <div className="w-full flex justify-start mb-7 group">
      <div className="max-w-3xl w-full flex flex-col">
        {renderWorkerNote(message.agent_used)}

        {/* Message Content */}
        <div className="prose dark:prose-invert max-w-none text-sm md:text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 break-words transition-colors duration-400">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              pre({ children }: any) {
                return <>{children}</>;
              },
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-([\w-]+)/.exec(className || "");
                const codeString = String(children).replace(/\n$/, "");
                const lang = (match ? match[1] : "").toLowerCase();

                // Check for Interactive Gmail Draft Card (never fall back to raw CodeBlock)
                const isEmailDraft = !inline && (
                  lang === "email-draft" ||
                  lang === "email" ||
                  (codeString.includes('"subject":') && (codeString.includes('"to":') || codeString.includes('"body":')))
                );
                if (isEmailDraft) {
                  try {
                    return isAnimating ? null : <EmailDraftCard jsonString={codeString} />;
                  } catch (e) {}
                }

                // Check for Interactive Calendar / Task / Reminder Card (never fall back to raw CodeBlock)
                const isCalendar = !inline && (
                  lang === "calendar" ||
                  lang === "calendar-card" ||
                  lang === "calendar-event" ||
                  lang === "calendar-task" ||
                  (codeString.includes('"kind":') && (codeString.includes('"event"') || codeString.includes('"task"') || codeString.includes('"summary"')))
                );
                if (isCalendar) {
                  try {
                    return isAnimating ? null : <CalendarCard jsonString={codeString} />;
                  } catch (e) {}
                }

                // Check for Interactive Maps & Places Card
                const isMaps = !inline && (
                  lang === "maps-card" ||
                  lang === "map" ||
                  lang === "maps" ||
                  (codeString.includes('"kind":') && (codeString.includes('"places"') || codeString.includes('"directions"')))
                );
                if (isMaps) {
                  try {
                    return <MapsCard jsonString={codeString} />;
                  } catch (e) {}
                }

                // Check for Interactive Travel Planning Card (Flights / Hotels)
                const isTravel = !inline && (
                  lang === "travel-card" ||
                  lang === "travel" ||
                  lang === "flight" ||
                  lang === "flights" ||
                  lang === "hotel" ||
                  lang === "hotels" ||
                  codeString.includes('"travel_type":')
                );
                if (isTravel) {
                  try {
                    return <TravelCard jsonString={codeString} />;
                  } catch (e) {}
                }

                // Check for Interactive YouTube Video Player Card
                const isYouTube = !inline && (
                  lang === "youtube-card" ||
                  lang === "youtube" ||
                  (codeString.includes('"kind": "youtube"') || (codeString.includes('"videos":') && codeString.includes('"embed_url"')))
                );
                if (isYouTube) {
                  try {
                    return <YouTubeCard jsonString={codeString} />;
                  } catch (e) {}
                }

                // Check for Interactive Visual Illustration Card
                const isIllustration = !inline && (
                  lang === "illustration-card" ||
                  lang === "illustration" ||
                  (codeString.includes('"image_url":') && (codeString.includes('"source":') || codeString.includes('"title":')))
                );
                if (isIllustration) {
                  try {
                    return <IllustrationCard jsonString={codeString} />;
                  } catch (e) {}
                }

                // Check for Interactive AI Visual & Image Generation Asset Card
                const isImageGen = !inline && (
                  lang === "image-generation-card" ||
                  lang === "image-generation" ||
                  lang === "image-gen" ||
                  codeString.includes('"kind": "image-generation"')
                );
                if (isImageGen) {
                  try {
                    return <ImageGenerationCard jsonString={codeString} />;
                  } catch (e) {}
                }

                if (!inline && (match || codeString.includes("\n"))) {
                  return <CodeBlock language={match ? match[1] : "text"} value={codeString} />;
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {displayedText}
          </ReactMarkdown>
          {isAnimating && (
            <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse" />
          )}
        </div>

        {/* ChatGPT-style Action Toolbar Below Assistant Message */}
        {!isAnimating && (
          <div className="flex items-center gap-1 mt-2 text-slate-400 dark:text-slate-500 animate-in fade-in duration-300">
            {/* Read Aloud Toggle */}
            <button
              onClick={handleSpeak}
              disabled={isLoadingAudio}
              className={`p-1.5 rounded-md transition-colors ${
                isPlaying
                  ? "text-emerald-500 bg-emerald-500/10"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06]"
              }`}
              title={isPlaying ? "Stop listening" : "Read aloud"}
              aria-label="Read aloud"
            >
              {isLoadingAudio ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            {/* Copy Response */}
            <button
              onClick={handleCopyMessage}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors"
              title={copiedText ? "Copied!" : "Copy message"}
              aria-label="Copy message"
            >
              {copiedText ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            {/* Thumbs Up Feedback */}
            <button
              onClick={() => setFeedback((prev) => (prev === "up" ? null : "up"))}
              className={`p-1.5 rounded-md transition-colors ${
                feedback === "up"
                  ? "text-emerald-500 bg-emerald-500/10"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06]"
              }`}
              title="Good response"
              aria-label="Good response"
            >
              <ThumbsUp className={`w-4 h-4 ${feedback === "up" ? "fill-emerald-500/30" : ""}`} />
            </button>

            {/* Thumbs Down Feedback */}
            <button
              onClick={() => setFeedback((prev) => (prev === "down" ? null : "down"))}
              className={`p-1.5 rounded-md transition-colors ${
                feedback === "down"
                  ? "text-rose-500 bg-rose-500/10"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06]"
              }`}
              title="Bad response"
              aria-label="Bad response"
            >
              <ThumbsDown className={`w-4 h-4 ${feedback === "down" ? "fill-rose-500/30" : ""}`} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Interactive Gmail Draft Preview Card
const EmailDraftCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  const [status, setStatus] = useState<"draft" | "sending" | "sent" | "error">("draft");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedBody, setCopiedBody] = useState(false);

  let draft: any = {};
  try {
    draft = JSON.parse(jsonString);
  } catch (e) {
    draft = { to: "recipient@example.com", subject: "Email Draft", body: jsonString };
  }

  const handleSend = async () => {
    setStatus("sending");
    setErrorMessage("");
    try {
      await sendApprovedDraft({
        draft_id: draft.draft_id,
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        thread_id: draft.thread_id,
      });
      setStatus("sent");
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Failed to send email.");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft.body || "");
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 2000);
    } catch (e) {}
  };

  return (
    <div className="my-4 rounded-xl border border-red-500/20 bg-white dark:bg-[#13161c] shadow-md overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-xs">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="font-semibold text-red-600 dark:text-red-300">Gmail Draft Prepared</span>
        </div>
        {draft.connected_account && (
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white/40 dark:bg-black/30 px-2 py-0.5 rounded-full border border-black/5 dark:border-white/5">
            {draft.connected_account}
          </span>
        )}
      </div>

      {/* Draft Meta Details */}
      <div className="p-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-white/[0.05] pb-2">
          <span className="font-semibold text-slate-500 dark:text-slate-400 w-14 shrink-0">To:</span>
          <span className="font-mono text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 rounded text-xs truncate">
            {draft.to}
          </span>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-white/[0.05] pb-2">
          <span className="font-semibold text-slate-500 dark:text-slate-400 w-14 shrink-0">Subject:</span>
          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
            {draft.subject}
          </span>
        </div>

        {/* Message Body */}
        <div className="pt-1">
          <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Message:</span>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090a0d] border border-slate-200/80 dark:border-white/[0.06] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans text-xs max-h-64 overflow-y-auto">
            {draft.body}
          </div>
        </div>

        {/* Error notice if send failed */}
        {status === "error" && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-600 dark:text-slate-300 transition-colors"
          >
            {copiedBody ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy text</span>
              </>
            )}
          </button>

          {status === "sent" ? (
            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-xs animate-in fade-in">
              <Check className="w-4 h-4" />
              <span>Email Sent Successfully!</span>
            </div>
          ) : (
            <button
              onClick={handleSend}
              disabled={status === "sending"}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm shadow-emerald-600/30 transition-all hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending email...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Email Now</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Clean minimalist code block with copy button
const CodeBlock: React.FC<{ language: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy code:", e);
    }
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-slate-700/80 dark:border-white/[0.08] bg-[#090a0d] font-mono text-xs shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/[0.04] text-slate-300 border-b border-white/[0.08]">
        <span className="text-[11px] font-medium lowercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto">
        <code>{value}</code>
      </div>
    </div>
  );
};

// Interactive Calendar Event / Reminder / To-Do Summary Card
const CalendarCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});

  let data: any = {};
  try {
    data = JSON.parse(jsonString);
  } catch {
    return null;
  }

  const formatTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    const next = !current;
    setCompletedMap((prev) => ({ ...prev, [id]: next }));
    await toggleOrganizerTask(id, next);
  };

  if (data.kind === "event" && data.item) {
    const ev = data.item;
    return (
      <div className="my-3 rounded-xl border border-emerald-500/25 bg-white dark:bg-[#13161c] p-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
          <Calendar className="w-4 h-4" />
          <span>Event Scheduled</span>
        </div>
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{ev.title}</div>
        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            {formatTime(ev.start_time)}
          </span>
          {ev.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {ev.location}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (data.kind === "task" && data.item) {
    const t = data.item;
    const isDone = completedMap[t.id] ?? Boolean(t.completed);
    return (
      <div className="my-3 rounded-xl border border-blue-500/25 bg-white dark:bg-[#13161c] p-3.5 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <button
            onClick={() => handleToggle(t.id, isDone)}
            className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
              isDone
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-slate-300 dark:border-slate-600 hover:border-emerald-500"
            }`}
          >
            {isDone && <Check className="w-3 h-3" />}
          </button>
          <div>
            <div className={`text-xs font-semibold ${isDone ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
              {t.title}
            </div>
            {t.due_time && (
              <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                <Bell className="w-3 h-3" />
                <span>{formatTime(t.due_time)}</span>
              </div>
            )}
          </div>
        </div>
        <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
          {t.priority || "medium"}
        </span>
      </div>
    );
  }

  const events: any[] = data.events || [];
  const tasks: any[] = data.tasks || [];
  if (events.length === 0 && tasks.length === 0) return null;

  return (
    <div className="my-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#13161c] p-4 shadow-sm space-y-3 text-xs">
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>Upcoming Events</span>
          </div>
          <div className="space-y-1.5">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.03]">
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-2">{ev.title}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{formatTime(ev.start_time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 mb-2">
            <Bell className="w-3.5 h-3.5" />
            <span>Active Reminders &amp; To-Do</span>
          </div>
          <div className="space-y-1.5">
            {tasks.map((t) => {
              const isDone = completedMap[t.id] ?? Boolean(t.completed);
              return (
                <div key={t.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.03]">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <button
                      onClick={() => handleToggle(t.id, isDone)}
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                        isDone ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {isDone && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <span className={`truncate ${isDone ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>
                      {t.title}
                    </span>
                  </div>
                  {t.due_time && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">{formatTime(t.due_time)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive Maps & Local Places Card
const MapsCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  let data: any = {};
  try {
    data = JSON.parse(jsonString);
  } catch {
    return null;
  }

  const places: any[] = data.places || [];
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const activePlace = places[selectedIdx] || null;
  const locationName = activePlace?.name
    ? `${activePlace.name} ${activePlace.address || ""}`.trim()
    : data.location_name || data.query || "Location";

  const encLocation = encodeURIComponent(locationName);
  const gmapsSearchUrl =
    activePlace?.google_maps_url ||
    data.gmaps_search_url ||
    `https://www.google.com/maps/search/?api=1&query=${encLocation}`;

  const gmapsDirUrl =
    activePlace?.directions_url ||
    data.directions_url ||
    `https://www.google.com/maps/dir/?api=1&destination=${encLocation}`;

  // Interactive OpenStreetMap Embed (Zoom & Pan enabled, 100% Free, zero iframe blocks)
  const activeLat = activePlace?.lat || data.lat;
  const activeLon = activePlace?.lon || data.lon;

  const osmEmbedUrl =
    data.osm_embed_url && selectedIdx === 0
      ? data.osm_embed_url
      : activeLat && activeLon
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(activeLon) - 0.012}%2C${Number(activeLat) - 0.008}%2C${Number(activeLon) + 0.012}%2C${Number(activeLat) + 0.008}&layer=mapnik&marker=${activeLat}%2C${activeLon}`
      : data.active_map_embed_url ||
        `https://maps.google.com/maps?q=${encLocation}&t=&z=14&ie=UTF8&iwloc=&output=embed`;

  return (
    <div className="my-3.5 rounded-2xl border border-emerald-500/35 bg-slate-50/70 dark:bg-[#12151c] p-4 shadow-sm space-y-3">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <Compass className="w-4 h-4" />
          <span className="truncate max-w-[200px] sm:max-w-xs">{locationName}</span>
        </div>
        <div className="flex items-center gap-2">
          {data.user_has_location && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              📍 Near You
            </span>
          )}
          <a
            href={gmapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <span>Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Interactive Map Embed (Zoom & Pan) */}
      {osmEmbedUrl && (
        <div className="relative w-full h-64 md:h-72 rounded-xl overflow-hidden border border-slate-200/90 dark:border-white/[0.1] shadow-inner bg-slate-100 dark:bg-slate-800 group">
          <iframe
            src={osmEmbedUrl}
            title={`Interactive Map of ${locationName}`}
            className="w-full h-full border-0"
            loading="lazy"
            allowFullScreen
          />
          {/* Subtle pan & zoom helper pill */}
          <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-xs text-white text-[10px] font-medium flex items-center gap-1.5 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
            <span>📍 Interactive Map • Scroll to zoom, drag to pan</span>
          </div>
        </div>
      )}

      {/* Prominent Action Bar: Google Maps Search & Directions Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <a
          href={gmapsSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-95"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Open in Google Maps</span>
          <ExternalLink className="w-3 h-3 ml-0.5" />
        </a>
        <a
          href={gmapsDirUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-95"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Get Directions</span>
          <ExternalLink className="w-3 h-3 ml-0.5" />
        </a>
      </div>

      {/* Places List / Multiple Spots Selection */}
      {places.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {places.length > 1 ? "Select Place to Center Map:" : "Location Details:"}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {places.map((p, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500/40 dark:bg-emerald-500/15"
                      : "bg-white dark:bg-[#181c24] border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-white">
                      <MapPin className={`w-3.5 h-3.5 ${isSelected ? "text-emerald-500" : "text-slate-400"} shrink-0`} />
                      <span>{p.name}</span>
                    </div>
                    {p.category && (
                      <span className="text-[9px] uppercase font-medium px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] shrink-0">
                        {p.category}
                      </span>
                    )}
                  </div>
                  {p.address && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {p.address}
                    </div>
                  )}
                  {p.snippet && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                      {p.snippet}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive Travel Planning Card (Flights & Hotels)
const TravelCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  let data: any = {};
  try {
    data = JSON.parse(jsonString);
  } catch {
    return null;
  }

  const links = data.links || {};
  const isFlight = data.travel_type === "flight" || Boolean(links.google_flights_url);

  return (
    <div className="my-3.5 rounded-2xl border border-sky-500/30 bg-slate-50/70 dark:bg-[#12151c] p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
          {isFlight ? <Plane className="w-4 h-4" /> : <Building className="w-4 h-4" />}
          <span>{isFlight ? "Flights & Airfare Planner" : "Hotels & Stays Planner"}</span>
        </div>
        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
          {isFlight ? "Flights" : "Hotels"}
        </span>
      </div>

      <div className="p-3 rounded-xl bg-white dark:bg-[#181c24] border border-slate-200/80 dark:border-white/[0.06] space-y-2">
        <div className="text-xs text-slate-700 dark:text-slate-200 font-medium">
          Trip Target: <span className="font-semibold text-slate-900 dark:text-white">{data.query || "Your Journey"}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Access verified live rates, compare airlines or hotel amenities, and secure bookings directly:
        </p>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {links.google_flights_url && (
            <a
              href={links.google_flights_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Google Flights</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </a>
          )}
          {links.skyscanner_url && (
            <a
              href={links.skyscanner_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors"
            >
              <span>Skyscanner</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {links.google_hotels_url && (
            <a
              href={links.google_hotels_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Building className="w-3.5 h-3.5" />
              <span>Google Hotels</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </a>
          )}
          {links.booking_url && (
            <a
              href={links.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors"
            >
              <span>Booking.com</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// Interactive YouTube Video & Player Card
const YouTubeCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  let data: any = {};
  try {
    data = JSON.parse(jsonString);
  } catch {
    return null;
  }

  const videos: any[] = data.videos || [];
  const [activeVideo, setActiveVideo] = useState<any>(videos[0] || null);

  if (!activeVideo && videos.length === 0) return null;

  return (
    <div className="my-3.5 rounded-2xl border border-red-500/30 bg-slate-50/70 dark:bg-[#12151c] p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
          <Tv className="w-4 h-4" />
          <span>YouTube Media &amp; Entertainment</span>
        </div>
        {activeVideo && (
          <a
            href={activeVideo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
          >
            <span>Watch on YouTube</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Embedded In-Chat Video Player */}
      {activeVideo && (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/[0.1] bg-black shadow-md">
          <div className="aspect-video w-full">
            <iframe
              src={activeVideo.embed_url}
              title={activeVideo.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="p-3 bg-white dark:bg-[#181c24] flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-1">
                {activeVideo.title}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {activeVideo.channel}
              </p>
            </div>
            <a
              href={activeVideo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold transition-colors shrink-0"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>YouTube</span>
            </a>
          </div>
        </div>
      )}

      {/* Additional video selector playlist */}
      {videos.length > 1 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            More Results
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {videos.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveVideo(v)}
                className={`p-2 rounded-xl text-left border transition-all flex items-center gap-2 ${
                  activeVideo?.id === v.id
                    ? "bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-300"
                    : "bg-white dark:bg-[#181c24] border-slate-200/80 dark:border-white/[0.06] hover:border-slate-300 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="w-12 h-8 rounded-md bg-black/80 overflow-hidden shrink-0 relative">
                  {v.thumbnail && (
                    <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="w-3 h-3 text-white fill-current" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium line-clamp-1">{v.title}</div>
                  <div className="text-[10px] text-slate-400">{v.channel}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive Visual Illustration Card (Real-world Wikipedia imagery & custom AI artwork)
const IllustrationCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  let data: any = {};
  try {
    data = JSON.parse(jsonString);
  } catch {
    return null;
  }

  const imageUrl = data.image_url;
  const title = data.title || "Visual Illustration";
  const source = data.source || "Illustration";
  const caption = data.caption || "";
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  if (!imageUrl || imageError) return null;

  return (
    <div className="my-3.5 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#13161c] p-3 md:p-4 shadow-sm space-y-2.5 max-w-xl">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <ImageIcon className="w-3.5 h-3.5 text-blue-500 dark:text-cyan-400" />
          <span>Visual Illustration &amp; Reference</span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]">
          {source}
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-slate-900/5 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] group">
        {!imageLoaded && (
          <div className="w-full h-48 md:h-64 flex items-center justify-center bg-slate-100 dark:bg-white/[0.04]">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        )}
        <img
          src={imageUrl}
          alt={title}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`w-full max-h-96 object-cover rounded-xl transition-all duration-300 ${imageLoaded ? "block" : "hidden"}`}
        />
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
        >
          <span>View High-Res</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate pr-2">{title}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{source}</span>
      </div>

      {caption && (
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-white/[0.05] pt-2">
          {caption}
        </p>
      )}
    </div>
  );
};

// Interactive AI Visual & Image Generation Asset Card
const ImageGenerationCard: React.FC<{ jsonString: string }> = ({ jsonString }) => {
  let initialData: any = {};
  try {
    initialData = JSON.parse(jsonString);
  } catch {
    return null;
  }

  const [currentData, setCurrentData] = useState<any>(initialData);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);

  // Regenerate & Tweak states
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isTweaking, setIsTweaking] = useState(false);
  const [tweakPrompt, setTweakPrompt] = useState<string>(initialData.prompt || "");
  const [tweakStyle, setTweakStyle] = useState<string>(initialData.style || "photorealistic");
  const [tweakAspect, setTweakAspect] = useState<string>(initialData.aspect_ratio || "1:1");
  const [regenError, setRegenError] = useState<string | null>(null);

  const rawUrl = currentData.url || "";
  const imageUrl = rawUrl.startsWith("http") ? rawUrl : `${API_BASE}${rawUrl}`;
  const prompt = currentData.prompt || "Generated Visual";
  const enhancedPrompt = currentData.enhanced_prompt || "";
  const style = (currentData.style || "photorealistic").replace(/_/g, " ");
  const aspectRatio = currentData.aspect_ratio || "1:1";

  // Aspect ratio class mapping
  const aspectClass =
    aspectRatio === "16:9"
      ? "aspect-video"
      : aspectRatio === "9:16"
      ? "aspect-[9/16] max-h-[480px]"
      : aspectRatio === "4:3"
      ? "aspect-[4/3]"
      : "aspect-square";

  const handleCopyPrompt = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleDownload = async () => {
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `okin-visual-${currentData.image_id || Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, "_blank");
    }
  };

  const handleRegenerate = async (customPrompt?: string, customStyle?: string, customAspect?: string) => {
    const activePrompt = (customPrompt !== undefined ? customPrompt : prompt).trim();
    const activeStyle = customStyle || currentData.style || "photorealistic";
    const activeAspect = customAspect || currentData.aspect_ratio || "1:1";
    if (!activePrompt) return;

    setIsRegenerating(true);
    setRegenError(null);
    setImageLoaded(false);

    try {
      const res = await generateVisual({
        prompt: activePrompt,
        style: activeStyle,
        aspect_ratio: activeAspect,
        enhance_prompt: true,
      });
      setCurrentData({
        ...currentData,
        ...res.image,
      });
      setTweakPrompt(res.image.prompt);
      setTweakStyle(res.image.style);
      setTweakAspect(res.image.aspect_ratio);
      setIsTweaking(false);
    } catch (err: any) {
      setRegenError(err?.message || "Could not regenerate visual. Please try again.");
      setImageLoaded(true);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <>
      <div className="my-4 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#13161c] p-3.5 md:p-4 shadow-sm space-y-3 max-w-xl transition-all">
        {/* Card Header with Aspect Ratio Badge */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-2.5">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {style}
            </span>
          </div>

          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] uppercase tracking-wider">
            {aspectRatio}
          </span>
        </div>

        {/* Image Preview Container with Shimmer & Hover Action Overlay */}
        <div
          className={`relative w-full ${aspectClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/90 dark:border-white/[0.08] group shadow-inner flex items-center justify-center`}
        >
          {(!imageLoaded || isRegenerating) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100/95 dark:bg-slate-900/95 animate-pulse backdrop-blur-xs">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500 dark:text-slate-400 mb-2" />
              <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                Okin is creating your visual...
              </span>
            </div>
          )}

          <img
            src={imageUrl}
            alt={prompt}
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] cursor-pointer ${
              imageLoaded && !isRegenerating ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setIsLightboxOpen(true)}
          />

          {/* Floating Action Overlay on Hover */}
          {imageLoaded && !isRegenerating && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-3 pointer-events-none">
              <div className="flex items-center justify-end gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white text-xs font-medium backdrop-blur-md transition-all cursor-pointer shadow-md"
                  title="Expand full-screen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pointer-events-auto">
                <p className="text-xs text-white/95 line-clamp-1 font-medium drop-shadow-md pr-2">
                  {prompt}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRegenerate()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white text-xs font-medium backdrop-blur-md shadow-md transition-all cursor-pointer"
                    title="Regenerate variation"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Regenerate</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-900 text-xs font-semibold shadow-md transition-all cursor-pointer"
                    title="Download high-resolution image"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Alert inside Card */}
        {regenError && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{regenError}</span>
          </div>
        )}

        {/* Footer Prompt & Action Row */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed line-clamp-2">
              &ldquo;{prompt}&rdquo;
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleRegenerate()}
                disabled={isRegenerating}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
                title="Regenerate visual"
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                <span>Regenerate</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTweakPrompt(prompt);
                  setTweakStyle(currentData.style || "photorealistic");
                  setTweakAspect(aspectRatio);
                  setIsTweaking((prev) => !prev);
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  isTweaking
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06]"
                }`}
                title="Tweak prompt, style, or aspect ratio"
              >
                <span>Tweak</span>
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Copy prompt"
              >
                {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Download image"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Inline Tweak / Iterate Editor */}
          {isTweaking && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0d0f15] border border-slate-200 dark:border-white/[0.1] space-y-2.5 animate-in fade-in duration-150">
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                Tweak &amp; Iterate Visual
              </div>
              <textarea
                value={tweakPrompt}
                onChange={(e) => setTweakPrompt(e.target.value)}
                rows={2}
                placeholder="Refine your visual prompt..."
                className="w-full rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.1] px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-400 dark:focus:border-white/[0.25] resize-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={tweakStyle}
                    onChange={(e) => setTweakStyle(e.target.value)}
                    className="rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="photorealistic">Photo / Realistic</option>
                    <option value="digital_illustration">Digital Illustration</option>
                    <option value="concept_art">Visual Reference / Concept Art</option>
                    <option value="minimalist_vector">Vector / Flat Graphic</option>
                    <option value="3d_render">3D Render</option>
                  </select>
                  <select
                    value={tweakAspect}
                    onChange={(e) => setTweakAspect(e.target.value)}
                    className="rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="1:1">Square (1:1)</option>
                    <option value="16:9">Landscape (16:9)</option>
                    <option value="9:16">Portrait (9:16)</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsTweaking(false)}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isRegenerating || !tweakPrompt.trim()}
                    onClick={() => handleRegenerate(tweakPrompt, tweakStyle, tweakAspect)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 text-[11px] font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>Generate Visual</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {enhancedPrompt && enhancedPrompt !== prompt && (
            <div>
              <button
                type="button"
                onClick={() => setShowEnhanced((prev) => !prev)}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>{showEnhanced ? "Hide refined visual prompt" : "View refined visual prompt"}</span>
              </button>
              {showEnhanced && (
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.03] p-2.5 rounded-lg border border-slate-200/80 dark:border-white/[0.06] leading-relaxed animate-in fade-in">
                  {enhancedPrompt}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Lightbox Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="w-full flex items-center justify-between text-white/90 px-2">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-semibold tracking-wider text-slate-300">
                  {style} ({aspectRatio})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(false)}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lightbox Image */}
            <div className="relative rounded-2xl overflow-hidden max-h-[70vh] border border-white/10 shadow-2xl bg-black">
              <img
                src={imageUrl}
                alt={prompt}
                className="w-full h-full object-contain max-h-[70vh]"
              />
            </div>

            {/* Prompt & Refined Prompt Details in Lightbox */}
            <div className="w-full bg-white/[0.08] backdrop-blur-md border border-white/10 rounded-xl p-3.5 text-white text-xs space-y-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">
                  Original Prompt
                </span>
                <div className="font-medium text-slate-100">&ldquo;{prompt}&rdquo;</div>
              </div>
              {enhancedPrompt && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-violet-400 font-semibold block mb-0.5">
                    Refined Prompt Used
                  </span>
                  <div className="text-[11px] text-slate-300 leading-relaxed max-h-24 overflow-y-auto">
                    {enhancedPrompt}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
