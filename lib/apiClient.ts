/**
 * Central API client.
 *
 * The backend now lives in a standalone FastAPI service (all routes ported).
 * This helper is the single place the frontend decides WHERE an `/api/...` call
 * goes and, for admin calls, attaches the signed admin session token.
 *
 * Routing:
 * - Set `NEXT_PUBLIC_API_BASE_URL` to the FastAPI origin (e.g.
 *   `https://api.lodge-internet.com`). When set, migrated paths are sent there;
 *   when empty, calls stay same-origin (byte-for-byte today's behaviour), so
 *   this file is inert until you point it at the
 * - `MIGRATED_PREFIXES` is the allowlist of paths served by the  Every
 *   route is ported, so it's simply `/api`. To roll back to the old same-origin
 *   route for a group during the switch, remove/narrow the prefix here.
 *
 * Two clients, deliberately separate:
 * - `apiFetch`  — customer side. NEVER sends the admin token. It used to
 *   attach it to "public but sometimes admin" paths, which meant a browser
 *   with an admin session received hostel Wi-Fi passwords on the customer
 *   registration page.
 * - `adminFetch` — admin screens. Always sends the token, and turns a 401
 *   into one app-wide "session ended" signal so no page is left silently
 *   empty. Neither overwrites an `Authorization` header the caller set (e.g.
 *   a customer call carrying a Firebase ID token).
 */

import { announceSessionEnded, getAdminToken } from "./adminSession";

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/** Path prefixes served by the FastAPI backend (all routes are ported).
 *
 * The Next `app/api/*` routes these replaced have been deleted — every one was
 * dead code that only looked authoritative. If `NEXT_PUBLIC_API_BASE_URL` is
 * ever unset, requests now fall through to a same-origin `/api/*` that returns
 * 404 rather than silently running a stale copy of the logic. That is the
 * intended failure: loud, not quiet.
 */
export const MIGRATED_PREFIXES: string[] = ["/api"];

function isMigrated(path: string): boolean {
  return MIGRATED_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/**
 * Resolve an `/api/...` path to the origin that should serve it.
 * Migrated + backend configured → absolute FastAPI URL; otherwise same-origin.
 */
export function apiUrl(path: string): string {
  return BASE && isMigrated(path) ? BASE + path : path;
}

/** Customer-side fetch. Carries no admin credentials, ever. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

/**
 * Admin-side fetch: attaches the session token and watches for a dead session.
 *
 * A 401 here means the session is over — every admin screen used to handle
 * that on its own, or (mostly) not at all, which is why an expired session
 * looked like an admin page where every table was empty. Now it is announced
 * once and `AdminSessionKeeper` does the rest. A 403 is left alone: the
 * session is fine, this admin simply may not do that.
 */
export async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAdminToken();
  let request = init;
  if (token) {
    const headers = new Headers(init?.headers);
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    request = { ...init, headers };
  }

  const response = await fetch(apiUrl(path), request);

  if (response.status === 401) {
    let code = "";
    try {
      code = (await response.clone().json())?.code ?? "";
    } catch {
      // non-JSON body — treat as a plain expiry
    }
    announceSessionEnded(code === "session_invalid" ? "invalid" : "expired");
  }

  return response;
}
