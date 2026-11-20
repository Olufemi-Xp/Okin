"use client";

import React, { useState, useEffect, useRef } from "react";
import { Thread } from "@/lib/api";
import {
  MessageSquare,
  Plus,
  Trash2,
  PanelLeftClose,
  Moon,
  Sun,
  KeyRound,
  RotateCcw,
  Calendar,
  FolderKanban,
  Layers,
  Code2,
  SlidersHorizontal,
  User,
  Settings,
  Languages,
  HelpCircle,
  Info,
  Sparkles,
  Boxes,
  LogOut,
  Mail,
  Copy,
  Check,
  ChevronUp,
  UserPlus,
} from "lucide-react";
import { PeacockLogo } from "./PeacockLogo";
import {
  ProjectsModal,
  ArtifactsModal,
  CodeModal,
  PersonalizeModal,
  InfoDialog,
} from "./SidebarModals";
import { ProfileSettingsModal } from "./ProfileSettingsModal";
import { resetSessionId } from "@/lib/session";
import { UserProfile, signOutUser } from "@/lib/auth";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
  onDeleteThread: (threadId: string) => void;
  onClearMemory: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenHelp: () => void;
  onOpenOrganizer: () => void;
  isThinking?: boolean;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
  onUpdateUser?: (user: UserProfile) => void;
  onOpenAddAccount?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  onClearMemory,
  isOpen,
  onToggleOpen,
  isDarkMode,
  onToggleTheme,
  onOpenHelp,
  onOpenOrganizer,
  currentUser,
  onSignOut,
  onUpdateUser,
  onOpenAddAccount,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Upper section modal states
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Profile popover state & info dialogs
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [confirmClearMem, setConfirmClearMem] = useState(false);
  const [activeInfoDialog, setActiveInfoDialog] = useState<"language" | "upgrade" | "apps" | "learn" | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // User details dynamically derived from active auth session
  const userEmail = currentUser?.email || "";
  const userName = currentUser?.name || (userEmail ? userEmail.split("@")[0] : "Okin User");
  const userInitial = (userName.trim()[0] || userEmail.trim()[0] || "U").toUpperCase();

  // Close profile menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
        setConfirmClearMem(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfileMenuOpen(false);
        setConfirmClearMem(false);
      }
    };
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      onDeleteThread(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(userEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const handleContactSupport = () => {
    setProfileMenuOpen(false);
    window.location.href = `mailto:${userEmail}?subject=Okin%20Support%20Request`;
  };

  const handleLogOut = () => {
    setProfileMenuOpen(false);
    setConfirmClearMem(false);
    if (onSignOut) {
      onSignOut();
    } else {
      signOutUser();
      resetSessionId();
      onNewChat();
    }
  };

  const handleTriggerClearMemory = () => {
    if (confirmClearMem) {
      onClearMemory();
      setConfirmClearMem(false);
      setProfileMenuOpen(false);
    } else {
      setConfirmClearMem(true);
      setTimeout(() => setConfirmClearMem(false), 3500);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={onToggleOpen}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col h-full bg-slate-50 dark:bg-[#090a0d] text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-white/[0.07] transition-all duration-300 ease-in-out select-none ${
          isOpen
            ? "w-64 min-w-[16rem] translate-x-0 opacity-100"
            : "w-0 min-w-0 -translate-x-full md:translate-x-0 md:w-0 md:min-w-0 md:border-r-0 opacity-0 pointer-events-none overflow-hidden"
        }`}
      >
        <div className="w-64 flex flex-col h-full">
          {/* Brand & Collapse Header */}
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200 dark:border-white/[0.07] transition-colors duration-400">
            <div className="flex items-center gap-2">
              <PeacockLogo className="w-[22px] h-[22px] shrink-0" />
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 tracking-tight">Okin</span>
            </div>
            <button
              onClick={onToggleOpen}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
              title="Close sidebar"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Upper Section */}
          <div className="p-3 pb-2 space-y-1">
            {/* New Chat Action */}
            <button
              onClick={() => {
                onNewChat();
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  onToggleOpen();
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-200/80 hover:bg-slate-300/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white font-medium text-xs transition-colors border border-slate-300/80 dark:border-white/[0.08] shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New chat</span>
            </button>

            {/* Projects Button */}
            <button
              onClick={() => setProjectsOpen(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05] transition-colors"
            >
              <FolderKanban className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Projects</span>
            </button>

            {/* Artifacts Button */}
            <button
              onClick={() => setArtifactsOpen(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05] transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Artifacts</span>
            </button>

            {/* Code Button */}
            <button
              onClick={() => setCodeOpen(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05] transition-colors"
            >
              <Code2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Code</span>
            </button>

            {/* Personalize Okin Button */}
            <button
              onClick={() => setPersonalizeOpen(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05] transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Personalize Okin</span>
            </button>
          </div>

          <div className="mx-3 border-t border-slate-200 dark:border-white/[0.07] mb-1" />

          {/* Threads List (Recent) */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Recent
            </div>

            {threads.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                No conversations yet
              </div>
            ) : (
              threads.map((t) => {
                const isActive = t.id === activeThreadId;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      onSelectThread(t.id);
                      if (typeof window !== "undefined" && window.innerWidth < 768) {
                        onToggleOpen();
                      }
                    }}
                    className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors duration-150 ${
                      isActive
                        ? "bg-slate-200/90 text-slate-900 font-semibold shadow-xs dark:bg-white/[0.08] dark:text-white"
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="truncate">{t.title}</span>
                    </div>

                    <button
                      onClick={(e) => handleDelete(e, t.id)}
                      className={`opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-all ${
                        confirmDeleteId === t.id ? "opacity-100 text-red-500" : ""
                      }`}
                      title={confirmDeleteId === t.id ? "Confirm delete" : "Delete chat"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Lower Section (Schedule & Night/Day Toggle) */}
          <div className="p-2.5 border-t border-slate-200 dark:border-white/[0.07] space-y-0.5 transition-colors duration-400">
            {/* Schedule & Tasks */}
            <button
              onClick={onOpenOrganizer}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/[0.04] transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Schedule &amp; Tasks</span>
            </button>

            {/* Light / Dark Mode Toggle */}
            <button
              onClick={onToggleTheme}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/[0.04] transition-colors group"
              title={isDarkMode ? "Switch to Light mode" : "Switch to Dark mode"}
            >
              {isDarkMode ? (
                <Sun className="w-3.5 h-3.5 text-amber-400 transition-transform duration-300 group-hover:rotate-45 shrink-0" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-indigo-500 transition-transform duration-300 group-hover:-rotate-12 shrink-0" />
              )}
              <span>{isDarkMode ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>

          {/* Sidebar Footer with Profile Avatar & Menu */}
          <div ref={profileMenuRef} className="p-2.5 border-t border-slate-200 dark:border-white/[0.07] relative">
            {/* Profile Menu Popover */}
            {profileMenuOpen && (
              <div
                className="absolute bottom-full left-2 right-2 mb-2 bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.12] rounded-2xl shadow-2xl p-1.5 z-50 text-xs backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 transition-colors divide-y divide-slate-100 dark:divide-white/[0.06]"
                role="menu"
                aria-label="User Profile Menu"
              >
                {/* User Info Header - click opens Profile Settings */}
                <div
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setSettingsModalOpen(true);
                  }}
                  className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-white/[0.04] rounded-xl cursor-pointer transition-colors group/header"
                  title="Open Profile Settings"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {currentUser?.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt={userName}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-300 dark:ring-white/[0.15] shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-white font-semibold flex items-center justify-center text-xs shrink-0 shadow-xs">
                        {userInitial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-slate-900 dark:text-white truncate group-hover/header:text-emerald-500 dark:group-hover/header:text-emerald-400 transition-colors">
                        {userName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {userEmail}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyEmail(e);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                    title="Copy user email"
                  >
                    {copiedEmail ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Primary Settings & Options */}
                <div className="py-1 space-y-0.5">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setSettingsModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setSettingsModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                    <span>Add Account</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveInfoDialog("language");
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                  >
                    <Languages className="w-3.5 h-3.5 text-slate-400" />
                    <span>Language</span>
                  </button>

                  <button
                    onClick={handleContactSupport}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left group"
                    title={`Contact support at ${userEmail}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                      <span>Get Help / Contact Us</span>
                    </div>
                    <Mail className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveInfoDialog("learn");
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span>Learn More</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveInfoDialog("upgrade");
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Upgrade Plan</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Pro
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveInfoDialog("apps");
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                  >
                    <Boxes className="w-3.5 h-3.5 text-slate-400" />
                    <span>Apps and Extensions</span>
                  </button>
                </div>

                {/* Clear Memory & Log Out */}
                <div className="py-1 space-y-0.5">
                  <button
                    onClick={handleTriggerClearMemory}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-left ${
                      confirmClearMem
                        ? "bg-red-500/15 text-red-700 dark:text-red-300 font-semibold"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${confirmClearMem ? "text-red-500 animate-spin" : "text-slate-400"}`} />
                    <span>{confirmClearMem ? "Confirm clear memory?" : "Clear Memory"}</span>
                  </button>

                  <button
                    onClick={handleLogOut}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors text-left font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}

            {/* Minimal Sidebar Footer Profile Icon Button (No visible name or email text) */}
            <button
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-all cursor-pointer group"
              aria-label={`User Profile: ${userName}`}
              title={userName}
              aria-haspopup="true"
              aria-expanded={profileMenuOpen}
            >
              <div className="flex items-center">
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={userName}
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-300 dark:ring-white/[0.15] shadow-xs"
                  />
                ) : (
                  <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-white font-semibold flex items-center justify-center text-xs shadow-xs">
                    <span>{userInitial}</span>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-[#090a0d]" />
                  </div>
                )}
              </div>
              <ChevronUp
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform duration-200 ${
                  profileMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </aside>

      {/* Modals triggered from Sidebar */}
      <ProfileSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        currentUser={currentUser || null}
        onUpdateUser={(updated) => {
          if (onUpdateUser) onUpdateUser(updated);
        }}
        onOpenAddAccount={onOpenAddAccount}
        onOpenHelpIntegrations={onOpenHelp}
      />
      <ProjectsModal isOpen={projectsOpen} onClose={() => setProjectsOpen(false)} />
      <ArtifactsModal isOpen={artifactsOpen} onClose={() => setArtifactsOpen(false)} />
      <CodeModal isOpen={codeOpen} onClose={() => setCodeOpen(false)} />
      <PersonalizeModal isOpen={personalizeOpen} onClose={() => setPersonalizeOpen(false)} />
      <InfoDialog type={activeInfoDialog} onClose={() => setActiveInfoDialog(null)} />
    </>
  );
};
