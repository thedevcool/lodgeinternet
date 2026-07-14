"use client";

import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";
import type { AdminModule, AdminProfile, ModulePermission } from "@/types";

interface AuthStore {
  isAuthenticated: boolean;
  adminProfile: AdminProfile | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
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

const COOKIE_KEY = "Davo-Nexus Limited-admin";
const PROFILE_KEY = "Davo-Nexus Limited-admin-profile";
// Signed admin session token issued by the FastAPI backend on login. `apiClient`
// reads this same key to attach `Authorization: Bearer` on admin API calls.
const TOKEN_KEY = "Davo-Nexus Limited-admin-token";

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
        const profile: AdminProfile = {
          username: data.username ?? username,
          role: data.isSuperAdmin ? "super-admin" : "admin",
          modulePermissions: data.modulePermissions ?? [],
          hostels: data.hostels ?? [],
          isSuperAdmin: data.isSuperAdmin ?? false,
          isPartner: data.isPartner ?? false,
          partnerSplitPercent: data.partnerSplitPercent ?? 0,
        };
        set({ isAuthenticated: true, adminProfile: profile });
        if (typeof window !== "undefined") {
          setCookie(COOKIE_KEY, "true", 12);
          localStorage.setItem(COOKIE_KEY, "true");
          localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
          // Persist the signed session token for admin API calls.
          if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  },

  logout: () => {
    set({ isAuthenticated: false, adminProfile: null });
    if (typeof window !== "undefined") {
      deleteCookie(COOKIE_KEY);
      localStorage.removeItem(COOKIE_KEY);
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(TOKEN_KEY);
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

if (typeof window !== "undefined") {
  const cookieAuth = getCookie(COOKIE_KEY) === "true";
  if (cookieAuth) {
    const profileJson = localStorage.getItem(PROFILE_KEY);
    const profile: AdminProfile | null = profileJson
      ? (JSON.parse(profileJson) as AdminProfile)
      : null;
    useAuthStore.setState({ isAuthenticated: true, adminProfile: profile });
  } else {
    localStorage.removeItem(COOKIE_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    useAuthStore.setState({ isAuthenticated: false, adminProfile: null });
  }
}
