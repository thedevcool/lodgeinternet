"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export default function ProtectedRoute({
  children,
  module,
  requireWrite,
  requireSuperAdmin,
}: {
  children: React.ReactNode;
  /** If provided, the admin must have access to this module */
  module?: string;
  /** If true, the admin must have write permission for the module */
  requireWrite?: boolean;
  /** If true, only a super admin may open this page (match the endpoints it calls) */
  requireSuperAdmin?: boolean;
}) {
  const { isAuthenticated, canAccess, canWrite, adminProfile } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    // Read the store directly, not the rendered value. While React hydrates
    // the server's HTML, the hook reports the server's view — signed out,
    // since the session lives in browser storage — and redirecting on that
    // sent every full page load or refresh back to the login screen. The
    // store itself was restored from storage before this ran.
    if (!useAuthStore.getState().isAuthenticated) {
      // Carry the current page so signing in returns here.
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, pathname, router]);

  if (!isAuthenticated) {
    return (
      <div className="analytics-shell min-h-dvh flex items-center justify-center px-4">
        <div className="glass-panel w-full max-w-sm text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Super-admin-only pages: every endpoint behind them requires it, so
  // opening the page by URL should refuse here rather than render a shell
  // whose data all comes back 403.
  if (requireSuperAdmin && !adminProfile?.isSuperAdmin) {
    return <AccessDenied router={router} />;
  }

  // Module-level access check
  if (module && !canAccess(module)) {
    return (
      <AccessDenied router={router} />
    );
  }

  // Write-permission check (optional — individual pages use canWrite() directly)
  if (module && requireWrite && !canWrite(module)) {
    return (
      <div className="analytics-shell min-h-dvh flex items-center justify-center px-4">
        <div className="glass-panel w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-5V7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Read-Only Access
          </h2>
          <p className="text-slate-600 mb-6 text-sm">
            You only have read access to this section. Write actions are
            restricted.
          </p>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="glass-primary w-full sm:w-auto"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Shown when an admin opens a page they may not use. */
function AccessDenied({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
      <div className="analytics-shell min-h-dvh flex items-center justify-center px-4">
        <div className="glass-panel w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-600 mb-6 text-sm">
            You don&apos;t have permission to access this section. Contact the
            super-admin to request access.
          </p>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="glass-primary w-full sm:w-auto"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
  );
}
