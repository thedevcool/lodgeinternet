"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import Button from "@/components/ui/Button";
import { GroupedList } from "@/components/ui/GroupedList";
import Sheet from "@/components/ui/Sheet";

/**
 * A welcome code: the free code a newly set-up hostel gives each resident
 * who creates an account (backend: app/routers/giveaways.py).
 *
 * The Account page is where it is given. A resident who has just signed up
 * at a hostel whose welcome codes are on lands there, the backend says a code
 * is on offer, and the page claims it and shows it in a sheet at once; the
 * backend emails it too. No poster is needed (the owner's call, 2026-11-16).
 * An older account, at a hostel open to everyone, is shown a button instead.
 * From then on the code stays in its own section of the page. The poster's
 * page (/welcome/<token>) still claims the same way.
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

/** A code the backend says this account may have, not yet claimed. */
export type WelcomeOffer = {
  hostel: string;
  gives: string;
  /** A new account: claim it for them on landing. Otherwise show a button. */
  auto: boolean;
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
 * The Account page's welcome code: given on landing to a new resident, behind
 * a button for an older one, and shown from then on.
 *
 * Renders nothing for the many customers with no welcome code and none on
 * offer, and nothing if the lookup fails: it can't tell "no code" from
 * "couldn't ask", and an error shown to everyone who never had one would be
 * wrong. The same goes for a claim made on landing that is refused. A claim
 * the customer asked for with the button does show the backend's reason.
 */
export default function WelcomeCodeSection() {
  const [claim, setClaim] = useState<WelcomeClaim | null>(null);
  const [offer, setOffer] = useState<WelcomeOffer | null>(null);
  // The sheet opens only for a code given just now, never for one seen before.
  const [justGiven, setJustGiven] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** Claim at the customer's own hostel. Returns the backend's reason when refused. */
  const take = useCallback(async (): Promise<string> => {
    const res = await apiFetch("/api/giveaways/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || "We couldn't get your welcome code. Please try again.";
    setClaim(data.claim);
    setOffer(null);
    if (!data.alreadyClaimed) setJustGiven(true);
    return "";
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/giveaways/mine")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.claim) setClaim(data.claim);
        else if (data.offer?.auto) await take();
        else if (data.offer) setOffer(data.offer);
      })
      .catch(() => {
        // See above: nothing is shown when the lookup or the landing claim can't be made.
      });
    return () => {
      cancelled = true;
    };
  }, [take]);

  const takeFromButton = async () => {
    setBusy(true);
    setError("");
    try {
      setError(await take());
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (offer && !claim) {
    return (
      <GroupedList
        header="A free welcome code"
        footer={error || `One free code for each resident of ${offer.hostel}, from Lodge Internet.`}
        className="mt-8"
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success-ink">
            <Gift className="h-5 w-5" />
          </span>
          <p className="ui-subhead min-w-0 flex-1 text-ink">{offer.gives}</p>
          <Button variant="tinted" size="sm" onClick={takeFromButton} disabled={busy}>
            {busy ? "Getting it…" : "Get my free code"}
          </Button>
        </div>
      </GroupedList>
    );
  }

  if (!claim) return null;
  return (
    <>
      <GroupedList
        header="Your welcome code"
        footer={`Free from Lodge Internet at ${claim.hostel}. Enter it on the hostel Wi-Fi login page.`}
        className="mt-8"
      >
        <WelcomeCodeRow claim={claim} />
      </GroupedList>

      <Sheet
        open={justGiven}
        onClose={() => setJustGiven(false)}
        title="Your free welcome code"
        showClose
        footer={
          <Button className="w-full" onClick={() => setJustGiven(false)}>
            Done
          </Button>
        }
      >
        <p className="ui-body text-ink-2">
          Welcome to Lodge Internet at {claim.hostel}. This one is on us.
        </p>
        <div className="mt-4 overflow-hidden rounded-[14px] bg-surface-2">
          <WelcomeCodeRow claim={claim} />
        </div>
        <p className="ui-subhead mt-4 text-ink-2">
          Connect to the hostel Wi-Fi and enter this code on the login page. We&apos;ve emailed it to you too, and it
          stays on this page.
        </p>
      </Sheet>
    </>
  );
}
