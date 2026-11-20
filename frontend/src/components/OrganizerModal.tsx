"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Calendar,
  CheckSquare,
  Bell,
  Plus,
  Trash2,
  MapPin,
  Clock,
  Check,
  Loader2,
} from "lucide-react";
import {
  CalendarEvent,
  TaskItem,
  fetchOrganizerData,
  createOrganizerEvent,
  deleteOrganizerEvent,
  createOrganizerTask,
  toggleOrganizerTask,
  deleteOrganizerTask,
} from "@/lib/api";

interface OrganizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrganizerModal: React.FC<OrganizerModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<"events" | "tasks">("events");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);

  // New event form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventLocation, setEventLocation] = useState("");

  // New task/reminder form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrganizerData();
      setEvents(data.events || []);
      setTasks(data.tasks || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventStart) return;
    const ev = await createOrganizerEvent({
      title: eventTitle.trim(),
      start_time: eventStart,
      location: eventLocation.trim(),
    });
    setEvents((prev) => [...prev, ev].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    setEventTitle("");
    setEventStart("");
    setEventLocation("");
  };

  const handleDeleteEvent = async (id: string) => {
    const ok = await deleteOrganizerEvent(id);
    if (ok) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    const t = await createOrganizerTask({
      title: taskTitle.trim(),
      due_time: taskDue || undefined,
      priority: taskPriority,
      is_reminder: Boolean(taskDue),
    });
    setTasks((prev) => [t, ...prev]);
    setTaskTitle("");
    setTaskDue("");
    setTaskPriority("medium");
  };

  const handleToggleTask = async (task: TaskItem) => {
    const next = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    await toggleOrganizerTask(task.id, next);
  };

  const handleDeleteTask = async (id: string) => {
    const ok = await deleteOrganizerTask(id);
    if (ok) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const priorityBadge = (p: string) => {
    if (p === "high") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    if (p === "low") return "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20";
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#13161c] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl p-6 text-slate-800 dark:text-slate-200 max-h-[88vh] flex flex-col transition-colors duration-300">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
          title="Close organizer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
              Calendar, Reminders &amp; To-Do
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage your schedule directly or ask Okin in chat
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.06] mb-4 shrink-0">
          <button
            onClick={() => setActiveTab("events")}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "events"
                ? "bg-white dark:bg-[#1b1f28] text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            <span>Schedule ({events.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "tasks"
                ? "bg-white dark:bg-[#1b1f28] text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
            <span>Reminders &amp; To-Do ({tasks.filter((t) => !t.completed).length})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading organizer...</span>
            </div>
          ) : activeTab === "events" ? (
            <>
              {/* Add Event Form */}
              <form
                onSubmit={handleAddEvent}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-2.5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Event title (e.g. Team Sync)"
                    required
                    className="bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                  <input
                    type="datetime-local"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    required
                    className="bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="Location / Link (optional)"
                    className="flex-1 bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Schedule</span>
                  </button>
                </div>
              </form>

              {/* Events List */}
              {events.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No scheduled events yet. Add one above or ask Okin: &ldquo;Schedule a meeting tomorrow at 10am&rdquo;
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#090a0d]/70 border border-slate-200 dark:border-white/[0.07] hover:border-emerald-500/30 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {ev.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(ev.start_time)}
                          </span>
                          {ev.location && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" />
                              {ev.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Add Task / Reminder Form */}
              <form
                onSubmit={handleAddTask}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-2.5"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Add a reminder or to-do task..."
                    required
                    className="flex-1 bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Bell className="w-3.5 h-3.5 text-amber-500" />
                    <span>Reminder time (optional):</span>
                  </div>
                  <input
                    type="datetime-local"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="flex-1 bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </form>

              {/* Tasks List */}
              {tasks.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No tasks or reminders yet. Add one above or ask Okin: &ldquo;Remind me to call Alex at 4pm&rdquo;
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                        task.completed
                          ? "bg-slate-50/60 dark:bg-white/[0.02] border-slate-200/60 dark:border-white/[0.04] opacity-60"
                          : "bg-white dark:bg-[#090a0d]/70 border-slate-200 dark:border-white/[0.07]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 pr-2">
                        <button
                          onClick={() => handleToggleTask(task)}
                          className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                            task.completed
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-slate-300 dark:border-slate-600 hover:border-emerald-500"
                          }`}
                          title={task.completed ? "Mark active" : "Mark completed"}
                        >
                          {task.completed && <Check className="w-3 h-3" />}
                        </button>

                        <div className="min-w-0">
                          <div
                            className={`text-xs font-medium break-words ${
                              task.completed
                                ? "line-through text-slate-400"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {task.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded border uppercase font-medium ${priorityBadge(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>
                            {task.due_time && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <Bell className="w-3 h-3" />
                                {formatDateTime(task.due_time)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
