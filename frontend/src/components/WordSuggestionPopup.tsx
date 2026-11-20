"use client";

import React from "react";
import { Sparkles, Wand2, X, Check } from "lucide-react";
import { SuggestionItem } from "@/lib/wordSuggestions";

interface WordSuggestionPopupProps {
  suggestions: SuggestionItem[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onAccept: (item: SuggestionItem) => void;
  onDismiss: () => void;
}

export const WordSuggestionPopup: React.FC<WordSuggestionPopupProps> = ({
  suggestions,
  selectedIndex,
  onSelectIndex,
  onAccept,
  onDismiss,
}) => {
  if (!suggestions || suggestions.length === 0) return null;

  const topItem = suggestions[0];
  const isCorrection = topItem.type === "correction";

  return (
    <div
      className="absolute bottom-full left-3 mb-2 z-30 flex items-center gap-1.5 p-1 px-1.5 rounded-xl bg-white/95 dark:bg-[#181c24]/95 border border-slate-200/90 dark:border-white/[0.12] shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 select-none max-w-[calc(100%-24px)] overflow-x-auto scrollbar-none"
      role="listbox"
      aria-label="Word suggestions"
    >
      {/* Icon / Mode indicator */}
      <div className="flex items-center gap-1 px-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 shrink-0">
        {isCorrection ? (
          <>
            <Wand2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="hidden sm:inline text-amber-600/90 dark:text-amber-400/90">Did you mean:</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-cyan-400" />
            <span className="hidden sm:inline text-slate-500 dark:text-slate-400">Suggest:</span>
          </>
        )}
      </div>

      {/* Suggestion Chips */}
      <div className="flex items-center gap-1 shrink-0">
        {suggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={`${item.word}-${idx}`}
              type="button"
              onMouseDown={(e) => {
                // Prevent textarea from losing focus
                e.preventDefault();
                onAccept(item);
              }}
              onMouseEnter={() => onSelectIndex(idx)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                isSelected
                  ? item.type === "correction"
                    ? "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200 border border-amber-500/30 shadow-xs"
                    : "bg-blue-500/15 text-blue-800 dark:bg-cyan-500/20 dark:text-cyan-200 border border-blue-500/30 dark:border-cyan-500/30 shadow-xs"
                  : "bg-slate-100/70 hover:bg-slate-200/80 text-slate-700 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:text-slate-300 border border-transparent"
              }`}
            >
              <span>{item.word}</span>
              {isSelected && (
                <span className="hidden md:inline-flex items-center ml-1 px-1 py-0.2 rounded bg-slate-900/10 dark:bg-white/10 text-[9px] font-mono text-slate-500 dark:text-slate-300">
                  Tab ⇥
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dismiss Button */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onDismiss();
        }}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors shrink-0 ml-0.5"
        title="Dismiss suggestions (Esc)"
        aria-label="Dismiss suggestions"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
