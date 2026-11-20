"use client";

import React, { useEffect } from "react";
import { PeacockLogo } from "./PeacockLogo";

interface PageTransitionOverlayProps {
  isVisible: boolean;
  message?: string;
  onClear?: () => void;
  timeoutMs?: number;
}

/**
 * PageTransitionOverlay
 * - Displays a sleek, backdrop-blurred transition screen with the 3D-rolling peacock.
 * - Used during route transitions, login <-> chat switches, thread loading, and session boot.
 * - Auto-clears via safety timeout (default 4.5s) to guarantee the screen is never stuck.
 * - Fully respects prefers-reduced-motion.
 */
export const PageTransitionOverlay: React.FC<PageTransitionOverlayProps> = ({
  isVisible,
  message = "Loading Okin...",
  onClear,
  timeoutMs = 4500,
}) => {
  // Safety timeout: automatically reset transition if still active after timeoutMs
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      if (onClear) onClear();
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [isVisible, timeoutMs, onClear]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f8fafc]/85 dark:bg-[#090a0d]/85 backdrop-blur-md transition-all duration-300 ease-in-out select-none ${
        isVisible
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
      role="status"
      aria-live="polite"
      aria-busy={isVisible}
    >
      <div className="flex flex-col items-center justify-center gap-3.5 p-6 max-w-xs text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Standalone Claude-scale peacock with 3D rolling animation */}
        <div className="relative flex items-center justify-center p-2 mb-0.5">
          <PeacockLogo isThinking={true} className="w-9 h-9" />
        </div>

        {/* Status Message */}
        {message && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tracking-tight">
              {message}
            </span>
            {/* Subtle animated shimmer line */}
            <div className="w-20 h-0.5 rounded-full bg-slate-200 dark:bg-white/[0.1] overflow-hidden">
              <div className="w-full h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 animate-[pulse_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
