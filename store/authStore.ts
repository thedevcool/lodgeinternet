"use client";

import { create } from "zustand";
import { adminFetch, apiFetch } from "@/lib/apiClient";
import {
  ADMIN_COOKIE_KEY as COOKIE_KEY,
  ADMIN_PROFILE_KEY as PROFILE_KEY,
  ADMIN_TOKEN_KEY as TOKEN_KEY,
  getAdminToken,
  isTokenLive,
} from "@/lib/adminSession";
import { clearAttentionCache } from "@/lib/adminNav";
import type { AdminModule, AdminProfile, ModulePermission } from "@/types";

interface AuthStore {
  isAuthenticated: boolean;
  adminProfile: AdminProfile | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  /** Renew a live session (and re-read permissions). False = it's over. */
  refresh: () => Promise<boolean>;
  /** Wipe local session state — used when the backend says it's over. */
  endSession: () => void;
  /** Returns true if the admin has any permission for the given module */
  canAccess: (module: string) => boolean;
  /** Returns true if the admin may view data in the given module */
  canRead: (module: string) => boolean;
  /** Returns true if the admin may perform write actions in the given module */
  canWrite: (module: string) => boolean;
  /** Returns true if the admin may access the given hostel (empty list = all) */
  canAccessHostel: (hostelId: string) => boolean;
}

// ─── Cookie / Storage helpers ─────────────────────────────────────────────────

const setCookie = (name: string, value: string, hours: number) => {
  const date = new Date();
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/;SameSite=Strict`;
};

const getCookie = (name: string): string | null => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let c of ca) {
    c = c.trim();
    if (c.startsWith(nameEQ)) return c.substring(nameEQ.length);
  }
  return null;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

function profileFrom(data: any, fallbackUsername: string): AdminProfile {
  return {
    username: data.username ?? fallbackUsername,
    role: data.isSuperAdmin ? "super-admin" : "admin",
    modulePermissions: data.modulePermissions ?? [],
    hostels: data.hostels ?? [],
    isSuperAdmin: data.isSuperAdmin ?? false,
    isPartner: data.isPartner ?? false,
    partnerSplitPercent: data.partnerSplitPercent ?? 0,
    partnerSplitMode: data.partnerSplitMode ?? "whole",
    partnerHostelSplits: data.partnerHostelSplits ?? {},
  };
}

/** Persist a session the backend just handed us (login or refresh). */
function storeSession(profile: AdminProfile, token: string | undefined): void {
  if (typeof window === "undefined") return;
  // The cookie is only a hint for the maintenance redirect; auth itself is
  // decided by the token below.
  setCookie(COOKIE_KEY, "true", 12);
  try {
    localStorage.setItem(COOKIE_KEY, "true");
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage blocked — the session lives for this page only
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  adminProfile: null,

  login: async (username: string, password: string) => {
    try {
      const response = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        const profile = profileFrom(data, username);
        set({ isAuthenticated: true, adminProfile: profile });
        storeSession(profile, data.token);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  },

  logout: () => get().endSession(),

  endSession: () => {
    set({ isAuthenticated: false, adminProfile: null });
    // The drawer's badge counts are module-scoped and would otherwise follow
    // the next admin who signs in on this browser.
    clearAttentionCache();
    if (typeof window !== "undefined") {
      deleteCookie(COOKIE_KEY);
      try {
        localStorage.removeItem(COOKIE_KEY);
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        // nothing to clear
      }
    }
  },

  refresh: async () => {
    try {
      const response = await adminFetch("/api/admin/refresh", { method: "POST" });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data?.success) return false;
      // Permissions come back fresh, so a revoked module applies from here on.
      const profile = profileFrom(data, get().adminProfile?.username ?? "");
      set({ isAuthenticated: true, adminProfile: profile });
      storeSession(profile, data.token);
      return true;
    } catch {
      // Offline or the backend is down — keep the session and try again later.
      return false;
    }
  },

  canAccess: (module: string) => {
    const { adminProfile } = get();
    if (!adminProfile) return false;
    if (adminProfile.isSuperAdmin) return true;
    return adminProfile.modulePermissions.some((mp) => mp.module === module);
  },

  canRead: (module: string) => {
    const { adminProfile } = get();
    if (!adminProfile) return false;
    if (adminProfile.isSuperAdmin) return true;
    const mp = adminProfile.modulePermissions.find(
      (mp) => mp.module === module,
    );
    if (!mp) return false;
    return mp.permission === "read" || mp.permission === "read-write";
  },

  canWrite: (module: string) => {
    const { adminProfile } = get();
    if (!adminProfile) return false;
    if (adminProfile.isSuperAdmin) return true;
    const mp = adminProfile.modulePermissions.find(
      (mp) => mp.module === module,
    );
    if (!mp) return false;
    return mp.permission === "write" || mp.permission === "read-write";
  },

  canAccessHostel: (hostelId: string) => {
    const { adminProfile } = get();
    if (!adminProfile) return false;
    if (adminProfile.isSuperAdmin) return true;
    // empty hostels array = access to all hostels
    if (adminProfile.hostels.length === 0) return true;
    return adminProfile.hostels.includes(hostelId);
  },
}));

// ─── Restore session on page load ─────────────────────────────────────────────

function readStoredProfile(): AdminProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AdminProfile) : null;
  } catch {
    // A corrupt value used to throw here at import time and blank the whole
    // admin app. Treat it as "no profile" instead.
    return null;
  }
}

/** Decide, from the token alone, whether this browser has a live session. */
function restoreSession(): void {
  if (isTokenLive(getAdminToken())) {
    useAuthStore.setState({ isAuthenticated: true, adminProfile: readStoredProfile() });
  } else {
    useAuthStore.getState().endSession();
  }
}

if (typeof window !== "undefined") {
  restoreSession();

  // Signing out (or in) in one tab now applies to the others.
  window.addEventListener("storage", (event) => {
    if (event.key === TOKEN_KEY || event.key === null) restoreSession();
  });
}
