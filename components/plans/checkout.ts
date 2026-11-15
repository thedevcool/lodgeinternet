import { encryptForStorage } from "@/lib/localStorageCrypto";

/**
 * Module-level helpers for the plans page, moved from
 * app/[slug]/plans/page.tsx.
 *
 * Saving a code on the device is a convenience (the dashboard shows it for
 * six hours); the purchase itself lives on the server. So nothing here may
 * stop the checkout, and nothing here logs a code.
 */

interface StoredCode {
  code: string; // encrypted
  planName: string;
  savedAt: number;
}

const SAVED_CODES_KEY = "lodgeCodes";

/**
 * The codes already saved on this device, or a fresh list when the saved
 * value can't be read. A damaged value (cut off mid-write, or edited by
 * hand) used to make JSON.parse throw on every purchase after it, so no code
 * was ever saved on that device again.
 */
function readSavedCodes(): StoredCode[] {
  const raw = localStorage.getItem(SAVED_CODES_KEY);
  if (!raw) return [];
  try {
    const saved: unknown = JSON.parse(raw);
    if (Array.isArray(saved)) return saved as StoredCode[];
    console.warn("Saved codes on this device were not a list; starting a fresh one.");
  } catch (err) {
    console.warn("Saved codes on this device could not be read; starting a fresh list.", err);
  }
  return [];
}

export async function saveCodeToLocalStorage(code: string, planName: string, uid: string) {
  try {
    const codes = readSavedCodes();
    const encrypted = await encryptForStorage(code, uid);
    codes.unshift({ code: encrypted, planName, savedAt: Date.now() });
    if (codes.length > 20) codes.length = 20;
    localStorage.setItem(SAVED_CODES_KEY, JSON.stringify(codes));
  } catch (err) {
    // The browser blocks storage or has no crypto (private mode, quota).
    // The customer still has the code on screen, in their Account and by
    // email, so the checkout carries on; the reason is logged, the code is not.
    console.warn("Could not save the code on this device.", err);
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
