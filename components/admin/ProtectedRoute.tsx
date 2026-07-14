"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export default function ProtectedRoute({
  children,
  module,
  requireWrite,
}: {
  children: React.ReactNode;
  /** If provided, the admin must have access to this module */
  module?: string;
  /** If true, the admin must have write permission for the module */
  requireWrite?: boolean;
}) {
  const { isAuthenticated, canAccess, canWrite } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/admin/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-apple-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Module-level access check
  if (module && !canAccess(module)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-apple-gray-50">
        <div className="text-center p-8 max-w-sm">
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
          <h2 className="text-xl font-bold text-apple-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-apple-gray-600 mb-6 text-sm">
            You don&apos;t have permission to access this section. Contact the
            super-admin to request access.
          </p>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Write-permission check (optional — individual pages use canWrite() directly)
  if (module && requireWrite && !canWrite(module)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-apple-gray-50">
        <div className="text-center p-8 max-w-sm">
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
          <h2 className="text-xl font-bold text-apple-gray-900 mb-2">
            Read-Only Access
          </h2>
          <p className="text-apple-gray-600 mb-6 text-sm">
            You only have read access to this section. Write actions are
            restricted.
          </p>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
