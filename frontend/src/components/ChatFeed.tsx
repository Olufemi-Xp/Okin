"use client";

import React, { useEffect, useRef } from "react";
import { Message } from "@/lib/api";
import { MessageBubble } from "./MessageBubble";
import { PeacockLogo } from "./PeacockLogo";
import { Loader2 } from "lucide-react";

interface ChatFeedProps {
  messages: Message[];
  isThinking: boolean;
  thinkingStatus: string;
  generatingAspectRatio?: string;
  isColdStarting: boolean;
  onSelectPrompt: (prompt: string) => void;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  isThinking,
  thinkingStatus,
  generatingAspectRatio = "1:1",
  isColdStarting,
  onSelectPrompt,
}) => {
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Smooth follow-scroll during streaming reveal (only when user is near bottom)
  const handleStreamScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = feedContainerRef.current;
      if (el) {
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceToBottom < 220) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });
  };

  useEffect(() => {
    const el = feedContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, isThinking, thinkingStatus, isColdStarting]);

  const starterCards = [
    {
      title: "Create a visual",
      prompt: "/imagine A futuristic floating city at sunset with neon waterfalls, photorealistic 8k",
    },
    {
      title: "Check & summarize inbox",
      prompt: "Check my Gmail inbox, summarize recent emails, and let me know if any require a reply.",
    },
    {
      title: "Search the web",
      prompt: "What are today's top tech headlines and breakthroughs?",
    },
    {
      title: "Run Python code",
      prompt: "Write and execute a Python script to calculate the first 15 Fibonacci numbers and print the sequence.",
    },
  ];

  return (
    <div ref={feedContainerRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8 flex flex-col items-center">
      {/* Cold Start Banner */}
      {isColdStarting && (
        <div className="mb-4 w-full max-w-2xl px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2 transition-colors duration-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Connecting to server (~3 seconds cold start)...</span>
        </div>
      )}

      {/* Empty State */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl text-center my-auto py-12">
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2 tracking-tight transition-colors duration-400">
            How can I help you today?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-8 max-w-md transition-colors duration-400">
            Ask questions, analyze documents, run Python scripts, or search the live web.
          </p>

          {/* Starter Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
            {starterCards.map((card, idx) => (
              <button
                key={idx}
                onClick={() => onSelectPrompt(card.prompt)}
                className="p-3.5 rounded-xl border border-slate-200/90 hover:border-slate-300 bg-white hover:bg-slate-50 dark:border-white/[0.08] dark:bg-[#13161c]/60 dark:hover:bg-[#13161c] dark:hover:border-white/[0.14] transition-all duration-300 text-left flex flex-col justify-between group cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="mb-1">
                  <span className="text-xs font-medium text-slate-800 group-hover:text-slate-900 dark:text-slate-200 dark:group-hover:text-white transition-colors">
                    {card.title}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 transition-colors">
                  {card.prompt}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl flex-1">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onStreamUpdate={handleStreamScroll}
            />
          ))}

          {/* Animated Thinking Indicator or Image Generating Shimmer Card */}
          {isThinking && (
            <div className="mb-7 animate-in fade-in duration-300 overflow-visible">
              {thinkingStatus.includes("creating your visual") || thinkingStatus.includes("illustrating") ? (
                <div className="flex flex-col gap-2.5 max-w-xl">
                  <div className="flex items-center gap-2 overflow-visible py-0.5">
                    <div className="p-1 overflow-visible flex items-center justify-center">
                      <PeacockLogo isThinking={true} className="w-[22px] h-[22px] shrink-0" />
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Okin is creating your visual...
                    </span>
                  </div>
                  <div
                    className={`w-full ${
                      generatingAspectRatio === "16:9"
                        ? "aspect-video max-w-xl"
                        : generatingAspectRatio === "9:16"
                        ? "aspect-[9/16] max-h-[420px] max-w-xs"
                        : "aspect-square max-w-md"
                    } rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-100/80 dark:bg-white/[0.03] animate-pulse flex flex-col items-center justify-center p-6 text-center shadow-inner`}
                  >
                    <Loader2 className="w-6 h-6 animate-spin text-slate-500 dark:text-slate-400 mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Okin is creating your visual ({generatingAspectRatio})...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-1.5 px-1 overflow-visible">
                  <div className="p-1 overflow-visible flex items-center justify-center">
                    <PeacockLogo isThinking={true} className="w-[22px] h-[22px] shrink-0" />
                  </div>
                  {thinkingStatus && thinkingStatus !== "Thinking..." && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2.5 py-1 rounded-full bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.06] animate-in fade-in duration-200">
                      {thinkingStatus}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div ref={feedEndRef} />
        </div>
      )}
    </div>
  );
};
