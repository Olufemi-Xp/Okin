"use client";

import React from "react";

interface PeacockLogoProps {
  isThinking?: boolean;
  className?: string;
  size?: number;
  title?: string;
}

/**
 * 3D Rolling Animated Okin Peacock Logo
 * - Displays the authentic Okin peacock asset in pristine fidelity.
 * - When isThinking/isLoading is active: performs a prominent, smooth 3D roll/tumble
 *   along a tilted axis (rotateY, rotateX, rotateZ) with dynamic 3D depth, specular sheen,
 *   and an iridescent cyber-glow aura.
 * - When response arrives (isThinking becomes false): smoothly settles and eases back
 *   to its flat, upright resting orientation.
 * - Respects prefers-reduced-motion with an accessible gentle pulse fallback.
 */
export const PeacockLogo: React.FC<PeacockLogoProps> = ({
  isThinking = false,
  className = "w-[22px] h-[22px]",
  size,
  title = "Okin",
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none overflow-visible ${className}`}
      style={{
        ...(size ? { width: size, height: size } : {}),
        perspective: "600px",
      }}
      title={title}
      aria-label={title}
    >
      <style>{`
        @keyframes okin3DRoll {
          0% {
            transform: rotateX(12deg) rotateY(0deg) rotateZ(-4deg) scale3d(1.04, 1.04, 1.04);
            filter: drop-shadow(0 2px 6px rgba(6, 182, 212, 0.55)) drop-shadow(0 0 10px rgba(16, 185, 129, 0.35)) brightness(1.06);
          }
          25% {
            transform: rotateX(-8deg) rotateY(90deg) rotateZ(6deg) scale3d(0.95, 0.95, 0.95);
            filter: drop-shadow(1px 1px 8px rgba(59, 130, 246, 0.65)) drop-shadow(0 0 6px rgba(6, 182, 212, 0.45)) brightness(1.18);
          }
          50% {
            transform: rotateX(-14deg) rotateY(180deg) rotateZ(10deg) scale3d(1.03, 1.03, 1.03);
            filter: drop-shadow(0 -2px 8px rgba(16, 185, 129, 0.6)) drop-shadow(0 0 12px rgba(6, 182, 212, 0.4)) brightness(1.1);
          }
          75% {
            transform: rotateX(8deg) rotateY(270deg) rotateZ(2deg) scale3d(0.96, 0.96, 0.96);
            filter: drop-shadow(-1px 2px 8px rgba(245, 158, 11, 0.55)) drop-shadow(0 0 6px rgba(6, 182, 212, 0.5)) brightness(1.22);
          }
          100% {
            transform: rotateX(12deg) rotateY(360deg) rotateZ(-4deg) scale3d(1.04, 1.04, 1.04);
            filter: drop-shadow(0 2px 6px rgba(6, 182, 212, 0.55)) drop-shadow(0 0 10px rgba(16, 185, 129, 0.35)) brightness(1.06);
          }
        }

        @keyframes okinOrbitalGlow {
          0%, 100% {
            opacity: 0.5;
            transform: scale(0.95);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.1);
          }
        }

        .okin-3d-rolling {
          animation: okin3DRoll 2.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
          transform-style: preserve-3d;
          will-change: transform, filter;
        }

        .okin-3d-settled {
          transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale3d(1, 1, 1);
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
          transition: transform 0.75s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.6s ease;
          transform-style: preserve-3d;
          will-change: transform, filter;
        }

        @media (prefers-reduced-motion: reduce) {
          .okin-3d-rolling {
            animation: none !important;
            transform: none !important;
            filter: drop-shadow(0 0 6px rgba(6, 182, 212, 0.7)) !important;
          }
        }
      `}</style>

      {/* Luminous Orbital Glow Ring Behind Logo During Active Processing */}
      {isThinking && (
        <span
          className="absolute -inset-1 rounded-full pointer-events-none blur-sm bg-gradient-to-tr from-cyan-500/35 via-emerald-500/40 to-blue-600/35"
          style={{
            animation: "okinOrbitalGlow 2s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      )}

      {/* The 3D Rolling Peacock Element */}
      <div
        className={`relative z-10 w-full h-full flex items-center justify-center ${
          isThinking ? "okin-3d-rolling" : "okin-3d-settled"
        }`}
      >
        <img
          src="/okin.png"
          alt="Okin Peacock Logo"
          className="w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      </div>
    </div>
  );
};
