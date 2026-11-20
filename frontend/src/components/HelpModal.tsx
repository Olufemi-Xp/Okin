"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Mic,
  FileText,
  Terminal,
  RotateCcw,
  KeyRound,
  Check,
  Mail,
  Upload,
  ExternalLink,
  Loader2,
  AlertCircle,
  Unplug,
} from "lucide-react";
import {
  getStoredAccessPin,
  setStoredAccessPin,
} from "@/lib/session";
import {
  fetchGmailStatus,
  uploadGmailCredentials,
  fetchGmailAuthUrl,
  exchangeGmailCode,
  disconnectGmail,
  GmailStatus,
} from "@/lib/api";
import { PeacockLogo } from "./PeacockLogo";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPinRequired?: boolean;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  isPinRequired = false,
}) => {
  const [pinInput, setPinInput] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Gmail OAuth State
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>({
    configured: false,
    authenticated: false,
    email: null,
  });
  const [isLoadingGmail, setIsLoadingGmail] = useState(false);
  const [gmailNotice, setGmailNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [showManualCodeInput, setShowManualCodeInput] = useState(false);
  const credsFileRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    const status = await fetchGmailStatus();
    setGmailStatus(status);
  };

  useEffect(() => {
    if (isOpen) {
      setPinInput(getStoredAccessPin() || "");
      setSavedSuccess(false);
      setGmailNotice(null);
      loadStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredAccessPin(pinInput);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  // Upload credentials.json
  const handleUploadCredentials = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingGmail(true);
    setGmailNotice(null);
    try {
      await uploadGmailCredentials(file);
      setGmailNotice({ text: "credentials.json uploaded successfully!", type: "success" });
      await loadStatus();
    } catch (err: any) {
      setGmailNotice({ text: err.message || "Upload failed.", type: "error" });
    } finally {
      setIsLoadingGmail(false);
      if (credsFileRef.current) credsFileRef.current.value = "";
    }
  };

  // Launch Google OAuth flow
  const handleConnectGmail = async () => {
    setIsLoadingGmail(true);
    setGmailNotice(null);
    try {
      const redirectUri = window.location.origin + "/gmail-callback";
      const res = await fetchGmailAuthUrl(redirectUri);
      if (res && res.auth_url) {
        // Open Google OAuth consent page
        window.location.href = res.auth_url;
      }
    } catch (err: any) {
      setGmailNotice({
        text: err.message || "Failed to generate Google authorization URL. Please check credentials.json.",
        type: "error",
      });
      setShowManualCodeInput(true);
      setIsLoadingGmail(false);
    }
  };

  // Manual code exchange (if user used Desktop app OAuth)
  const handleExchangeManualCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setIsLoadingGmail(true);
    setGmailNotice(null);
    try {
      const redirectUri = window.location.origin + "/gmail-callback";
      const res = await exchangeGmailCode(manualCode.trim(), redirectUri);
      setGmailNotice({ text: `Connected as ${res.email}!`, type: "success" });
      setManualCode("");
      setShowManualCodeInput(false);
      await loadStatus();
    } catch (err: any) {
      setGmailNotice({ text: err.message || "Invalid authorization code.", type: "error" });
    } finally {
      setIsLoadingGmail(false);
    }
  };

  // Disconnect Gmail
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your Gmail account?")) return;
    setIsLoadingGmail(true);
    setGmailNotice(null);
    try {
      await disconnectGmail();
      setGmailNotice({ text: "Gmail account disconnected.", type: "success" });
      await loadStatus();
    } catch (err: any) {
      setGmailNotice({ text: err.message || "Failed to disconnect.", type: "error" });
    } finally {
      setIsLoadingGmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl p-6 text-slate-800 dark:text-slate-200 max-h-[90vh] overflow-y-auto transition-colors duration-400">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
          title="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <PeacockLogo className="w-6 h-6 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">Settings &amp; Integrations</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure Gmail, security PIN, and capabilities</p>
          </div>
        </div>

        {/* --- GMAIL INTEGRATION SECTION --- */}
        <div className="mb-6 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.03] dark:bg-red-950/10 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Mail className="w-4 h-4 text-red-500" />
              <span>Gmail Account Integration</span>
            </div>
            {gmailStatus.authenticated ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Connected</span>
              </span>
            ) : gmailStatus.configured ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Setup Pending</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400">
                Not Configured
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
            Allows Okin to check recent inbox activities, summarize incoming emails, prepare draft replies, and send approved emails for you.
          </p>

          {/* Feedback notice */}
          {gmailNotice && (
            <div
              className={`mb-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                gmailNotice.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-600 dark:text-red-300 border border-red-500/20"
              }`}
            >
              {gmailNotice.type === "success" ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{gmailNotice.text}</span>
            </div>
          )}

          {/* State 1: Authenticated */}
          {gmailStatus.authenticated ? (
            <div className="p-3 rounded-lg bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Connected Account:</span>
                <span className="text-xs font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                  {gmailStatus.email}
                </span>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={isLoadingGmail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20 border border-red-200 dark:border-red-900/30 transition-colors"
                title="Disconnect Gmail account"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            /* State 2: Not authenticated */
            <div className="space-y-3">
              {/* Credentials Upload */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={credsFileRef}
                  accept=".json,application/json"
                  onChange={handleUploadCredentials}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => credsFileRef.current?.click()}
                  disabled={isLoadingGmail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors border border-slate-300 dark:border-white/[0.08]"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{gmailStatus.configured ? "Replace credentials.json" : "Upload credentials.json"}</span>
                </button>

                {gmailStatus.configured && (
                  <button
                    type="button"
                    onClick={handleConnectGmail}
                    disabled={isLoadingGmail}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium shadow-xs shadow-red-600/30 transition-all cursor-pointer"
                  >
                    {isLoadingGmail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    <span>Connect Gmail Account</span>
                  </button>
                )}
              </div>

              {/* Instructions on getting credentials.json */}
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                Don&apos;t have credentials yet? Create an OAuth Client ID in your{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 underline inline-flex items-center gap-0.5 hover:text-emerald-500"
                >
                  <span>Google Cloud Console</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>{" "}
                (Desktop or Web Application), enable the <strong>Gmail API</strong>, and download `credentials.json`.
              </p>

              {/* Manual Auth Code Toggle */}
              {gmailStatus.configured && (
                <div className="pt-1">
                  {!showManualCodeInput ? (
                    <button
                      type="button"
                      onClick={() => setShowManualCodeInput(true)}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline"
                    >
                      Enter authorization code manually
                    </button>
                  ) : (
                    <form onSubmit={handleExchangeManualCode} className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Paste Google authorization code (4/0A...)"
                        className="flex-1 bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isLoadingGmail}
                        className="px-3 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium"
                      >
                        Submit
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PIN Configuration Box */}
        <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] transition-colors">
          <div className="flex items-center gap-2 mb-1.5 text-xs font-medium text-slate-800 dark:text-slate-200">
            <KeyRound className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Backend Access PIN {isPinRequired && "(Required)"}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
            If your server has an <code className="text-emerald-600 dark:text-slate-300">APP_ACCESS_PIN</code> configured, enter it below to authenticate.
          </p>

          <form onSubmit={handleSavePin} className="flex gap-2">
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter PIN (e.g. 1234)"
              className="flex-1 bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-slate-500 dark:focus:border-white/[0.2] transition-colors"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Save</span>
              )}
            </button>
          </form>
        </div>

        {/* Capabilities Guide */}
        <div className="space-y-3.5 text-xs">
          {/* Email */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:bg-white/[0.04] dark:text-red-400 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-200">Gmail Assistant</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Check recent emails, summarize unread messages, draft replies, and send emails directly with preview confirmation.
              </p>
            </div>
          </div>

          {/* Voice */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-white/[0.04] dark:text-slate-400 shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-200">Voice Conversation</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Click the microphone icon to dictate into chat, or click the Live Voice button for a conversational voice chat with Okin.
              </p>
            </div>
          </div>

          {/* Files */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-white/[0.04] dark:text-slate-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-200">File &amp; Document Analysis</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Attach PDFs, text documents, code files (<code className="text-slate-700 dark:text-slate-300">.py, .js, .json</code>), images, or video up to 25MB.
              </p>
            </div>
          </div>

          {/* Code */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:bg-white/[0.04] dark:text-slate-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-200">Python Sandbox</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Execute Python code in an isolated sandbox environment. Okin runs code securely and returns execution outputs.
              </p>
            </div>
          </div>

          {/* Memory */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:bg-white/[0.04] dark:text-slate-400 shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-200">Continuous Memory</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Okin remembers key facts across chats. Type <code className="text-slate-700 dark:text-slate-300">/forget</code> or click &ldquo;Clear memory&rdquo; in the sidebar anytime.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/[0.06] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
