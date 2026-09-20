"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAdminToken, isTokenLive, onSessionEnded, rememberSessionEnd } from "@/lib/adminSession";
import { useAuthStore } from "@/store/authStore";

/**
 * Keeps an admin signed in while they are actually working, and makes the end
 * of a session obvious instead of silent.
 *
 * - While the tab is in use, the token is renewed shortly before it lapses, so
 *   a short-lived token never interrupts anyone mid-task.
 * - Leave it alone for long enough and it simply lapses — no renewal happens
 *   without activity.
 * - When the backend says the session is over (any admin call returning 401,
 *   announced once by `adminFetch`), we clear it and go to the login screen
 *   with a reason and the page to come back to. Previously nothing handled
 *   this, so an expired session looked like admin pages with empty tables.
 */

/** Renew when the token has less than this left. */
const RENEW_WITHIN_MS = 10 * 60 * 1000;
/** How often to check (cheap: reads a token, no network unless renewing). */
const CHECK_EVERY_MS = 60 * 1000;
/** No interaction for this long → let the session lapse on its own. */
const IDLE_LIMIT_MS = 45 * 60 * 1000;

export default function AdminSessionKeeper() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const refresh = useAuthStore((s) => s.refresh);
  const endSession = useAuthStore((s) => s.endSession);
  const lastActivity = useRef(Date.now());
  const onLoginPage = pathname.startsWith("/admin/login");

  // Any of these counts as "still working".
  useEffect(() => {
    const seen = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, seen));
    return () => events.forEach((e) => window.removeEventListener(e, seen));
  }, []);

  const check = useCallback(async () => {
    if (onLoginPage) return;
    const token = getAdminToken();
    if (!token) return; // never signed in on this browser
    if (!isTokenLive(token)) {
      rememberSessionEnd("expired");
      endSession();
      router.replace(`/admin/login?reason=expired&next=${encodeURIComponent(pathname)}`);
      return;
    }
    const idle = Date.now() - lastActivity.current > IDLE_LIMIT_MS;
    if (idle) return; // lapses naturally
    if (!isTokenLive(token, RENEW_WITHIN_MS)) await refresh();
  }, [onLoginPage, endSession, refresh, router, pathname]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  // The backend rejected a call: end it here, once, for the whole app.
  useEffect(
    () =>
      onSessionEnded((reason) => {
        rememberSessionEnd(reason);
        endSession();
        if (onLoginPage) return;
        router.replace(`/admin/login?reason=${reason}&next=${encodeURIComponent(pathname)}`);
      }),
    [endSession, onLoginPage, pathname, router],
  );

  return null;
}
