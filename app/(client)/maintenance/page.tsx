"use client";

/**
 * /maintenance — where MaintenanceWatch sends every customer page while the
 * site is locked down (the switch is the backend's: /api/service-status).
 *
 * The page asks the backend for the admin's message, and whether the site is
 * still locked. Once it is not, the customer is sent home: "Check again" used
 * only to reload this page, which never looked at `locked`, so a customer
 * stayed on "Site Temporarily Unavailable" after the lockdown had ended, on a
 * page with no other link.
 */
import { apiFetch } from "@/lib/apiClient";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, RefreshCw } from "lucide-react";
import { BrandGlyph } from "@/components/ui/BrandMark";
import Button from "@/components/ui/Button";

export default function MaintenancePage() {
  const router = useRouter();
  const [message, setMessage] = useState(
    "We're currently performing scheduled maintenance. We'll be back shortly.",
  );
  const [checking, setChecking] = useState(false);

  // Ask the backend, fresh each time (this is the public status route: a
  // visitor has no admin token, so the admin settings route answered 401 and
  // the message an admin had written never reached anybody).
  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const response = await apiFetch("/api/service-status");
      const status = await response.json();
      // Only a clear "not locked" sends the customer on. An answer we can't
      // read leaves them here, where the button lets them ask again.
      if (response.ok && status.locked === false) {
        router.replace("/");
        return;
      }
      if (status.message) setMessage(status.message);
    } catch {
      // No answer: the site may still be locked, so the notice stays up.
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // No nav/tab bar here (ClientChrome hides them): during a lockdown every
  // link would just bounce back to this page.
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-md">
        <div className="relative mx-auto h-24 w-24">
          <BrandGlyph className="h-24 w-24" />
          <span className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-danger text-white ring-4 ring-canvas">
            <Lock className="h-5 w-5" />
          </span>
        </div>

        <h1 className="ui-title-1 mt-8 text-ink">Site Temporarily Unavailable</h1>
        <p className="ui-body mt-3 text-ink-2">{message}</p>

        <Button variant="gray" size="md" className="mt-8" onClick={checkStatus} loading={checking}>
          {!checking && <RefreshCw className="h-4 w-4" />} Check again
        </Button>

        <p className="ui-footnote mt-8 text-ink-3">
          If you need immediate assistance, please contact your hostel management.
        </p>
      </div>
    </div>
  );
}
