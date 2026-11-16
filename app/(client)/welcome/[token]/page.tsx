"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, QrCode } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { useCustomer } from "@/components/client/CustomerProvider";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button, { ButtonLink } from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { GroupedList } from "@/components/ui/GroupedList";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { WelcomeCodeRow, type WelcomeClaim } from "@/components/giveaway/WelcomeCode";

/**
 * /welcome/<token> — where a hostel's welcome-code poster sends a resident
 * who scans it. The token is that hostel's secret poster link (backend:
 * app/routers/giveaways.py).
 *
 *  - Not signed in: what the poster offers, and Create my account (the hostel
 *    is already chosen) or sign in; both come back here.
 *  - Signed in: Get my free code. The backend decides who may claim and says
 *    why not, in words meant for the customer; this page shows them.
 *  - Already claimed (here or from another poster): the code again.
 *
 * A poster whose giveaway is off, over or out of codes says so. A link that
 * was replaced is "no longer in use". Nothing here is "coming soon".
 */

type Offer = {
  hostel: string;
  status: "off" | "not_started" | "ended" | "out_of_codes" | "open";
  gives: string | null;
  newAccountsOnly: boolean;
  endsAt: string | null;
};

type Refusal = { message: string; code: string };

function closedTitle(offer: Offer): string {
  if (offer.status === "out_of_codes") return `All the welcome codes at ${offer.hostel} have been claimed`;
  if (offer.status === "not_started") return `The welcome codes at ${offer.hostel} haven't started yet`;
  return `The welcome codes at ${offer.hostel} have ended`;
}

export default function WelcomePage({ params }: { params: { token: string } }) {
  const token = params.token;
  const here = `/welcome/${encodeURIComponent(token)}`;
  const customer = useCustomer();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [offerState, setOfferState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [claim, setClaim] = useState<WelcomeClaim | null>(null);
  // Whether we know yet if this customer already has a code.
  const [mineKnown, setMineKnown] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const loadOffer = useCallback(() => {
    setOfferState("loading");
    apiFetch(`/api/giveaways/poster/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 404) return setOfferState("missing");
        if (!res.ok) return setOfferState("failed");
        setOffer(await res.json());
        setOfferState("ready");
      })
      .catch(() => setOfferState("failed"));
  }, [token]);

  useEffect(loadOffer, [loadOffer]);

  // A signed-in customer who already has a code sees it, whatever this
  // poster's giveaway is doing now.
  useEffect(() => {
    if (!customer.ready) return;
    if (!customer.user) {
      setClaim(null);
      setMineKnown(true);
      return;
    }
    let cancelled = false;
    apiFetch("/api/giveaways/mine")
      .then(async (res) => (res.ok ? (await res.json()).claim ?? null : null))
      .catch(() => null)
      .then((mine) => {
        if (cancelled) return;
        setClaim(mine);
        setMineKnown(true);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.ready, customer.user]);

  const claimCode = async () => {
    setClaiming(true);
    setRefusal(null);
    try {
      const res = await apiFetch("/api/giveaways/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRefusal({ message: data.error || "We couldn't get your code. Please try again.", code: data.code || "" });
        return;
      }
      setClaim(data.claim);
    } catch {
      setRefusal({ message: "We couldn't reach Lodge Internet. Check your connection and try again.", code: "" });
    } finally {
      setClaiming(false);
    }
  };

  const waiting = offerState === "loading" || !customer.ready || !mineKnown;

  return (
    <Container>
      <PageHeader title="Welcome code" />

      {claim ? (
        <Claimed claim={claim} />
      ) : waiting ? (
        <Card role="status" aria-busy aria-label="Loading">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-4 h-8 w-4/5" />
          <Skeleton className="mt-3 h-4 w-3/5" />
          <Skeleton className="mt-6 h-[52px] w-full rounded-full" />
        </Card>
      ) : offerState === "failed" ? (
        <ErrorState onRetry={loadOffer} />
      ) : offerState === "missing" || !offer ? (
        <EmptyState
          icon={<QrCode />}
          title="This poster is no longer in use"
          message="Ask the Lodge Internet team at your hostel for the new poster."
          action={
            <ButtonLink href="/hostels" variant="tinted">
              Find your hostel
            </ButtonLink>
          }
        />
      ) : offer.status !== "open" ? (
        <EmptyState
          icon={<Gift />}
          title={closedTitle(offer)}
          message={
            offer.status === "not_started"
              ? "Scan the poster again once they start."
              : "You can still buy a plan for your hostel."
          }
          action={
            <ButtonLink href="/hostels" variant="tinted">
              See plans
            </ButtonLink>
          }
        />
      ) : (
        <Card>
          <p className="ui-eyebrow text-accent-ink">Welcome to {offer.hostel}</p>
          <h2 className="ui-title-1 mt-2 text-ink">Your first data code is free</h2>
          {offer.gives && <p className="ui-body mt-2 text-ink-2">{offer.gives}.</p>}

          {refusal && (
            <InlineAlert className="mt-5">
              {refusal.message}
              {refusal.code === "EMAIL_NOT_VERIFIED" && (
                <ButtonLink href={`/register?verify=1&redirect=${encodeURIComponent(here)}`} variant="plain" size="sm" className="-ml-4 mt-1">
                  Confirm my email
                </ButtonLink>
              )}
              {refusal.code === "PHONE_REQUIRED" && (
                <ButtonLink href="/dashboard" variant="plain" size="sm" className="-ml-4 mt-1">
                  Add it on my Account page
                </ButtonLink>
              )}
            </InlineAlert>
          )}

          <div className="mt-6 space-y-2">
            {customer.user ? (
              <Button variant="filled" size="lg" full loading={claiming} onClick={claimCode}>
                Get my free code
              </Button>
            ) : (
              <>
                <ButtonLink
                  href={`/register?hostel=${encodeURIComponent(offer.hostel)}&redirect=${encodeURIComponent(here)}`}
                  variant="filled"
                  size="lg"
                  full
                >
                  Create my account
                </ButtonLink>
                <ButtonLink href={`/login?redirect=${encodeURIComponent(here)}`} variant="plain" size="lg" full>
                  I already have an account
                </ButtonLink>
              </>
            )}
          </div>

          <p className="ui-footnote mt-5 text-ink-2">
            One code per person, for {offer.hostel} residents
            {offer.newAccountsOnly ? " with a new account" : ""}.
            {offer.endsAt
              ? ` Ends ${new Date(offer.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`
              : ""}
          </p>
        </Card>
      )}
    </Container>
  );
}

function Claimed({ claim }: { claim: WelcomeClaim }) {
  return (
    <>
      <GroupedList
        header="Here is your welcome code"
        footer={`Connect to the ${claim.hostel} Wi-Fi and enter this code on the login page. It's saved on your Account page too.`}
      >
        <WelcomeCodeRow claim={claim} />
      </GroupedList>
      <div className="mt-6">
        <ButtonLink href="/dashboard" variant="tinted" size="lg" full>
          Go to my account
        </ButtonLink>
      </div>
    </>
  );
}
