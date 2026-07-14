import { getRedis } from "./redis";

// ─── Lua: Sliding-window rate limiter ─────────────────────────────────────────
//
// Atomic INCR + EXPIRE in a single eval — no race condition between
// reading the count and incrementing it, even across serverless instances.
//
// KEYS[1] = rate limit key
// ARGV[1] = window duration in seconds
// ARGV[2] = max allowed requests in the window
//
// Returns [allowed (0|1), current_count, ttl_seconds]

const RATE_LIMIT_LUA = `
local key = KEYS[1]
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

// ─── In-memory fallback (dev / Redis unavailable) ────────────────────────────

interface MemEntry {
  count: number;
  resetAt: number;
}

const memStore = new Map<string, MemEntry>();
let lastCleanup = Date.now();

function memCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of memStore) {
    if (now > v.resetAt) memStore.delete(k);
  }
}

function memRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): RateLimitResult {
  const now = Date.now();
  memCleanup();

  const entry = memStore.get(key);
  const resetAt = now + windowSec * 1000;

  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, retryAfter: windowSec };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return {
    allowed: true,
    remaining: limit - entry.count,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window resets
}

interface RateLimitOptions {
  /** Max requests allowed in the window (default: 30) */
  limit?: number;
  /** Window duration in seconds (default: 60) */
  windowSeconds?: number;
}

/**
 * Check and consume one unit from a sliding-window rate limiter.
 *
 * Uses Redis + Lua when available (atomic, shared across instances).
 * Falls back to in-memory if Redis is not configured.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const { limit = 30, windowSeconds = 60 } = options;
  const redisKey = `rl:${key}`;

  try {
    const redis = getRedis();
    const result = (await redis.eval(
      RATE_LIMIT_LUA,
      [redisKey],
      [String(windowSeconds), String(limit)],
    )) as [number, number, number];

    const [allowed, current, ttl] = result;

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, limit - current),
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    // Redis unavailable — fall back to in-memory
    return memRateLimit(key, limit, windowSeconds);
  }
}

/**
 * Extract client IP from a request (works on Vercel and local dev).
 */
export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers);
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
