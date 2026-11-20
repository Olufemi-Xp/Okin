"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { exchangeGmailCode } from "@/lib/api";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { PeacockLogo } from "@/components/PeacockLogo";

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [userEmail, setUserEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasExchangedRef = useRef(false);

  useEffect(() => {
    if (hasExchangedRef.current) return;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMessage(`Google authorization was denied or canceled: ${error}`);
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code provided in callback URL.");
      return;
    }

    hasExchangedRef.current = true;
    const redirectUri = window.location.origin + "/gmail-callback";

    exchangeGmailCode(code, redirectUri)
      .then((res) => {
        setStatus("success");
        setUserEmail(res.email);
        setTimeout(() => {
          router.push("/");
        }, 2200);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMessage(err.message || "Failed to exchange authorization code.");
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0d0f14] text-slate-100">
      <div className="max-w-md w-full bg-[#13161c] border border-white/[0.08] rounded-2xl shadow-2xl p-7 text-center">
        {/* App Logo */}
        <div className="flex justify-center mb-4">
          <PeacockLogo isThinking={status === "loading"} className="w-8 h-8" />
        </div>

        {status === "loading" && (
          <div className="space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
            <h2 className="text-lg font-semibold tracking-tight">Connecting Gmail...</h2>
            <p className="text-xs text-slate-400">Exchanging credentials securely with Google.</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3 animate-in fade-in">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-semibold tracking-tight text-white">Gmail Connected!</h2>
            <p className="text-xs text-slate-300">
              Successfully linked account: <span className="font-semibold text-emerald-300">{userEmail}</span>
            </p>
            <p className="text-[11px] text-slate-500 pt-2">Returning to Okin in a moment...</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white text-black hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              <span>Back to Chat</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3 animate-in fade-in">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <h2 className="text-lg font-semibold tracking-tight text-red-200">Connection Failed</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{errorMessage}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white text-black hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              <span>Return to Okin</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GmailCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0d0f14] text-slate-400 text-sm">
          Loading Gmail callback...
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
