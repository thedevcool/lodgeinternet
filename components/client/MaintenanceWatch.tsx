"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

/**
 * Sends customers to /maintenance while the site is locked down.
 *
 * This used to be a server redirect in the Next middleware, which needed the
 * frontend to hold Redis credentials and could be walked past by anyone who
 * set a cookie to "true". The backend owns the lockdown switch, so we simply
 * ask it. The redirect now happens a moment later — after the page loads
 * rather than before — but without it customers would sit on a normal page
 * where every request fails.
 *
 * Admin pages are left alone, as they were before: an admin has to be able to
 * reach the settings screen to lift the lockdown.
 */
export default function MaintenanceWatch() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname === "/maintenance") return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch("/api/service-status");
        if (!res.ok) return;
        const status = await res.json();
        if (!cancelled && status?.locked) router.replace("/maintenance");
      } catch {
        // Unreachable backend is not the same as "closed" — leave the page be
        // and let the real error surface where it happens.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
