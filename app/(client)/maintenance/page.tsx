"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { Lock, RefreshCw } from "lucide-react";
import { BrandGlyph } from "@/components/ui/BrandMark";
import Button from "@/components/ui/Button";

export default function MaintenancePage() {
  const [message, setMessage] = useState(
    "We're currently performing scheduled maintenance. We'll be back shortly.",
  );

  useEffect(() => {
    // Fetch the admin-set message fresh each load — bypasses any page cache.
    // This reads the public status route, not the admin settings one: a
    // visitor here has no admin token, so that call returned 401 and the
    // message an admin had written never actually reached anybody.
    apiFetch("/api/service-status")
      .then((r) => r.json())
      .then((data) => {
        if (data.message) setMessage(data.message);
      })
      .catch(() => {});
  }, []);

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

        <Button variant="gray" size="md" className="mt-8" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" /> Check again
        </Button>

        <p className="ui-footnote mt-8 text-ink-3">
          If you need immediate assistance, please contact your hostel management.
        </p>
      </div>
    </div>
  );
}
