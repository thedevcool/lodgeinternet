import { randomInt } from "crypto";
import { getRedis } from "./redis";

// ─── Constants ────────────────────────────────────────────────────────────────

const CODE_DIGITS = 6;
const CODE_MIN = 10 ** (CODE_DIGITS - 1); // 100000
const CODE_MAX = 10 ** CODE_DIGITS; // 1000000 (exclusive)
const CODE_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_ATTEMPTS = 5; // max wrong attempts before lockout
const LOCKOUT_SECONDS = 15 * 60; // 15-minute lockout after max attempts

// Redis key helpers
const codeKey = (userId: string) => `verify:code:${userId}`;
const attemptsKey = (userId: string) => `verify:attempts:${userId}`;

// ─── Generate ─────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure 6-digit verification code.
 * Uses Node's `crypto.randomInt` which draws from the OS CSPRNG.
 */
export function generateCode(): string {
  return String(randomInt(CODE_MIN, CODE_MAX));
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Store a verification code in Redis with auto-expiring TTL.
 * Overwrites any existing code for the same userId (resend flow).
 * Also resets the failed-attempt counter.
 */
export async function storeCode(userId: string, code: string): Promise<void> {
  const redis = getRedis();

  // Atomic: set code with TTL + reset attempts counter
  // Using a pipeline to batch both commands in a single round-trip
  const pipe = redis.pipeline();
  pipe.set(codeKey(userId), code, { ex: CODE_TTL_SECONDS });
  pipe.del(attemptsKey(userId));
  await pipe.exec();
}

// ─── Verify (Lua — atomic) ───────────────────────────────────────────────────

/**
 * Lua script: atomically verifies a code and prevents race conditions.
 *
 * KEYS[1] = verify:code:{userId}
 * KEYS[2] = verify:attempts:{userId}
 * ARGV[1] = submitted code
 * ARGV[2] = max attempts allowed
 * ARGV[3] = lockout TTL in seconds
 *
 * Returns:
 *   1  = success (code matched + deleted)
 *  -1  = code expired / not found
 *  -2  = wrong code (attempts incremented)
 *  -3  = locked out (too many wrong attempts)
 */
const VERIFY_LUA = `
local code_key = KEYS[1]
local attempts_key = KEYS[2]
local submitted = ARGV[1]
local max_attempts = tonumber(ARGV[2])
local lockout_ttl = tonumber(ARGV[3])

-- Check lockout first
local attempts = tonumber(redis.call("GET", attempts_key) or "0")
if attempts >= max_attempts then
  return -3
end

-- Get stored code
local stored = redis.call("GET", code_key)
if not stored then
  return -1
end

-- Compare
if stored == submitted then
  -- Correct: delete code + attempts atomically
  redis.call("DEL", code_key)
  redis.call("DEL", attempts_key)
  return 1
else
  -- Wrong: increment attempts with lockout TTL
  redis.call("INCR", attempts_key)
  redis.call("EXPIRE", attempts_key, lockout_ttl)
  return -2
end
`;

// ─── Password Reset code keys (separate namespace from email-verify) ─────────

const resetCodeKey = (userId: string) => `reset:code:${userId}`;
const resetAttemptsKey = (userId: string) => `reset:attempts:${userId}`;

/**
 * Store a password-reset code in Redis (10-minute TTL).
 * Resets attempt counter on each call (resend flow).
 */
export async function storeResetCode(userId: string, code: string): Promise<void> {
  const redis = getRedis();
  const pipe = redis.pipeline();
  pipe.set(resetCodeKey(userId), code, { ex: CODE_TTL_SECONDS });
  pipe.del(resetAttemptsKey(userId));
  await pipe.exec();
}

/**
 * Atomically verify a password-reset code.
 * Same Lua logic as email verify — single-use, rate-limited.
 */
export async function verifyResetCode(
  userId: string,
  submittedCode: string,
): Promise<VerifyResult> {
  const redis = getRedis();
  const result = await redis.eval(
    VERIFY_LUA,
    [resetCodeKey(userId), resetAttemptsKey(userId)],
    [submittedCode, String(MAX_ATTEMPTS), String(LOCKOUT_SECONDS)],
  );
  switch (result) {
    case 1:  return { ok: true };
    case -1: return { ok: false, reason: "expired" };
    case -2: return { ok: false, reason: "wrong_code" };
    case -3: return { ok: false, reason: "locked_out" };
    default: return { ok: false, reason: "expired" };
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "wrong_code" | "locked_out" };

/**
 * Atomically verify a submitted code against Redis.
 *
 * - If correct: deletes the code (single-use) and resets attempts.
 * - If wrong: increments the attempt counter.
 * - If locked out: rejects immediately without checking the code.
 *
 * All logic runs inside a single Lua script — no race conditions
 * even under concurrent requests.
 */
export async function verifyCode(
  userId: string,
  submittedCode: string,
): Promise<VerifyResult> {
  const redis = getRedis();

  const result = await redis.eval(
    VERIFY_LUA,
    [codeKey(userId), attemptsKey(userId)],
    [submittedCode, String(MAX_ATTEMPTS), String(LOCKOUT_SECONDS)],
  );

  switch (result) {
    case 1:
      return { ok: true };
    case -1:
      return { ok: false, reason: "expired" };
    case -2:
      return { ok: false, reason: "wrong_code" };
    case -3:
      return { ok: false, reason: "locked_out" };
    default:
      return { ok: false, reason: "expired" };
  }
}
