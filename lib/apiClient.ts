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
 * Admin auth (the server-side security fix):
 * - `/api/admin/*` and the admin-only actions listed in `ADMIN_AUTH_EXACT` are
 *   protected by `require_admin` on the  `apiFetch` reads the admin JWT
 *   that `authStore` saved on login and attaches it as `Authorization: Bearer`.
 * - It never overwrites an `Authorization` header the caller already set (e.g.
 *   customer calls that pass a Firebase ID token), and only touches admin paths.
 */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/** localStorage key holding the admin JWT — must match `store/authStore.ts`. */
const ADMIN_TOKEN_KEY = "Davo-Nexus Limited-admin-token";

/** Path prefixes served by the FastAPI backend (all routes are ported). */
export const MIGRATED_PREFIXES: string[] = ["/api"];

/**
 * Admin-only endpoints that live under otherwise-customer prefixes
 * (`/api/data-codes/*`, `/api/tv/*`, `/api/cron/*`). Everything under
 * `/api/admin/` is covered separately by the prefix check below.
 */
const ADMIN_AUTH_EXACT = new Set<string>([
  "/api/data-codes/add",
  "/api/data-codes/delete",
  "/api/data-codes/delete-plan",
  "/api/data-codes/duplicate",
  "/api/data-codes/update-plan",
  "/api/data-codes/controller-buckets",
  "/api/data-codes/controller-codes",
  "/api/data-codes/controller-buckets/resolve-price",
  "/api/data-codes/sync-status",
  "/api/data-codes/summary",
  "/api/data-codes/low-stock",
  "/api/data-codes/sync",
  "/api/tv/activate",
  "/api/tv/delete",
  "/api/tv/update-plan",
  "/api/tv/check-expiry",
  // TV subscription listing doubles as the admin "pending activation" source
  // (isAdmin=true); attach the admin token so the is_admin branch can verify it.
  "/api/tv/subscriptions",
  "/api/cron/cleanup-email-images",
  // Hostel/collage GET is public, but create/update/delete are admin-guarded.
  // Attaching the token is harmless on the public GET (it's ignored), and
  // required for the write methods on the same path.
  "/api/hostels",
  "/api/hostel-collages",
  // Feedback POST is a public customer submission; the GET (admin list) is
  // guarded. Same story — token attaches only when an admin has one.
  "/api/data-codes/feedback",
]);

function isMigrated(path: string): boolean {
  return MIGRATED_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/** Does this path hit a backend route guarded by `require_admin`? */
function needsAdminAuth(path: string): boolean {
  const clean = path.split("?")[0];
  return clean.startsWith("/api/admin/") || ADMIN_AUTH_EXACT.has(clean);
}

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * Resolve an `/api/...` path to the origin that should serve it.
 * Migrated + backend configured → absolute FastAPI URL; otherwise same-origin.
 */
export function apiUrl(path: string): string {
  return BASE && isMigrated(path) ? BASE + path : path;
}

/**
 * Attach the admin JWT for admin paths, without clobbering an Authorization
 * header the caller already provided. Returns the (possibly unchanged) init.
 */
function withAdminAuth(
  path: string,
  init?: RequestInit,
): RequestInit | undefined {
  if (!needsAdminAuth(path)) return init;
  const token = getAdminToken();
  if (!token) return init;

  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

/** Drop-in replacement for `fetch("/api/...")` used across the app. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), withAdminAuth(path, init));
}
