import { getSessionId, getStoredAccessPin } from "./session";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

export interface Thread {
  id: string;
  session_id: string;
  title: string;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  session_id: string;
  role: "user" | "assistant";
  modality: "text" | "voice" | "file";
  content: string;
  agent_used?: string;
  audio_url?: string;
  created_at: string;
  animate?: boolean;
}

export interface ChatResponse {
  response: string;
  thread_id: string;
  agent_used: string;
  model_used: string;
  audio_base64?: string;
  code_execution?: {
    success: boolean;
    stdout: string;
    stderr: string;
    exit_code: number;
    timed_out: boolean;
  };
}

export interface VoiceResponse {
  status?: string;
  transcript: string;
  response: string;
  audio_base64: string | null;
  thread_id: string;
  agent_used: string;
  model_used: string;
}

export interface GeneratedImageAsset {
  image_id: string;
  filename: string;
  url: string;
  prompt: string;
  enhanced_prompt: string;
  style: string;
  aspect_ratio: string;
  width: number;
  height: number;
  provider?: string;
  file_size: number;
  created_at: string;
}

export interface GenerateImageRequest {
  prompt: string;
  style?: string;
  aspect_ratio?: string;
  enhance_prompt?: boolean;
  thread_id?: string;
}

export interface GenerateImageResponse {
  status: string;
  image: GeneratedImageAsset;
  thread_id?: string;
}

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  has_google_key: boolean;
  has_groq_key: boolean;
  pin_protected: boolean;
}

function getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Session-ID": getSessionId(),
    ...customHeaders,
  };
  const pin = getStoredAccessPin();
  if (pin) {
    headers["X-Access-PIN"] = pin;
  }
  return headers;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  onColdStart?: (isWaking: boolean) => void,
  maxRetries = 2
): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      // If taking more than 4 seconds, signal cold start
      if (onColdStart) onColdStart(true);
    }, 3500);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (onColdStart) onColdStart(false);

      if (response.status === 401) {
        throw new Error("UNAUTHORIZED_PIN_REQUIRED");
      }
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.message === "UNAUTHORIZED_PIN_REQUIRED") {
        throw err;
      }
      attempt++;
      if (attempt > maxRetries) {
        if (onColdStart) onColdStart(false);
        throw err;
      }
      // Wait before retry
      if (onColdStart) onColdStart(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Request failed after retries.");
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("UNAUTHORIZED_PIN_REQUIRED");
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  city?: string;
}

export async function sendChatMessage(
  message: string,
  threadId?: string,
  file?: File,
  onColdStart?: (isWaking: boolean) => void,
  voiceMode?: boolean,
  userLocation?: UserLocation | null
): Promise<ChatResponse> {
  let res: Response;
  const extraHeaders: Record<string, string> = {};
  if (userLocation) {
    extraHeaders["X-User-Latitude"] = userLocation.latitude.toString();
    extraHeaders["X-User-Longitude"] = userLocation.longitude.toString();
    if (userLocation.city) {
      extraHeaders["X-User-City"] = userLocation.city;
    }
  }

  if (file) {
    const formData = new FormData();
    formData.append("message", message);
    if (threadId) formData.append("thread_id", threadId);
    if (voiceMode) formData.append("voice_mode", "true");
    if (userLocation) {
      formData.append("user_location", JSON.stringify(userLocation));
    }
    formData.append("file", file);

    res = await fetchWithRetry(
      `${API_BASE}/api/chat`,
      {
        method: "POST",
        headers: getHeaders(extraHeaders),
        body: formData,
      },
      onColdStart
    );
  } else {
    res = await fetchWithRetry(
      `${API_BASE}/api/chat`,
      {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json", ...extraHeaders }),
        body: JSON.stringify({
          message,
          thread_id: threadId,
          voice_mode: voiceMode,
          user_location: userLocation,
        }),
      },
      onColdStart
    );
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Chat request failed." }));
    throw new Error(errorData.detail || "Chat request failed.");
  }

  return res.json();
}

export async function sendVoiceMessage(
  audioBlob: Blob,
  threadId?: string,
  onColdStart?: (isWaking: boolean) => void,
  fallbackTranscript?: string,
  userLocation?: UserLocation | null
): Promise<VoiceResponse> {
  const formData = new FormData();
  let filename = "recording.webm";
  if (audioBlob.type.includes("mp4")) filename = "recording.mp4";
  else if (audioBlob.type.includes("ogg")) filename = "recording.ogg";
  else if (audioBlob.type.includes("wav")) filename = "recording.wav";

  formData.append("file", audioBlob, filename);
  if (threadId) {
    formData.append("thread_id", threadId);
  }
  if (fallbackTranscript && fallbackTranscript.trim()) {
    formData.append("fallback_transcript", fallbackTranscript.trim());
  }
  if (userLocation) {
    formData.append("user_location", JSON.stringify(userLocation));
  }

  const extraHeaders: Record<string, string> = {};
  if (userLocation) {
    extraHeaders["X-User-Latitude"] = userLocation.latitude.toString();
    extraHeaders["X-User-Longitude"] = userLocation.longitude.toString();
  }

  const res = await fetchWithRetry(
    `${API_BASE}/api/voice`,
    {
      method: "POST",
      headers: getHeaders(extraHeaders),
      body: formData,
    },
    onColdStart
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Voice request failed." }));
    throw new Error(errorData.detail || "Voice request failed.");
  }

  return res.json();
}

