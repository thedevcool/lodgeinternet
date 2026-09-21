import { ADMIN_NAV } from "./adminNav";
import type { AdminProfile } from "@/types";

/**
 * Where a given admin belongs after signing in.
 *
 * The analytics overview is super-admin-only, yet the login page and the
 * "Back to Dashboard" buttons all point at `/admin/dashboard`. Pointing every
 * admin there would leave module admins staring at an Access Denied page, so
 * this decides the real destination: super-admins get the dashboard, module
 * admins get their first accessible section (in navigation order), and an
 * admin with no modules gets nothing (`null`) — the caller falls back to the
 * dashboard's Access Denied page, which is the honest answer for that case.
 */
export function adminHome(profile: AdminProfile | null): string | null {
  if (!profile) return null;
  if (profile.isSuperAdmin) return "/admin/dashboard";

  const first = ADMIN_NAV.find(
    (item) =>
      !item.superAdminOnly &&
      profile.modulePermissions.some((mp) => mp.module === item.module),
  );
  return first?.href ?? null;
}