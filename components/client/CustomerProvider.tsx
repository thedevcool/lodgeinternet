"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";

/**
 * One Firebase auth subscription for the shared chrome (nav bar "Sign in" vs
 * "Account", the Account tab target). Pages keep their own auth logic — this
 * only drives what the chrome shows.
 */
type Customer = { user: User | null; ready: boolean };

const CustomerContext = createContext<Customer>({ user: null, ready: false });

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Customer>({ user: null, ready: false });

  useEffect(() => {
    try {
      return onAuthStateChanged(getAuthInstance(), (user) => setState({ user, ready: true }));
    } catch {
      // Firebase not configured — behave as signed out.
      setState({ user: null, ready: true });
      return undefined;
    }
  }, []);

  return <CustomerContext.Provider value={state}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  return useContext(CustomerContext);
}
