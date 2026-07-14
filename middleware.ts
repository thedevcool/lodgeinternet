import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis/cloudflare";

/**
 * Rate limiter for Edge middleware.
 *
 * Primary: Upstash Redis + Lua (atomic, shared across all instances).
 * Fallback: In-memory sliding-window (single instance only).
 *
 * The Lua script runs INCR + EXPIRE atomically in one round-trip,
 * eliminating race conditions between checking and incrementing.
 */

// ─── Redis (lazy singleton) ──────────────────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// ─── Lua script ──────────────────────────────────────────────────────────────

const RATE_LIMIT_LUA = `
local key    = KEYS[1]
local window = tonumber(ARGV[1])
local limit  = tonumber(ARGV[2])

local current = tonumber(redis.call("GET", key) or "0")

if current >= limit then
  local ttl = redis.call("TTL", key)
  return {0, current, ttl}
end

if current == 0 then
  redis.call("SET", key, 1, "EX", window)
  return {1, 1, window}
else
  redis.call("INCR", key)
  local ttl = redis.call("TTL", key)
  return {1, current + 1, ttl}
end
`;

async function redisRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ limited: boolean; remaining: number; retryAfter: number } | null> {
  const r = getRedis();
  if (!r) return null; // Redis not configured — signal caller to use fallback

  try {
    const result = (await r.eval(
      RATE_LIMIT_LUA,
      [`rl:${key}`],
      [String(windowSec), String(limit)],
    )) as [number, number, number];

    const [allowed, current, ttl] = result;
    return {
      limited: allowed === 0,
      remaining: Math.max(0, limit - current),
      retryAfter: ttl > 0 ? ttl : windowSec,
    };
  } catch {
    return null; // Redis error — fall back to in-memory
  }
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

interface MemEntry {
  count: number;
  resetAt: number;
}

const memStore = new Map<string, MemEntry>();
let lastCleanup = Date.now();

function memRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { limited: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > 60_000) {
    lastCleanup = now;
    for (const [k, v] of memStore) {
      if (now > v.resetAt) memStore.delete(k);
    }
  }

  const entry = memStore.get(key);
  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) };
  }

  entry.count += 1;
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

  if (entry.count > limit) {
    return { limited: true, remaining: 0, retryAfter };
  }
  return { limited: false, remaining: limit - entry.count, retryAfter };
}

// ─── Route configs ───────────────────────────────────────────────────────────

const RATE_LIMITS: Record<string, { limit: number; windowSec: number }> = {
  // Critical payment/claim routes
  "/api/data-codes/claim": { limit: 10, windowSec: 60 },
  "/api/tv/purchase": { limit: 10, windowSec: 60 },
  "/api/tv/create-account": { limit: 10, windowSec: 60 },
  "/api/tv/update-mac": { limit: 5, windowSec: 60 },
  // Customer self-recovery — reveal code and resend email
  "/api/data-codes/reveal": { limit: 20, windowSec: 60 },
  "/api/data-codes/resend-email": { limit: 5, windowSec: 60 },
  // Reserve and release sit in front of payment — generous enough to
  // accommodate normal retries while still blocking obvious abuse.
  "/api/data-codes/reserve": { limit: 15, windowSec: 60 },
  "/api/data-codes/release": { limit: 30, windowSec: 60 },
  // Public waitlist submission — one-shot per visitor in practice, so 3/min
  // is comfortable but still blocks scripted spam.
  "/api/waitlist": { limit: 3, windowSec: 60 },
  // Auth routes — prevent brute force
  "/api/admin/login": { limit: 8, windowSec: 60 },
  "/api/auth/register": { limit: 5, windowSec: 60 },
  "/api/auth/verify-email": { limit: 8, windowSec: 60 },
  "/api/auth/change-email": { limit: 3, windowSec: 60 },
  "/api/auth/forgot-password": { limit: 5, windowSec: 60 },
  "/api/auth/reset-password": { limit: 8, windowSec: 60 },
  // Email sending — prevent spam
  "/api/admin/send-email": { limit: 5, windowSec: 60 },
  "/api/admin/send-split-email": { limit: 5, windowSec: 60 },
  // Paystack webhook — allow burst from Paystack servers
  "/api/webhooks/paystack": { limit: 50, windowSec: 60 },
};

const DEFAULT = { limit: 40, windowSec: 60 };

// ─── Lockdown check ──────────────────────────────────────────────────────────

const LOCKDOWN_REDIS_KEY = "site:lockdown";

/** Paths that remain accessible even when the site is locked */
function isLockdownExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/maintenance" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images")
  );
}

/**
 * Is this request coming from a logged-in admin?
 *
 * The admin dashboard sets this cookie on login and clears it on logout
 * (see store/authStore.ts). The browser sends it with every same-origin
 * request — pages AND API calls — so while it's present we let the admin
 * through lockdown entirely and they can keep working during maintenance.
 *
 * We read the raw Cookie header because the cookie name contains a space,
 * which some parsers normalise away.
 */
function isAdminSession(request: NextRequest): boolean {
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes("Davo-Nexus Limited-admin=true");
}

async function isLockedDown(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false; // Redis not configured — fail open (don't lock out)
  try {
    const val = await r.get(LOCKDOWN_REDIS_KEY);
    // @upstash/redis auto-deserializes via JSON.parse, so "1" stored as string
    // comes back as the number 1 — use loose comparison to handle both types
    // eslint-disable-next-line eqeqeq
    return val != null && String(val) === "1";
  } catch {
    return false; // Redis error — fail open
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Lockdown check (runs on every request) ────────────────────────────────
  // Admins bypass lockdown completely so they can keep operating the site
  // (add codes, manage hostels, TV, etc.) while customers see maintenance.
  if (!isLockdownExempt(pathname) && !isAdminSession(request)) {
    const locked = await isLockedDown();
    if (locked) {
      const maintenanceUrl = new URL("/maintenance", request.url);
      const response = NextResponse.redirect(maintenanceUrl, { status: 307 });
      // No-cache so the redirect itself is never cached
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return response;
    }
  }

  // Only rate-limit API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.ip ||
    "unknown";

  const cfg = RATE_LIMITS[pathname] || DEFAULT;
  const key = `${ip}:${pathname}`;

  // Try Redis first, fall back to in-memory
  const result =
    (await redisRateLimit(key, cfg.limit, cfg.windowSec)) ??
    memRateLimit(key, cfg.limit, cfg.windowSec * 1000);

  if (result.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(cfg.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(cfg.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (Next.js static assets)
     * - _next/image   (Next.js image optimisation)
     * - favicon.ico, icons/*, images/* (static files)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|images/).*)",
  ],
};
