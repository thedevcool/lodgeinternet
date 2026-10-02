"use client";

/**
 * Admin session plumbing shared by the API client, the auth store and the
 * session keeper. Kept separate so `apiClient` can report an ended session
 * without importing the store (which imports `apiClient` itself).
 *
 * The session itself is an HttpOnly cookie the backend sets, which no script
 * here can read (backend/app/core/cookies.py). What this page keeps is who is
 * signed in and when the session ends, so it can renew it in time.
 */

export const ADMIN_COOKIE_KEY = "Davo-Nexus Limited-admin";
export const ADMIN_PROFILE_KEY = "Davo-Nexus Limited-admin-profile";
/** When the session ends, in epoch milliseconds, as the backend said at login or renewal. */
export const ADMIN_EXPIRES_KEY = "Davo-Nexus Limited-admin-expires";
/** Where the admin pages kept the session token itself, before the cookie. */
export const OLD_ADMIN_TOKEN_KEY = "Davo-Nexus Limited-admin-token";

/** Why a session stopped — shown to the admin on the login screen. */
export type SessionEndReason = "expired" | "invalid" | "signed-out";
export const SESSION_ENDED_EVENT = "lodge:admin-session-ended";

/** When this browser's session ends, in epoch milliseconds (null = no session). */
export function sessionExpiresAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const value = Number(window.localStorage.getItem(ADMIN_EXPIRES_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Is the session still good? `withinMs` asks the question early — "will it
 * still be valid in N milliseconds?" — which is how the keeper decides when
 * to renew. No session counts as dead.
 */
export function isSessionLive(withinMs = 0): boolean {
  const expiresAt = sessionExpiresAt();
  return expiresAt !== null && expiresAt - withinMs > Date.now();
}

const END_REASON_KEY = "lodge:admin-session-end-reason";

/**
 * Stash why the session ended. Two things can redirect to the login screen at
 * almost the same moment — the session keeper and a page's own route guard —
 * so the reason is kept here rather than only in the URL, and the login page
 * reads it whichever redirect won.
 */
export function rememberSessionEnd(reason: SessionEndReason): void {
  try {
    window.sessionStorage.setItem(END_REASON_KEY, reason);
  } catch {
    // storage blocked — the login page just won't explain itself
  }
}

/** Read and clear the stashed reason. */
export function takeSessionEndReason(): SessionEndReason | null {
  try {
    const reason = window.sessionStorage.getItem(END_REASON_KEY);
    if (reason) window.sessionStorage.removeItem(END_REASON_KEY);
    return (reason as SessionEndReason) || null;
  } catch {
    return null;
  }
}

/** Tell the app the session is over (the keeper listens and redirects). */
export function announceSessionEnded(reason: SessionEndReason): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: reason }));
}

export function onSessionEnded(handler: (reason: SessionEndReason) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<SessionEndReason>).detail);
  window.addEventListener(SESSION_ENDED_EVENT, listener);
  return () => window.removeEventListener(SESSION_ENDED_EVENT, listener);
}
