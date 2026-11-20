"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  FolderKanban,
  Layers,
  Code2,
  SlidersHorizontal,
  Play,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Download,
  Languages,
  HelpCircle,
  Mail,
  ShieldCheck,
  Boxes,
  Info,
  Loader2,
  FileCode,
  Image as ImageIcon,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { getStoredAccessPin } from "@/lib/session";

// ---------------------------------------------------------------------------
// 1. Projects Modal
// ---------------------------------------------------------------------------
export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export const ProjectsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [projects, setProjects] = useState<ProjectItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okin_projects");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [
      {
        id: "proj-default",
        name: "General Workspace",
        description: "Primary daily tasks, research, and general conversations.",
        createdAt: new Date().toLocaleDateString(),
      },
      {
        id: "proj-code",
        name: "Full-Stack Development",
        description: "Coding assistance, Python sandbox scripts, and architecture.",
        createdAt: new Date().toLocaleDateString(),
      },
    ];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>("proj-default");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("okin_projects", JSON.stringify(projects));
    }
  }, [projects]);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const newProj: ProjectItem = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      description: newProjectDesc.trim() || "Custom project workspace.",
      createdAt: new Date().toLocaleDateString(),
    };
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setNewProjectName("");
    setNewProjectDesc("");
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Projects</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Organize conversations, context, and goals into distinct projects
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Your Workspaces ({projects.length})
            </span>
            <button
              onClick={() => setIsCreating((p) => !p)}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
            >
              {isCreating ? "Cancel" : "+ New Project"}
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreate} className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2.5">
              <input
                type="text"
                placeholder="Project name (e.g. Mobile App Redesign)..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <textarea
                placeholder="Project description & context instructions..."
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                rows={2}
                className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 resize-none"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors shadow-xs"
              >
                Create Project
              </button>
            </form>
          )}

          <div className="space-y-2">
            {projects.map((proj) => {
              const isSelected = proj.id === activeProjectId;
              return (
                <div
                  key={proj.id}
                  onClick={() => setActiveProjectId(proj.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/15"
                      : "border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] bg-slate-50/50 dark:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white">{proj.name}</span>
                    {isSelected && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {proj.description}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-2 block">Created: {proj.createdAt}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.08] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Artifacts Modal
// ---------------------------------------------------------------------------
export const ArtifactsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [filter, setFilter] = useState<"all" | "visuals" | "code">("all");

  const sampleArtifacts = [
    {
      id: "art-1",
      title: "Interactive OpenStreetMap Component",
      type: "code",
      createdAt: "Recently",
      preview: "function MapsCard({ jsonString }) { ... }",
    },
    {
      id: "art-2",
      title: "Photosynthesis Process Diagram",
      type: "visual",
      createdAt: "Recently",
      preview: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Photosynthesis_en.svg/960px-Photosynthesis_en.svg.png",
    },
    {
      id: "art-3",
      title: "FastAPI LangGraph Pipeline Architecture",
      type: "code",
      createdAt: "Earlier today",
      preview: "workflow.add_conditional_edges('supervisor', route_decision)",
    },
    {
      id: "art-4",
      title: "Black Hole Gravitational Lensing",
      type: "visual",
      createdAt: "Yesterday",
      preview: "https://image.pollinations.ai/prompt/black%20hole?width=800&height=450&nologo=true",
    },
  ];

  if (!isOpen) return null;

  const filtered = sampleArtifacts.filter((a) => {
    if (filter === "visuals") return a.type === "visual";
    if (filter === "code") return a.type === "code";
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Artifacts</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Browse generated visuals, code snippets, and diagrams
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-1 border-b border-slate-100 dark:border-white/[0.05]">
          {(["all", "visuals", "code"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === tab
                  ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-3">
          {filtered.map((art) => (
            <div
              key={art.id}
              className="p-3.5 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-slate-200/70 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 shrink-0">
                  {art.type === "visual" ? <ImageIcon className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">{art.title}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{art.type} • {art.createdAt}</div>
                </div>
              </div>
              <a
                href={art.preview.startsWith("http") ? art.preview : "#"}
                target={art.preview.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!art.preview.startsWith("http")) {
                    e.preventDefault();
                    navigator.clipboard.writeText(art.preview);
                    alert("Code snippet copied to clipboard!");
                  }
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-200/80 hover:bg-slate-300 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 shrink-0 flex items-center gap-1"
              >
                <span>{art.preview.startsWith("http") ? "View" : "Copy"}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.08] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Code Playground Modal (Python Sandbox)
// ---------------------------------------------------------------------------
export const CodeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [code, setCode] = useState(
    `# Python Sandbox in Okin\nimport math\n\ndef fibonacci(n):\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n\nprint("First 10 Fibonacci numbers:", fibonacci(10))\nprint("Pi approximation:", round(math.pi, 6))\n`
  );
  const [output, setOutput] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleRun = async () => {
    setIsRunning(true);
    setOutput(null);
    try {
      const pin = getStoredAccessPin();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pin) headers["X-Access-Pin"] = pin;

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: `Run this python code:\n\`\`\`python\n${code}\n\`\`\``,
        }),
      });
      const data = await res.json();
      setOutput(data.response || "Code executed successfully with no output.");
    } catch (err: any) {
      setOutput(`Execution error: ${err?.message || "Failed to contact sandbox"}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Code &amp; Python Sandbox</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Write, test, and run Python scripts in Okin's isolated sandbox
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Editor & Execution Area */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">main.py</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={10}
            className="w-full font-mono text-xs p-3.5 rounded-xl bg-slate-900 text-slate-100 border border-slate-700/80 focus:outline-none focus:border-blue-500 resize-none selection:bg-blue-600"
            spellCheck={false}
          />

          <div className="flex justify-end">
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-xs disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isRunning ? "Running in Sandbox..." : "Run Python Code"}</span>
            </button>
          </div>

          {output && (
            <div className="mt-2 p-3.5 rounded-xl bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/[0.08]">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Execution Output:</span>
              <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Personalize Okin Modal
// ---------------------------------------------------------------------------
export const PersonalizeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [userName, setUserName] = useState(() => {
    return (typeof window !== "undefined" && localStorage.getItem("okin_user_name")) || "Chris Akins";
  });
  const [tone, setTone] = useState(() => {
    return (typeof window !== "undefined" && localStorage.getItem("okin_user_tone")) || "balanced";
  });
  const [customInstructions, setCustomInstructions] = useState(() => {
    return (
      (typeof window !== "undefined" && localStorage.getItem("okin_custom_instructions")) ||
      "Prefer direct answers, clear bullet points, and code snippets when technical."
    );
  });
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("okin_user_name", userName);
      localStorage.setItem("okin_user_tone", tone);
      localStorage.setItem("okin_custom_instructions", customInstructions);
    }
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  const tones = [
    { id: "balanced", name: "Balanced", desc: "Clear, friendly, and naturally helpful" },
    { id: "concise", name: "Concise", desc: "Short, direct, minimal fluff" },
    { id: "professional", name: "Professional", desc: "Formal tone with detailed breakdowns" },
    { id: "creative", name: "Creative", desc: "Expressive, brainstorm-oriented" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Personalize Okin</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tailor how Okin speaks, reasons, and addresses you
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              What should Okin call you?
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              placeholder="Your name or nickname..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Assistant Personality &amp; Tone
            </label>
            <div className="grid grid-cols-2 gap-2">
              {tones.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    tone === t.id
                      ? "border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15"
                      : "border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14]"
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">{t.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Custom Instructions
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={4}
              placeholder="How would you like Okin to respond? Any specific topics or formatting preferences?"
              className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-[#181c24] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {saved ? "Saved preferences!" : ""}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. Generic Info Dialog (Language, Upgrade, Apps, Learn More)
// ---------------------------------------------------------------------------
export const InfoDialog: React.FC<{
  type: "language" | "upgrade" | "apps" | "learn" | null;
  onClose: () => void;
}> = ({ type, onClose }) => {
  const [selectedLang, setSelectedLang] = useState("English (US)");

  if (!type) return null;

  const languages = [
    "English (US)",
    "English (UK)",
    "Español (Spanish)",
    "Français (French)",
    "Deutsch (German)",
    "Italiano (Italian)",
    "Português (Portuguese)",
    "日本語 (Japanese)",
    "한국어 (Korean)",
    "中文 (Chinese)",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden p-5 space-y-4">
        {/* Language Modal */}
        {type === "language" && (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-indigo-500" />
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Select Language</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {languages.map((l) => (
                <div
                  key={l}
                  onClick={() => setSelectedLang(l)}
                  className={`px-3 py-2 rounded-lg text-xs cursor-pointer flex items-center justify-between ${
                    selectedLang === l
                      ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold"
                      : "hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span>{l}</span>
                  {selectedLang === l && <Check className="w-3.5 h-3.5" />}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Upgrade Plan Modal */}
        {type === "upgrade" && (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Okin Pro Membership</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200">
                <span className="font-semibold">Current Plan:</span> Okin Free Tier (Full Local &amp; Hybrid AI access).
              </div>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Unlimited Gemini 2.5 &amp; Llama 3.3 70B reasoning</li>
                <li>Instant Whisper speech-to-text with zero lag</li>
                <li>Unlimited live OpenStreetMap &amp; web search</li>
                <li>Priority Python sandbox execution</li>
              </ul>
              <p className="text-[11px] text-slate-400">
                Contact <span className="font-mono text-slate-300">akins2chris@gmail.com</span> for enterprise &amp; team access.
              </p>
            </div>
          </>
        )}

        {/* Apps & Extensions Modal */}
        {type === "apps" && (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-cyan-500" />
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Apps &amp; Extensions</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { name: "Gmail & Email Agent", status: "Active / OAuth Ready", icon: "📧" },
                { name: "Google Calendar & Tasks", status: "Enabled", icon: "📅" },
                { name: "Python Sandbox", status: "Enabled", icon: "🐍" },
                { name: "OpenStreetMap & Nominatim", status: "Active (Free)", icon: "🗺️" },
                { name: "Whisper Voice-to-Text", status: "Active", icon: "🎙️" },
              ].map((app) => (
                <div
                  key={app.name}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span>{app.icon}</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{app.name}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{app.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Learn More Modal */}
        {type === "learn" && (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">About Okin</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                <strong>Okin</strong> is an intelligent, versatile personal AI assistant engineered for privacy, speed, and real-time execution.
              </p>
              <p>
                Powered by a dynamic multi-agent LangGraph pipeline, Okin effortlessly coordinates web research, code execution in secure sandboxes, live speech transcription with Whisper, and interactive maps.
              </p>
              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.05] text-[11px] text-slate-400">
                Created with care for seamless daily productivity.
              </div>
            </div>
          </>
        )}

        {/* Close Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
