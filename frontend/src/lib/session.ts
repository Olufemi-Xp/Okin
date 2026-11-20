const SESSION_STORAGE_KEY = "suzzy_session_id";
const ACCESS_PIN_STORAGE_KEY = "suzzy_access_pin";

export function getSessionId(): string {
  if (typeof window === "undefined") {
    return "ssr-session";
  }

  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `suzzy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

export function resetSessionId(): string {
  if (typeof window === "undefined") return "ssr-session";
  const newId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `suzzy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem(SESSION_STORAGE_KEY, newId);
  return newId;
}

export function getStoredAccessPin(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_PIN_STORAGE_KEY);
}

export function setStoredAccessPin(pin: string): void {
  if (typeof window === "undefined") return;
  if (pin.trim()) {
    localStorage.setItem(ACCESS_PIN_STORAGE_KEY, pin.trim());
  } else {
    localStorage.removeItem(ACCESS_PIN_STORAGE_KEY);
  }
}
