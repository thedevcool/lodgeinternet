"use client";

import type { ReactNode } from "react";
import { displayName } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import { useCustomer } from "@/components/client/CustomerProvider";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Monogram from "@/components/ui/Monogram";
import { ButtonLink } from "@/components/ui/Button";
import { ListSkeleton } from "@/components/ui/States";
import type { Hostel } from "@/types";

/**
 * The hostel lock. A signed-in, verified customer belongs to the hostel they
 * registered at, for good: the pages that list hostels show only theirs, and
 * another hostel's plans page points them back to it. (Checkout and the
 * backend refuse other hostels too; this is what the customer sees.)
 */

/** The hostel this customer is locked to, if any; `checking` until known. */
export function useMyHostel(): { checking: boolean; hostel: Hostel | undefined } {
  const { user, ready, lockedHostel, hostelKnown } = useCustomer();
  const dir = useHostelDirectory();
  const checking = !ready || (Boolean(user) && !hostelKnown) || (Boolean(lockedHostel) && !dir.data);
  const hostel = lockedHostel ? dir.data?.hostels.find((h) => h.name === lockedHostel) : undefined;
  return { checking, hostel };
}

export function YourHostelCard({ hostel }: { hostel: Hostel }) {
  const dir = useHostelDirectory();
  const parent = hostel.collageId ? dir.collageById.get(hostel.collageId) : undefined;
  return (
    <div className="rounded-card bg-surface p-6 shadow-card sm:p-8 md:max-w-xl">
      <p className="ui-eyebrow text-accent-ink">Your hostel</p>
      <div className="mt-4 flex items-center gap-4">
        <Monogram name={hostel.name} size="lg" />
        <div className="min-w-0">
          <p className="ui-title-2 truncate text-ink">{hostel.name}</p>
          <p className="ui-subhead mt-0.5 text-ink-2">
            {parent ? displayName(parent.name) : "You’re locked in — tap to view your plans"}
          </p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <ButtonLink href={dir.plansPathFor(hostel)}>Buy data</ButtonLink>
        <ButtonLink href="/dashboard" variant="gray">
          My codes
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * Wraps a page that lists hostels (or another hostel's plans): a customer
 * locked to a hostel sees only theirs, with `note` saying why when given.
 */
export function LockedToYourHostel({ children, note }: { children: ReactNode; note?: string }) {
  const mine = useMyHostel();
  if (mine.checking) {
    return (
      <Container wide>
        <ListSkeleton rows={4} />
      </Container>
    );
  }
  if (!mine.hostel) return <>{children}</>;
  return (
    <Container wide>
      <PageHeader title="Your hostel" subtitle={note ?? "Your account belongs to this hostel."} crumbs={[{ label: "Home", href: "/" }, { label: "Your hostel" }]} />
      <YourHostelCard hostel={mine.hostel} />
    </Container>
  );
}
