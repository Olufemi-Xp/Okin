"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  Sun,
  Moon,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { PeacockLogo } from "./PeacockLogo";
import { PageTransitionOverlay } from "./PageTransitionOverlay";
import {
  UserProfile,
  signInWithCredentials,
  signUpWithCredentials,
  signInWithGoogle,
} from "@/lib/auth";

interface AuthViewProps {
  onSignInSuccess: (user: UserProfile) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onSignInSuccess,
  isDarkMode,
  onToggleTheme,
}) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("Signing into Okin...");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [googleInitialized, setGoogleInitialized] = useState(false);

  // Initialize Google Identity Services if client ID is configured
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || typeof window === "undefined") return;

    const initGsi = () => {
      const g = (window as any).google;
      if (g?.accounts?.id) {
        try {
          g.accounts.id.initialize({
            client_id: clientId,
            callback: async (response: any) => {
              if (response?.credential) {
                setTransitionMessage("Verifying Google account...");
                setIsLoading(true);
                setErrorMsg(null);
                try {
                  const user = await signInWithGoogle(response.credential);
                  onSignInSuccess(user);
                } catch (err: any) {
                  setErrorMsg(err.message || "Google authentication failed. Please try again.");
                  setIsLoading(false);
                }
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          if (googleBtnRef.current) {
            googleBtnRef.current.innerHTML = "";
            g.accounts.id.renderButton(googleBtnRef.current, {
              theme: isDarkMode ? "filled_black" : "outline",
              size: "large",
              shape: "rectangular",
              text: "continue_with",
              width: 320,
              logo_alignment: "left",
            });
          }
          setGoogleInitialized(true);
        } catch (e) {
          console.error("Failed to render Google button:", e);
        }
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGsi();
    } else {
      const timer = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(timer);
          initGsi();
        }
      }, 250);
      return () => clearInterval(timer);
    }
  }, [isDarkMode, onSignInSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (password.length < 4) {
      setErrorMsg("Password must be at least 4 characters.");
      return;
    }

    setTransitionMessage(mode === "signup" ? "Creating your account..." : "Signing into Okin...");
    setIsLoading(true);

    try {
      let user: UserProfile;
      if (mode === "signup") {
        user = await signUpWithCredentials(cleanEmail, password, name);
      } else {
        user = await signInWithCredentials(cleanEmail, password);
      }
      onSignInSuccess(user);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to authenticate. Please check your credentials.");
      setIsLoading(false);
    }
  };

  const handleGoogleSignInClick = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setErrorMsg(
        "Google Client ID is not configured yet. Please add NEXT_PUBLIC_GOOGLE_CLIENT_ID to your Vercel environment variables, or sign in below with email and password."
      );
      return;
    }

    const g = typeof window !== "undefined" ? (window as any).google : null;
    if (g?.accounts?.id) {
      setErrorMsg(null);
      g.accounts.id.prompt();
    } else {
      setErrorMsg("Google Sign-In is still loading. Please check your internet connection and try again.");
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-[#f8fafc] dark:bg-[#090a0d] text-slate-900 dark:text-slate-100 transition-colors duration-400 relative overflow-hidden select-none">
      {/* Page Transition Overlay with Animated 3D Peacock */}
      <PageTransitionOverlay
        isVisible={isLoading}
        message={transitionMessage}
        onClear={() => setIsLoading(false)}
      />

      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[450px] h-[300px] bg-indigo-500/10 blur-3xl pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <PeacockLogo className="w-[22px] h-[22px] shrink-0" />
          <span className="font-semibold text-sm tracking-tight text-slate-800 dark:text-slate-100">
            Okin
          </span>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
          title={isDarkMode ? "Switch to Light mode" : "Switch to Dark mode"}
          aria-label="Toggle theme"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-500" />
          )}
        </button>
      </header>

      {/* Center Auth Card */}
      <main className="flex-1 flex items-center justify-center p-4 z-10">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13161c] border border-slate-200/90 dark:border-white/[0.08] shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-md transition-all">
          {/* Card Header with Standalone Peacock Logo (No square box, border, or background container) */}
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-1">
              <PeacockLogo className="w-9 h-9" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mode === "signin" ? "Welcome back to Okin" : "Create your Okin account"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {mode === "signin"
                ? "Sign in to access your conversations and workspace."
                : "Get started with your intelligent workspace."}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.04] p-1 border border-slate-200/70 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === "signin"
                  ? "bg-white dark:bg-[#1c202a] text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === "signup"
                  ? "bg-white dark:bg-[#1c202a] text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Google Sign-In Container */}
          <div className="w-full flex flex-col items-center justify-center">
            {/* Native GSI Rendered Button */}
            <div
              ref={googleBtnRef}
              className={`w-full flex justify-center min-h-[44px] ${googleInitialized ? "flex" : "hidden"}`}
            />

            {/* Custom Styled Button (Displayed before GSI loads or if Client ID is needed) */}
            {!googleInitialized && (
              <button
                type="button"
                onClick={handleGoogleSignInClick}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white hover:bg-slate-50 dark:bg-[#181c24] dark:hover:bg-[#1f242e] text-slate-800 dark:text-slate-100 text-xs font-semibold shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-[0.99] disabled:opacity-50"
              >
                {/* Google 4-Color G Logo SVG */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200 dark:border-white/[0.08]" />
            <span className="absolute bg-white dark:bg-[#13161c] px-3 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Or with email
            </span>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "signup" && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs pl-9 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black font-semibold text-xs shadow-md transition-all cursor-pointer active:scale-[0.99] disabled:opacity-50 mt-2"
            >
              <span>{mode === "signin" ? "Sign In" : "Create Account"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs text-slate-400 dark:text-slate-500 z-10 tracking-wide select-none">
        OKIN, your personal AI assistant
      </footer>
    </div>
  );
};
