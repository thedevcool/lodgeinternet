"use client";

/**
 * Customer sign-in.
 *
 * The backend keeps a customer's sign-in in an HttpOnly cookie
 * (backend/app/core/cookies.py): no script on these pages ever sees a token,
 * and every `apiFetch` call carries the cookie by itself. This module only
 * knows *who* is signed in, so pages can show the right thing, and makes the
 * sign-in calls:
 *
 * - `signIn`, `signUp`, `signOut`;
 * - `confirmPassword`: re-enter the password when the backend asks for a
 *   recent sign-in (SESSION_EXPIRED); the page then simply retries;
 * - `deleteUnfinishedAccount`: the register page's clean-up when saving the
 *   profile fails.
 *
 * `onCustomerChange` tells a page who is signed in once that is known, and
 * again whenever it changes, in this tab or another. Errors carry the codes
 * the pages check (`auth/invalid-credential`, `auth/email-already-in-use`, ...).
 */

import { apiFetch, CUSTOMER_REFUSED_EVENT } from "./apiClient";

export type Customer = { uid: string; email: string };

/** An error with a `code` the pages check. */
export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const CODES: Record<string, string> = {
  INVALID_CREDENTIALS: "auth/invalid-credential",
  ACCOUNT_DISABLED: "auth/user-disabled",
  EMAIL_IN_USE: "auth/email-already-in-use",
  WEAK_PASSWORD: "auth/weak-password",
  INVALID_EMAIL: "auth/invalid-email",
  INVALID_TOKEN: "auth/user-token-expired",
  NOT_SIGNED_IN: "auth/user-token-expired",
};

async function call(path: string, method: string, body?: object): Promise<any> {
  let response: Response;
  try {
    response = await apiFetch(path, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new AuthError("auth/network-request-failed", "Network error. Please check your connection.");
  }
  let data: any = {};
  try {
    data = await response.json();
  } catch {
    // no body
  }
  if (!response.ok) {
    const code = response.status === 429 ? "auth/too-many-requests" : CODES[data.code] ?? "auth/internal-error";
    throw new AuthError(code, data.error || "Something went wrong. Please try again.");
  }
  return data;
}

// ─── Who is signed in ────────────────────────────────────────────────────────

// Written when someone signs in or out here, so other tabs check again.
const CHANGED_KEY = "lodge.customerChanged";
// Where the website kept its sign-in tokens before the cookie.
const OLD_SESSION_KEY = "lodge.customerSession";

let customer: Customer | null = null;
let firstCheck: Promise<void> | null = null;
let checking: Promise<void> | null = null;
const listeners = new Set<(customer: Customer | null) => void>();

function setCustomer(next: Customer | null, tellOtherTabs: boolean): void {
  const changed = customer?.uid !== next?.uid;
  customer = next;
  if (!changed) return;
  for (const listener of Array.from(listeners)) listener(customer);
  if (tellOtherTabs) {
    try {
      window.localStorage.setItem(CHANGED_KEY, String(Date.now()));
    } catch {
      // storage blocked: other tabs catch up on their next request
    }
  }
}

/** Ask the backend who is signed in on this browser. */
function check(): Promise<void> {
  if (!checking) {
    checking = call("/api/auth/session", "GET")
      .then((data) => setCustomer({ uid: data.userId, email: data.email }, false))
      .catch(() => setCustomer(null, false))
      .finally(() => {
        checking = null;
      });
  }
  return checking;
}

function ready(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!firstCheck) {
    try {
      window.localStorage.removeItem(OLD_SESSION_KEY);
    } catch {
      // nothing to clear
    }
    window.addEventListener("storage", (event) => {
      if (event.key === CHANGED_KEY) void check();
    });
    // A request was refused as not signed in: the session may have ended
    // elsewhere (a password reset, an admin blocking the account).
    window.addEventListener(CUSTOMER_REFUSED_EVENT, () => void check());
    firstCheck = check();
  }
  return firstCheck;
}

/** Who is signed in, or null (also until the first check has answered). */
export function currentCustomer(): Customer | null {
  void ready();
  return customer;
}

/** Calls `callback` once it is known who is signed in, and on every change after. */
export function onCustomerChange(callback: (customer: Customer | null) => void): () => void {
  listeners.add(callback);
  let active = true;
  void ready().then(() => {
    if (active) callback(customer);
  });
  return () => {
    active = false;
    listeners.delete(callback);
  };
}

// ─── Signing in and out ──────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<Customer> {
  await ready();
  const data = await call("/api/auth/login", "POST", { email, password });
  const signedIn = { uid: data.userId, email: data.email };
  setCustomer(signedIn, true);
  return signedIn;
}

/** A new account with this password, signed in straight away. */
export async function signUp(email: string, password: string): Promise<Customer> {
  await ready();
  const data = await call("/api/auth/signup", "POST", { email, password });
  const signedIn = { uid: data.userId, email: data.email ?? email };
  setCustomer(signedIn, true);
  return signedIn;
}

export async function signOut(): Promise<void> {
  await ready();
  await call("/api/auth/logout", "POST", {}).catch(() => undefined);
  setCustomer(null, true);
}

/** Re-enter the password: the session counts as signed in just now. */
export async function confirmPassword(password: string): Promise<void> {
  await call("/api/auth/reauth", "POST", { password });
}

/** Remove the signed-in account, if registration never reached a profile. */
export async function deleteUnfinishedAccount(): Promise<void> {
  await call("/api/auth/account", "DELETE");
  setCustomer(null, true);
}
