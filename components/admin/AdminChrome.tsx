"use client";

/**
 * The shared admin frame: a sidebar that is pinned from `lg` up and an
 * overlay drawer below it, plus the mobile header that opens the drawer.
 *
 * Every admin page except the login screen goes through here — including the
 * dashboard, which used to render its own copy of the drawer. Two mounts of
 * the same nav meant two places to fix anything about it, and it left the
 * dashboard as the only page carrying a sign-out button.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import AdminDrawer from "@/components/admin/AdminDrawer";
import AdminSessionKeeper from "@/components/admin/AdminSessionKeeper";
import { useAttention } from "@/lib/adminNav";
import { useAuthStore } from "@/store/authStore";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { adminProfile } = useAuthStore();
  const isLogin = pathname === "/admin/login";
  // Analytics is superadmin-only, so module admins get the nav without
  // badges rather than a failed request on every page.
  const attention = useAttention(!isLogin && !!adminProfile?.isSuperAdmin);

  // A route change closes the drawer. Without this, tapping a link on a phone
  // navigates underneath a drawer that is still covering the page.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes it too — it is a modal overlay on small screens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (isLogin) return <>{children}</>;

  return (
    <div className="admin-shell">
      <AdminSessionKeeper />

      {/* Pinned from lg up; CSS hides it below that. */}
      <AdminDrawer pinned attention={attention} />

      <div className="admin-main">
        {/* The only way to the nav on a phone, so it is a real bar rather
            than a floating button that can sit under page content. */}
        <header className="admin-topbar">
          <button
            aria-label="Open admin navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="glass-icon"
          >
            <Menu size={19} />
          </button>
          <span className="truncate text-sm font-semibold text-slate-700">
            {adminProfile?.username ?? "Admin"}
          </span>
        </header>

        {children}
      </div>

      <AdminDrawer open={open} onClose={() => setOpen(false)} attention={attention} />
    </div>
  );
}