export async function generateVisual(params: GenerateImageRequest): Promise<GenerateImageResponse> {
  const res = await fetch(`${API_BASE}/api/generate-visual`, {
    method: "POST",
    headers: getHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("UNAUTHORIZED_PIN_REQUIRED");
    const errData = await res.json().catch(() => ({ detail: "Visual generation failed." }));
    throw new Error(errData.detail || `Visual generation failed (HTTP ${res.status}).`);
  }

  return res.json();
}

export const generateImage = generateVisual;

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  let filename = "recording.webm";
  if (audioBlob.type.includes("mp4")) filename = "recording.mp4";
  else if (audioBlob.type.includes("ogg")) filename = "recording.ogg";
  else if (audioBlob.type.includes("wav")) filename = "recording.wav";

  formData.append("file", audioBlob, filename);

  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: getHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Transcription failed." }));
    throw new Error(errorData.detail || "Transcription failed.");
  }

  const data = await res.json();
  return data.transcript || "";
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: getHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error("TTS synthesis failed.");
  }

  const data = await res.json();
  return data.audio_base64 || "";
}

export function base64ToBlobUrl(base64Data: string, mimeType = "audio/mp3"): string {
  try {
    if (!base64Data || typeof window === "undefined") return base64Data;
    if (base64Data.startsWith("blob:") || base64Data.startsWith("http")) return base64Data;
    const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
    const binary = atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.warn("Base64 to Blob conversion error:", e);
    return base64Data;
  }
}

export async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch(`${API_BASE}/api/threads`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("UNAUTHORIZED_PIN_REQUIRED");
    return [];
  }
  const data = await res.json();
  return data.threads || [];
}

export async function fetchThreadDetail(threadId: string): Promise<{ thread: Thread; messages: Message[] }> {
  const res = await fetch(`${API_BASE}/api/threads/${threadId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("UNAUTHORIZED_PIN_REQUIRED");
    throw new Error("Thread not found.");
  }
  return res.json();
}

export async function deleteThread(threadId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/threads/${threadId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return res.ok;
}

export async function clearCrossSessionMemory(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/memory`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Gmail API Client Functions
// ---------------------------------------------------------------------------

export interface GmailStatus {
  configured: boolean;
  authenticated: boolean;
  email: string | null;
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/gmail/status`, {
      headers: getHeaders(),
    });
    if (!res.ok) return { configured: false, authenticated: false, email: null };
    return res.json();
  } catch (e) {
    return { configured: false, authenticated: false, email: null };
  }
}

export async function uploadGmailCredentials(file: File): Promise<{ success: boolean; message: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const headers = getHeaders();
  delete (headers as any)["Content-Type"];

  const res = await fetch(`${API_BASE}/api/gmail/upload-credentials`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Failed to upload credentials.json.");
  }
  return res.json();
}

export async function fetchGmailAuthUrl(redirectUri?: string): Promise<{ auth_url: string; redirect_uri: string }> {
  const url = new URL(`${API_BASE}/api/gmail/auth-url`);
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
  const res = await fetch(url.toString(), {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to generate Google auth URL" }));
    throw new Error(err.detail || "Failed to generate Google auth URL.");
  }
  return res.json();
}

export async function exchangeGmailCode(code: string, redirectUri?: string): Promise<{ success: boolean; email: string }> {
  const res = await fetch(`${API_BASE}/api/gmail/exchange-code`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to exchange authorization code" }));
    throw new Error(err.detail || "Failed to exchange authorization code.");
  }
  return res.json();
}

export async function disconnectGmail(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/gmail/disconnect`, {
    method: "POST",
    headers: getHeaders(),
  });
  return res.ok;
}

export async function sendApprovedDraft(data: {
  draft_id?: string;
  to: string;
  subject: string;
  body: string;
  thread_id?: string;
}): Promise<{ success: boolean; details: any }> {
  const res = await fetch(`${API_BASE}/api/gmail/send-draft`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to send email" }));
    throw new Error(err.detail || "Failed to send email.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Calendar Events, Reminders & To-Do List Client Functions
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  session_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string | null;
  location?: string;
  status: string;
  created_at: string;
}

export interface TaskItem {
  id: string;
  session_id: string;
  title: string;
  due_time?: string | null;
  priority: "low" | "medium" | "high";
  is_reminder: boolean;
  completed: boolean;
  created_at: string;
}

export async function fetchOrganizerData(): Promise<{ events: CalendarEvent[]; tasks: TaskItem[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/organizer`, {
      headers: getHeaders(),
    });
    if (!res.ok) return { events: [], tasks: [] };
    return res.json();
  } catch (e) {
    return { events: [], tasks: [] };
  }
}

export async function createOrganizerEvent(data: {
  title: string;
  start_time: string;
  end_time?: string;
  location?: string;
  description?: string;
}): Promise<CalendarEvent> {
  const res = await fetch(`${API_BASE}/api/organizer/events`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to schedule event.");
  const json = await res.json();
  return json.event;
}

export async function deleteOrganizerEvent(eventId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/organizer/events/${eventId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return res.ok;
}

export async function createOrganizerTask(data: {
  title: string;
  due_time?: string;
  priority?: "low" | "medium" | "high";
  is_reminder?: boolean;
}): Promise<TaskItem> {
  const res = await fetch(`${API_BASE}/api/organizer/tasks`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create task or reminder.");
  const json = await res.json();
  return json.task;
}

export async function toggleOrganizerTask(taskId: string, completed: boolean): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/organizer/tasks/${taskId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ completed }),
  });
  return res.ok;
}

export async function deleteOrganizerTask(taskId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/organizer/tasks/${taskId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return res.ok;
}
