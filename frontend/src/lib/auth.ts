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
const SAVED_ACCOUNTS_KEY = "okin_saved_accounts";

const DEFAULT_USER: UserProfile = {
  id: "user-default-1",
  name: "Chris Akins",
  email: "akins2chris@gmail.com",
  phone: "+1 (555) 392-8104",
  dob: "1994-06-18",
  plan: "pro",
  provider: "google",
  createdAt: new Date().toISOString(),
};

/**
 * Retrieves the currently signed-in user from localStorage.
 * If no session has ever been created, initializes the default user profile.
 * If the user explicitly logged out (key set to 'LOGGED_OUT'), returns null.
 */
export function getCurrentUser(): UserProfile | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (raw === "LOGGED_OUT") {
    return null;
  }
  if (!raw) {
    // Initial session defaults to Chris Akins
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(DEFAULT_USER));
    saveAccountToHistory(DEFAULT_USER);
    return DEFAULT_USER;
  }

  try {
    const user = JSON.parse(raw);
    saveAccountToHistory(user);
    return user;
  } catch {
    return null;
  }
}

/**
 * Stores the active user profile in localStorage.
 */
export function setCurrentUser(user: UserProfile | null): void {
  if (typeof window === "undefined") return;

  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    saveAccountToHistory(user);
  } else {
    localStorage.setItem(AUTH_USER_KEY, "LOGGED_OUT");
  }
}

/**
 * Updates properties on the currently active user profile and persists to storage.
 */
export function updateUserProfile(updates: Partial<UserProfile>): UserProfile | null {
  const current = getCurrentUser();
  if (!current) return null;

  const updated: UserProfile = {
    ...current,
    ...updates,
  };

  setCurrentUser(updated);
  return updated;
}

/**
 * Multi-account helper: retrieves all saved/remembered accounts on this device.
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
 * - Marks auth session as logged out
 * - Clears temporary security tokens / PINs
 * - Rotates session ID to isolate new conversation state
 */
export function signOutUser(): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(AUTH_USER_KEY, "LOGGED_OUT");
  localStorage.removeItem("suzzy_access_pin");

  // Rotate session id so subsequent sign-in starts with clean memory context
  const newSessionId = `okin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem("suzzy_session_id", newSessionId);
}

/**
 * Sign in using email & password
 */
export function signInWithCredentials(email: string, name?: string): UserProfile {
  const cleanEmail = email.trim().toLowerCase();
  const displayName = name?.trim() || cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Okin User";

  const user: UserProfile = {
    id: `usr-${Date.now()}`,
    name: displayName,
    email: cleanEmail,
    plan: "free",
    provider: "email",
    createdAt: new Date().toISOString(),
  };

  setCurrentUser(user);
  return user;
}

/**
 * Sign in using Google OAuth / Google Account
 */
export function signInWithGoogle(customEmail?: string, customName?: string): UserProfile {
  const email = (customEmail || "akins2chris@gmail.com").trim().toLowerCase();
  const name = customName || (email.startsWith("akins") ? "Chris Akins" : "Google User");

  const user: UserProfile = {
    id: `google-${Date.now()}`,
    name,
    email,
    plan: "pro",
    provider: "google",
    createdAt: new Date().toISOString(),
  };

  setCurrentUser(user);
  return user;
}
