"use client";

/**
 * The one liquid-glass navigation sidebar. It renders in two modes from the
 * same markup, because two copies of a nav list is how the two drift apart:
 *
 *   - pinned   — always on screen from `lg` up, part of the page layout
 *   - overlay  — a drawer over the content, for phones and tablets
 *
 * The link list only exists in `lib/adminNav`, and the sign-out control lives
 * here rather than on any one page. It used to sit in the dashboard header,
 * which is superadmin-only and `hidden lg:inline-flex` — so a sub-admin had
 * no way to sign out at all, and a superadmin lost it on a phone.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronRight, LogOut, X } from "lucide-react";
import Logo from "@/components/Logo";
import { ADMIN_NAV, clearAttentionCache, type AttentionCounts } from "@/lib/adminNav";
import { useAuthStore } from "@/store/authStore";

const DASHBOARD = "/admin/dashboard";

export default function AdminDrawer({
  open,
  onClose,
  attention = {},
  pinned = false,
}: {
  open?: boolean;
  onClose?: () => void;
  attention?: AttentionCounts;
  /** Render as part of the layout instead of as an overlay. */
  pinned?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { adminProfile, canAccess, logout } = useAuthStore();

  if (!pinned && !open) return null;

  const links = ADMIN_NAV.filter(
    (item) => (item.superAdminOnly ? adminProfile?.isSuperAdmin : canAccess(item.module)),
  );

  const signOut = () => {
    // The badge counts belong to the admin who is leaving.
    clearAttentionCache();
    logout();
    router.push("/admin/login");
  };

  const nav = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo variant="dark" />
          <div className="min-w-0">
            <p className="eyebrow">LODGE INTERNET</p>
            <h2 className="truncate text-lg font-semibold">Control centre</h2>
          </div>
        </div>
        {!pinned && (
          <button aria-label="Close navigation" onClick={onClose} className="glass-icon shrink-0">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto">
        {adminProfile?.isSuperAdmin && (
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
        )}

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

      {/* Who you are and how to leave — for every admin, at every width. */}
      <div className="drawer-footer">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            {adminProfile?.username ?? "Signed in"}
          </p>
          <p className="text-xs text-slate-500">
            {adminProfile?.isSuperAdmin
              ? "Superadmin"
              : adminProfile?.isPartner
                ? "Partner"
                : "Admin"}
          </p>
        </div>
        <button onClick={signOut} className="drawer-signout" aria-label="Sign out">
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );

  if (pinned) {
    return <aside className="admin-sidebar glass-drawer">{nav}</aside>;
  }

  return (
    <>
      <button
        aria-label="Close navigation overlay"
        className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="glass-drawer fixed left-3 top-3 bottom-3 z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col p-5">
        {nav}
      </aside>
    </>
  );
}
