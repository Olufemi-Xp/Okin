"use client";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  phone?: string;
  dob?: string;
  plan?: "free" | "pro" | "team";
  provider: "email" | "google";
  createdAt: string;
}

const AUTH_USER_KEY = "okin_auth_user";
const AUTH_TOKEN_KEY = "okin_auth_jwt_token";
const SAVED_ACCOUNTS_KEY = "okin_saved_accounts";

/**
 * Resolves the backend API base URL.
 */
function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

/**
 * Retrieves the stored JWT authentication token.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Stores or clears the JWT authentication token.
 */
export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

/**
 * Retrieves the currently signed-in user from localStorage.
 * STRICT: Returns null if no active authenticated session exists.
 * Does NOT auto-sign in or fallback to any demo/default profile.
 */
export function getCurrentUser(): UserProfile | null {
  if (typeof window === "undefined") return null;

  const rawUser = localStorage.getItem(AUTH_USER_KEY);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  // If user explicitly logged out or has no session data/token, return null
  if (!rawUser || rawUser === "LOGGED_OUT" || !token) {
    return null;
  }

  try {
    const user: UserProfile = JSON.parse(rawUser);
    if (!user || !user.id || !user.email) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

/**
 * Stores or clears the active user profile in localStorage.
 */
export function setCurrentUser(user: UserProfile | null, token?: string): void {
  if (typeof window === "undefined") return;

  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    if (token) {
      setAuthToken(token);
    }
    saveAccountToHistory(user);
  } else {
    localStorage.setItem(AUTH_USER_KEY, "LOGGED_OUT");
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

/**
 * Updates properties on the currently active user profile and synchronizes with backend.
 */
export function updateUserProfile(updates: Partial<UserProfile>): UserProfile | null {
  const current = getCurrentUser();
  if (!current) return null;

  const updated: UserProfile = {
    ...current,
    ...updates,
  };

  setCurrentUser(updated);

  // Asynchronously synchronize with backend
  const token = getAuthToken();
  if (token) {
    fetch(`${getApiBase()}/api/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: updates.name,
        avatar_url: updates.avatarUrl,
        phone: updates.phone,
        dob: updates.dob,
        plan: updates.plan,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            const syncedUser: UserProfile = {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              avatarUrl: data.user.avatar_url || undefined,
              phone: data.user.phone || undefined,
              dob: data.user.dob || undefined,
              plan: data.user.plan || "free",
              provider: data.user.provider || "email",
              createdAt: data.user.created_at || updated.createdAt,
            };
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(syncedUser));
          }
        }
      })
      .catch(() => {});
  }

  return updated;
}

/**
 * Multi-account helper: retrieves remembered accounts on this device.
 */
export function getSavedAccounts(): UserProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Records an account in the saved accounts list.
 */
export function saveAccountToHistory(user: UserProfile): void {
  if (typeof window === "undefined" || !user || !user.email) return;
  try {
    const currentList = getSavedAccounts().filter(
      (a) => a.id !== user.id && a.email.toLowerCase() !== user.email.toLowerCase()
    );
    const updated = [user, ...currentList].slice(0, 6);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Switches the active session to one of the saved accounts.
 */
export function switchAccount(userId: string): UserProfile | null {
  const list = getSavedAccounts();
  const found = list.find((a) => a.id === userId);
  if (found) {
    setCurrentUser(found);
    return found;
  }
  return null;
}

/**
 * Cleanly signs out the user:
 * - Clears user data and JWT token
 * - Marks auth session as logged out
 * - Clears temporary access pins
 * - Rotates session ID so subsequent sign-in starts with a fresh conversation state
 */
export function signOutUser(): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(AUTH_USER_KEY, "LOGGED_OUT");
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem("suzzy_access_pin");

  const newSessionId = `okin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem("suzzy_session_id", newSessionId);
}

/**
 * Sign in using email & password against the backend API.
 */
export async function signInWithCredentials(email: string, password: string): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await fetch(`${getApiBase()}/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: cleanEmail, password }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Invalid email or password.");
  }

  const data = await res.json();
  const user: UserProfile = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    avatarUrl: data.user.avatar_url || undefined,
    phone: data.user.phone || undefined,
    dob: data.user.dob || undefined,
    plan: data.user.plan || "free",
    provider: data.user.provider || "email",
    createdAt: data.user.created_at,
  };

  setCurrentUser(user, data.token);
  return user;
}

/**
 * Register a new user account with email & password against the backend API.
 */
export async function signUpWithCredentials(
  email: string,
  password: string,
  name?: string
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name?.trim() || cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const res = await fetch(`${getApiBase()}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: cleanEmail, password, name: cleanName }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to create account. Please try again.");
  }

  const data = await res.json();
  const user: UserProfile = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    avatarUrl: data.user.avatar_url || undefined,
    phone: data.user.phone || undefined,
    dob: data.user.dob || undefined,
    plan: data.user.plan || "free",
    provider: data.user.provider || "email",
    createdAt: data.user.created_at,
  };

  setCurrentUser(user, data.token);
  return user;
}

/**
 * Sign in using Google OAuth against the backend API.
 */
export async function signInWithGoogle(customEmail?: string, customName?: string, avatarUrl?: string): Promise<UserProfile> {
  const cleanEmail = (customEmail || "user@gmail.com").trim().toLowerCase();
  const cleanName = customName || cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const res = await fetch(`${getApiBase()}/api/auth/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: cleanEmail,
      name: cleanName,
      avatar_url: avatarUrl || "",
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Google authentication failed.");
  }

  const data = await res.json();
  const user: UserProfile = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    avatarUrl: data.user.avatar_url || undefined,
    phone: data.user.phone || undefined,
    dob: data.user.dob || undefined,
    plan: data.user.plan || "free",
    provider: data.user.provider || "google",
    createdAt: data.user.created_at,
  };

  setCurrentUser(user, data.token);
  return user;
}
