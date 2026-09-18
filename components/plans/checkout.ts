import { encryptForStorage } from "@/lib/localStorageCrypto";

/**
 * Module-level helpers for the plans page, moved unchanged from
 * app/[slug]/plans/page.tsx.
 */

interface StoredCode {
  code: string; // encrypted
  planName: string;
  savedAt: number;
}

export async function saveCodeToLocalStorage(code: string, planName: string, uid: string) {
  try {
    const raw = localStorage.getItem("lodgeCodes");
    const codes: StoredCode[] = raw ? JSON.parse(raw) : [];
    const encrypted = await encryptForStorage(code, uid);
    codes.unshift({ code: encrypted, planName, savedAt: Date.now() });
    if (codes.length > 20) codes.length = 20;
    localStorage.setItem("lodgeCodes", JSON.stringify(codes));
  } catch {
    // localStorage or crypto unavailable
  }
}

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

export type PlanView = "device" | "tv" | "unlimited";
export type PendingPayment =
  | { kind: "device" }
  | { kind: "tv"; isExisting: boolean };

/** Human-readable duration label from a plan's duration in days. */
export function durationLabel(duration?: number): string {
  if (!duration) return "Monthly";
  if (duration === 1) return "Daily";
  if (duration === 7) return "Weekly";
  if (duration === 30) return "Monthly";
  return `${duration}-Day`;
}

/**
 * The line under a plan's name — the exact strings the old plan card used:
 *   TV:        "30 Days Subscription"
 *   Unlimited: "7 Day Unlimited • 3 Devices" (or "Daily Unlimited")
 *   Device:    "Weekly Plan • 5 Devices"
 */
export function planTypeLine(plan: { planType?: string; duration?: number; usersCount?: number }): string {
  if (plan.planType === "tv") return `${plan.duration} Days Subscription`;
  if (plan.planType === "unlimited") {
    return `${plan.duration ? plan.duration + " Day" : "Daily"} Unlimited${plan.usersCount ? ` • ${plan.usersCount} Device${plan.usersCount !== 1 ? "s" : ""}` : ""}`;
  }
  return `${durationLabel(plan.duration)} Plan • ${plan.usersCount} Device${plan.usersCount !== 1 ? "s" : ""}`;
}
