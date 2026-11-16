/**
 * The fixtures the specs assert against, read from the same files the
 * stand-in API serves (e2e/fixtures/). A spec that expects "N3,350" takes it
 * from here, so the figure on screen is compared with the figure the server
 * sent and never with one worked out a second time in the test.
 */
import customersFile from "../fixtures/customers.json";
import plansFile from "../fixtures/plans.json";
import walletFile from "../fixtures/wallet.json";

export const CUSTOMER_PASSWORD = customersFile.password;
export const VERIFICATION_CODE = customersFile.verificationCode;
export const RESET_CODE = customersFile.resetCode;
export const CUSTOMERS = customersFile.customers;
export const WALLET = walletFile;

export type PlanKey = "5gb-weekly" | "20gb-monthly" | "40gb-monthly" | "90gb-monthly" | "40gb-monthly-5" | "unlimited-weekly" | "tv-monthly";

/** A plan as the stand-in serves it, with the code it issues for it. */
export function plan(key: PlanKey) {
  const found = plansFile.plans.find((p) => p.key === key);
  if (!found) throw new Error(`No fixture plan called ${key}`);
  const codes: Record<string, string> = plansFile.codes;
  return { ...found, code: codes[key] ?? "" };
}

/** The id the stand-in gives this plan at this hostel ("unity-lodge--20gb-monthly"). */
export function planIdAt(hostelSlug: string, key: PlanKey): string {
  return `${hostelSlug}--${key}`;
}

/** Whole naira as the site prints it: 3350 → "₦3,350". Formatting only, no arithmetic. */
export function naira(amount: number): string {
  return `₦${amount.toLocaleString("en-US")}`;
}

/** The plans pages the specs use most. */
export const UNITY_LODGE_PLANS = "/unity-estate/unity-lodge/plans";
export const PALM_COURT_PLANS = "/palm-grove/palm-court/plans";

/** The page Palm Court's welcome-code poster opens, and the code it gives (e2e/mock-api.mjs, WELCOME). */
export const WELCOME_POSTER = "/welcome/palm-court-poster-1";
export const WELCOME_CODE = "WELC7Q2M";
export const WELCOME_GIVES = "2GB for 1 day, up to 3 devices";
