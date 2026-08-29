"use client";

/**
 * The admin navigation model, shared by the dashboard drawer and the global
 * `AdminChrome` drawer so the two can never drift apart.
 *
 * Badge counts come from the analytics endpoint's `attention.modules` map: the
 * backend decides what "needs attention" means for each section, and the
 * browser only renders the number.
 */

import {
  Activity,
  BarChart3,
  Building2,
  Database,
  Grid2X2,
  KeyRound,
  Mail,
  Server,
  Settings,
  ShieldCheck,
  Tv,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "./apiClient";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission module slug, and the key used for the attention badge. */
  module: string;
  /** One line for the tiled view; the drawer shows the label alone. */
  description: string;
  /** Superadmin-only links stay hidden from module admins entirely. */
  superAdminOnly?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { label: "Data Codes", href: "/admin/data-codes", icon: KeyRound, module: "data-codes",
    description: "Pools, pricing, voucher stock and Omada sync." },
  { label: "Controllers", href: "/admin/controllers", icon: Server, module: "controllers",
    description: "Omada controllers, member hostels and pool metadata." },
  { label: "Transactions", href: "/admin/transactions", icon: BarChart3, module: "transactions",
    description: "Purchases, revenue splits and partner statements." },
  { label: "Bot Analytics", href: "/admin/bot-analytics", icon: Activity, module: "bot-analytics",
    description: "WhatsApp checkouts, payment methods and drop-off." },
  { label: "TV Users", href: "/admin/tv-users", icon: Tv, module: "tv-users",
    description: "Subscriptions awaiting activation and expiry." },
  { label: "Users", href: "/admin/users", icon: Users, module: "users",
    description: "Customer accounts, hostels and verification." },
  { label: "Hostels", href: "/admin/hostels", icon: Building2, module: "hostels",
    description: "Hostels, collages and per-hostel overrides." },
  { label: "Emails", href: "/admin/emails", icon: Mail, module: "emails",
    description: "Campaigns, drafts and customer feedback." },
  { label: "Migrations", href: "/admin/migrations", icon: Database, module: "migrations",
    description: "One-off data moves and repair jobs." },
  { label: "Waitlist", href: "/admin/waitlist", icon: Grid2X2, module: "waitlist",
    description: "People asking for service where there is none yet." },
  { label: "Admins", href: "/admin/admins", icon: ShieldCheck, module: "admins", superAdminOnly: true,
    description: "Admin accounts, roles and module permissions." },
  { label: "Settings", href: "/admin/settings", icon: Settings, module: "settings",
    description: "Site lockdown and global configuration." },
];

export type AttentionCounts = Record<string, number>;

/**
 * Module-scoped so moving between admin pages reuses the counts instead of
 * re-requesting them on every mount. The endpoint is a single document read,
 * but the drawer is chrome — it should never be the reason a page waits.
 */
const BADGE_TTL_MS = 60_000;
let cached: { at: number; counts: AttentionCounts } | null = null;

export function primeAttention(counts: AttentionCounts | undefined): void {
  if (counts) cached = { at: Date.now(), counts };
}

/** Attention badge counts, or an empty map when they are not available. */
export function useAttention(enabled: boolean): AttentionCounts {
  const [counts, setCounts] = useState<AttentionCounts>(() => cached?.counts ?? {});

  useEffect(() => {
    if (!enabled) return;
    if (cached && Date.now() - cached.at < BADGE_TTL_MS) {
      setCounts(cached.counts);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch("/api/admin/analytics", { signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        const modules = (body?.attention?.modules ?? {}) as AttentionCounts;
        cached = { at: Date.now(), counts: modules };
        setCounts(modules);
      } catch {
        // Badges are decoration. A failure here must never surface as an
        // error on a page that is otherwise working.
      }
    })();
    return () => controller.abort();
  }, [enabled]);

  return counts;
}
