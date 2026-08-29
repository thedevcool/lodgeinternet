"use client";

/**
 * The one liquid-glass navigation drawer. Both the dashboard header and the
 * global `AdminChrome` button open this, so every admin section is reachable
 * from every other one and the link list only exists in `lib/adminNav`.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronRight, X } from "lucide-react";
import { ADMIN_NAV, type AttentionCounts } from "@/lib/adminNav";
import { useAuthStore } from "@/store/authStore";

const DASHBOARD = "/admin/dashboard";

export default function AdminDrawer({
  open,
  onClose,
  attention = {},
}: {
  open: boolean;
  onClose: () => void;
  attention?: AttentionCounts;
}) {
  const pathname = usePathname();
  const { adminProfile, canAccess } = useAuthStore();
  if (!open) return null;

  const links = ADMIN_NAV.filter(
    (item) => (item.superAdminOnly ? adminProfile?.isSuperAdmin : canAccess(item.module)),
  );

  return (
    <>
      <button
        aria-label="Close navigation overlay"
        className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="glass-drawer fixed left-3 top-3 bottom-3 z-[70] w-[min(360px,calc(100vw-24px))] overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">LODGE INTERNET</p>
            <h2 className="text-xl font-semibold">Control centre</h2>
          </div>
          <button aria-label="Close navigation" onClick={onClose} className="glass-icon">
            <X size={18} />
          </button>
        </div>

        <nav className="mt-6 space-y-1">
          <Link
            href={DASHBOARD}
            onClick={onClose}
            aria-current={pathname === DASHBOARD ? "page" : undefined}
            className={`drawer-link${pathname === DASHBOARD ? " active" : ""}`}
          >
            <BarChart3 size={18} />
            <span className="flex-1">Analytics overview</span>
            <ChevronRight size={15} className="opacity-40" />
          </Link>

          {links.map(({ label, href, icon: Icon, module }) => {
            const badge = attention[module] || 0;
            const current = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={current ? "page" : undefined}
                className={`drawer-link${current ? " active" : ""}`}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="drawer-badge" aria-label={`${badge} need attention`}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                <ChevronRight size={15} className="opacity-40" />
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
