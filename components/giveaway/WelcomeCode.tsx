"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import Button from "@/components/ui/Button";
import { GroupedList } from "@/components/ui/GroupedList";

/**
 * A welcome code its owner has claimed: the free code a newly set-up hostel
 * gives each resident who creates an account (backend: app/routers/
 * giveaways.py). Shown right after claiming (/welcome/<token>) and, from
 * then on, on the Account page.
 *
 * Everything here is as the backend sent it, `gives` included: the browser
 * doesn't work out what a code is worth.
 */

export type WelcomeClaim = {
  code: string;
  /** "2GB for 1 day, up to 3 devices". */
  gives: string;
  hostel: string;
  claimedAt: string | null;
};

/** The code in large type with a Copy button. */
export function WelcomeCodeRow({ claim }: { claim: WelcomeClaim }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(claim.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success-ink">
        <Gift className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="ui-subhead text-ink-2">{claim.gives}</p>
        <p className="mt-0.5 break-all font-mono text-[19px] font-bold tracking-[0.1em] text-ink">{claim.code}</p>
      </div>
      <Button variant="tinted" size="sm" onClick={copy}>
        {copied ? (
          <>
            <Check className="h-4 w-4" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" /> Copy
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * The Account page's "Your welcome code" section. Renders nothing for the
 * many customers who have no welcome code, and nothing if the lookup fails:
 * it can't tell "no code" from "couldn't ask", and an error shown to everyone
 * who never had one would be wrong. The code is also on the page that gave it.
 */
export default function WelcomeCodeSection() {
  const [claim, setClaim] = useState<WelcomeClaim | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/giveaways/mine")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setClaim(data.claim ?? null);
      })
      .catch(() => {
        // See above: no welcome code is shown when the lookup can't be made.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!claim) return null;
  return (
    <GroupedList
      header="Your welcome code"
      footer={`Free from Lodge Internet at ${claim.hostel}. Enter it on the hostel Wi-Fi login page.`}
      className="mt-8"
    >
      <WelcomeCodeRow claim={claim} />
    </GroupedList>
  );
}
