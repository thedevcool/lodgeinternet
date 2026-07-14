import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

/**
 * Lazy-initialised Upstash Redis singleton.
 *
 * Requires two env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * @upstash/redis uses HTTP (REST), so it works in every
 * serverless runtime (Vercel Edge, Node, Cloudflare Workers).
 */
export function getRedis(): Redis {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in environment variables.",
    );
  }

  redis = new Redis({ url, token });
  return redis;
}
