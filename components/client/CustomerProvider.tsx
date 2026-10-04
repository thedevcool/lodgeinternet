"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/apiClient";
import { onCustomerChange, type Customer } from "@/lib/customerAuth";

/**
 * One sign-in subscription for the shared chrome (nav bar "Sign in" vs
 * "Account", the Account tab target) and for the hostel lock: a signed-in,
 * verified customer is locked to the hostel they registered at, and the pages
 * that list hostels show only that one (components/client/YourHostel.tsx).
 */
type CustomerState = {
  user: Customer | null;
  ready: boolean;
  /** The hostel a signed-in, verified customer is locked to; null when there
   * is none (signed out, not verified yet, or no hostel chosen). */
  lockedHostel: string | null;
  /** Whether `lockedHostel` is known yet (it needs the profile). */
  hostelKnown: boolean;
};

const UNKNOWN: CustomerState = { user: null, ready: false, lockedHostel: null, hostelKnown: false };
const CustomerContext = createContext<CustomerState>(UNKNOWN);

const PROFILE_CHANGED_EVENT = "lodge:customer-profile-changed";

/** Call after the profile changed in a way that can set the lock (the email
 * verified, the first hostel chosen), so the pages apply it straight away. */
export function profileChanged(): void {
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

async function lockedHostelOf(user: Customer): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/auth/user?userId=${user.uid}`);
    if (!res.ok) return null;
    const profile = (await res.json()).profile;
    const hostel = profile?.hostelId;
    return profile?.emailVerified && hostel && hostel !== "Unknown" ? hostel : null;
  } catch {
    return null;
  }
}

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CustomerState>(UNKNOWN);

  useEffect(() => {
    let latest: Customer | null = null;
    const loadHostel = (user: Customer) =>
      void lockedHostelOf(user).then((lockedHostel) => {
        if (latest?.uid === user.uid) setState({ user, ready: true, lockedHostel, hostelKnown: true });
      });
    const reload = () => {
      if (latest) loadHostel(latest);
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, reload);
    const unsubscribe = onCustomerChange((user) => {
      latest = user;
      if (!user) {
        setState({ user: null, ready: true, lockedHostel: null, hostelKnown: true });
        return;
      }
      setState({ user, ready: true, lockedHostel: null, hostelKnown: false });
      loadHostel(user);
    });
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, reload);
      unsubscribe();
    };
  }, []);

  return <CustomerContext.Provider value={state}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  return useContext(CustomerContext);
}
