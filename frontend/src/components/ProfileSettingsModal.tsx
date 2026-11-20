"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  User,
  Mail,
  Phone,
  Calendar,
  Camera,
  Upload,
  Trash2,
  Sparkles,
  Check,
  ShieldCheck,
  KeyRound,
  UserPlus,
  ArrowRight,
  Crown,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Video,
  VideoOff,
} from "lucide-react";
import {
  UserProfile,
  updateUserProfile,
  getSavedAccounts,
  saveAccountToHistory,
  switchAccount,
} from "@/lib/auth";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onUpdateUser: (user: UserProfile) => void;
  onOpenAddAccount?: () => void;
  onOpenHelpIntegrations?: () => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onOpenAddAccount,
  onOpenHelpIntegrations,
}) => {
  const [activeTab, setActiveTab] = useState<"profile" | "subscription" | "accounts">("profile");

  // Form State
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [dob, setDob] = useState(currentUser?.dob || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || "");
  const [plan, setPlan] = useState<"free" | "pro" | "team">(currentUser?.plan || "pro");

  // Status feedback
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Camera stream state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // File input refs
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize form when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
      setPhone(currentUser.phone || "");
      setDob(currentUser.dob || "");
      setAvatarUrl(currentUser.avatarUrl || "");
      setPlan(currentUser.plan || "pro");
    }
  }, [currentUser]);

  // Stop active camera helper (declared before effects)
  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
    setCameraError(null);
  }, []);

  // Clean up camera on modal close or unmount
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  if (!isOpen) return null;

  const userInitial = (name.trim()[0] || email.trim()[0] || "U").toUpperCase();

  // Start live webcam capture
  const startCamera = async () => {
    setCameraError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Fallback directly to native camera input
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err: any) {
      // If permission denied or camera unavailable, fallback to file input capture
      setCameraError("Camera unavailable. You can choose a photo from files.");
      cameraInputRef.current?.click();
    }
  };

  // Snap photo from active video stream
  const capturePhotoFromStream = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 320;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setAvatarUrl(dataUrl);
        // Persist immediately to active profile
        const updated = updateUserProfile({ avatarUrl: dataUrl });
        if (updated) onUpdateUser(updated);
      }
    } catch (e) {
      setCameraError("Could not capture image from stream.");
    } finally {
      stopCamera();
    }
  };

  // Handle uploaded or captured image file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSaveError("Please select a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAvatarUrl(dataUrl);
        const updated = updateUserProfile({ avatarUrl: dataUrl });
        if (updated) onUpdateUser(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Remove photo
  const handleRemovePhoto = () => {
    setAvatarUrl("");
    const updated = updateUserProfile({ avatarUrl: undefined });
    if (updated) onUpdateUser(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Save changes to profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setSaveError("Please enter a valid email address.");
      return;
    }

    const updated = updateUserProfile({
      name: cleanName || "Okin User",
      email: cleanEmail,
      phone: phone.trim(),
      dob: dob.trim(),
      avatarUrl: avatarUrl || undefined,
      plan,
    });

    if (updated) {
      onUpdateUser(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError("Failed to update profile.");
    }
  };

  // Switch account from saved accounts list
  const handleSwitch = (userId: string) => {
    const switched = switchAccount(userId);
    if (switched) {
      onUpdateUser(switched);
      onClose();
    }
  };

  const savedAccounts = getSavedAccounts();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Profile Settings"
    >
      {/* Hidden File Inputs for Gallery & Native Camera */}
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="relative w-full max-w-xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors duration-400">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.07] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
              Settings &amp; Profile
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage your personal information, profile photo, and subscription.
            </p>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 flex gap-2 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("profile");
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "profile"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("subscription");
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "subscription"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Subscription</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 uppercase">
              {plan}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("accounts");
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "accounts"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Accounts</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Success Banner */}
          {saveSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Profile updated successfully! Changes reflected immediately.</span>
            </div>
          )}

          {/* Error Banner */}
          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* ----------------- TAB 1: PROFILE ----------------- */}
          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Profile Photo Management */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex flex-col sm:flex-row items-center gap-4">
                {/* Photo Display / Stream Preview */}
                <div className="relative shrink-0">
                  {isCameraActive ? (
                    <div className="relative w-20 h-20 rounded-full overflow-hidden ring-4 ring-emerald-500/40 shadow-md bg-black flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                    </div>
                  ) : avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-300 dark:ring-white/[0.15] shadow-sm"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-white font-bold flex items-center justify-center text-2xl shadow-sm">
                      {userInitial}
                    </div>
                  )}
                </div>

                {/* Upload & Camera Controls */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Profile Picture
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Upload from files or capture directly from your device camera.
                  </p>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    {isCameraActive ? (
                      <>
                        <button
                          type="button"
                          onClick={capturePhotoFromStream}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Snap Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-200 hover:bg-slate-300 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload File</span>
                        </button>

                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-white/[0.12] hover:bg-slate-200/60 dark:hover:bg-white/[0.06] text-slate-800 dark:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Use Camera</span>
                        </button>

                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Remove custom photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {cameraError && (
                    <p className="text-[11px] text-amber-500 font-medium pt-1">
                      {cameraError}
                    </p>
                  )}
                </div>
              </div>

              {/* Form Input Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* User Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    User Name
                  </label>
                  <div className="relative flex items-center">
                    <User className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Email Address */}
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
                      className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Date of Birth
                  </label>
                  <div className="relative flex items-center">
                    <Calendar className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenHelpIntegrations) onOpenHelpIntegrations();
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Security PIN &amp; Integrations</span>
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black font-semibold text-xs shadow-md transition-all cursor-pointer active:scale-[0.99] flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          )}

          {/* ----------------- TAB 2: SUBSCRIPTION ----------------- */}
          {activeTab === "subscription" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-tr from-amber-500/10 via-emerald-500/10 to-transparent border border-amber-500/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                      Okin {plan.toUpperCase()}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Unlimited Gemini 2.5, GPT-4o, live audio synthesis, and sandboxed code execution.
                  </p>
                </div>
              </div>

              {/* Plan Features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  "Unlimited LLM Reasoning & Search",
                  "Whisper Speech-to-Text & Live Voice",
                  "Python Code Execution Sandbox",
                  "Custom Artifacts & Projects",
                  "Interactive OpenStreetMap Navigation",
                  "Cross-Session Personal Memory",
                ].map((feat) => (
                  <div
                    key={feat}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">{feat}</span>
                  </div>
                ))}
              </div>

              {/* Plan Switcher / Upgrade */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.07] flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Plan renewal: Auto-renews monthly
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = plan === "pro" ? "free" : "pro";
                      setPlan(next);
                      const updated = updateUserProfile({ plan: next });
                      if (updated) onUpdateUser(updated);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-white/[0.12] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    Switch to {plan === "pro" ? "Free" : "Pro"} Plan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ----------------- TAB 3: ACCOUNTS & SWITCHING ----------------- */}
          {activeTab === "accounts" && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Switch between your active accounts or connect another profile to this session.
              </div>

              {/* Current Account */}
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.name}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/40"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-white font-bold flex items-center justify-center text-xs">
                      {userInitial}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{currentUser?.name || "Active Account"}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-500 text-white">
                        Current
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {currentUser?.email}
                    </div>
                  </div>
                </div>
              </div>

              {/* Saved Accounts List */}
              {savedAccounts.filter((a) => a.id !== currentUser?.id).length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                    Other Accounts on this Device
                  </div>
                  {savedAccounts
                    .filter((a) => a.id !== currentUser?.id)
                    .map((acc) => (
                      <div
                        key={acc.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.03] flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          {acc.avatarUrl ? (
                            <img
                              src={acc.avatarUrl}
                              alt={acc.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/[0.1] text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-center text-xs">
                              {(acc.name[0] || acc.email[0] || "U").toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                              {acc.name}
                            </div>
                            <div className="text-[11px] text-slate-400">{acc.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSwitch(acc.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.14] text-slate-800 dark:text-white transition-colors cursor-pointer"
                        >
                          Switch
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {/* Add Account Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenAddAccount) onOpenAddAccount();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.15] hover:border-emerald-500 hover:bg-emerald-500/5 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold text-xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add another account</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
