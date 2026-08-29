"use client";

/**
 * Puts the shared navigation drawer on every admin page except the two that
 * own their own header: the dashboard (which renders the drawer itself) and
 * the login screen (which has nothing to navigate to yet).
 */

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import AdminDrawer from "@/components/admin/AdminDrawer";
import { useAttention } from "@/lib/adminNav";
import { useAuthStore } from "@/store/authStore";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { adminProfile } = useAuthStore();
  const ownsItsOwnDrawer = pathname === "/admin/dashboard" || pathname === "/admin/login";
  // Analytics is superadmin-only, so module admins get the drawer without
  // badges rather than a failed request on every page.
  const attention = useAttention(!ownsItsOwnDrawer && !!adminProfile?.isSuperAdmin);

  if (ownsItsOwnDrawer) return <>{children}</>;

  return (
    <>
      <button aria-label="Open admin navigation" onClick={() => setOpen(true)} className="admin-global-menu">
        <Menu size={19} />
      </button>
      {children}
      <AdminDrawer open={open} onClose={() => setOpen(false)} attention={attention} />
    </>
  );
}
