"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onCustomerChange, type Customer } from "@/lib/customerAuth";

/**
 * One sign-in subscription for the shared chrome (nav bar "Sign in" vs
 * "Account", the Account tab target). Pages keep their own auth logic — this
 * only drives what the chrome shows.
 */
type CustomerState = { user: Customer | null; ready: boolean };

const CustomerContext = createContext<CustomerState>({ user: null, ready: false });

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CustomerState>({ user: null, ready: false });

  useEffect(() => {
    return onCustomerChange((user) => setState({ user, ready: true }));
  }, []);

  return <CustomerContext.Provider value={state}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  return useContext(CustomerContext);
}
