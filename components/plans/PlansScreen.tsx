"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { Headset, WifiOff } from "lucide-react";
import ReAuthModal from "@/components/ReAuthModal";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import InlineAlert from "@/components/ui/InlineAlert";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { displayName } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import { usePlansCheckout, type PlansParams } from "./usePlansCheckout";
import { PlanList, PlanListSkeleton, PlanTypeTabs } from "./PlanPicker";
import CheckoutPanel, { CheckoutBar } from "./CheckoutPanel";
import {
  CodeSheet,
  HostelConfirmSheet,
  PaymentWarningAlert,
  SupportContactsSheet,
  TvMacSheet,
  TvPasswordSheet,
} from "./PaymentSheets";

/**
 * Plans & checkout for one hostel — shared by /{hostel}/plans and
 * /{location}/{hostel}/plans. Logic: usePlansCheckout. This file is layout.
 *
 *   Phones:  plans list → glass checkout bar → "Complete your payment" sheet.
 *   Desktop: plans on the left, the same checkout panel sticky on the right.
 */
export default function PlansScreen({ params }: { params: PlansParams }) {
  const c = usePlansCheckout(params);
  const dir = useHostelDirectory(); // only for the breadcrumb / back link

  // Mobile checkout sheet. It stays open (locked) while paying so errors show
  // in place; it closes once Paystack reports success and the code sheet
  // takes over, or if the selection is cleared (e.g. the plan sold out).
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  useEffect(() => {
    if (c.processingClaim) setCheckoutOpen(false);
  }, [c.processingClaim]);
  useEffect(() => {
    if (!c.selectedPlan) setCheckoutOpen(false);
  }, [c.selectedPlan]);

  // Where "back" goes: the hostel's location page when we know it.
  const collage = c.hostelObj?.collageId ? dir.collageById.get(c.hostelObj.collageId) : undefined;
  const back = collage
    ? { href: dir.locationPathFor(collage), label: displayName(collage.name) }
    : { href: "/hostels", label: "Hostels" };

  const emptyText =
    c.planView === "device"
      ? `No plans available for ${c.selectedDeviceCount} devices at the moment.`
      : c.planView === "unlimited"
        ? "No unlimited plans available at the moment."
        : "No TV plans available at the moment.";

  return (
    <>
      {/* Paystack inline script — unchanged (the hook also polls for it). */}
      <Script
        src="https://js.paystack.co/v1/inline.js"
        strategy="lazyOnload"
        onLoad={() => c.setPaystackLoaded(true)}
        onError={() => c.setError("Failed to load payment system. Please refresh the page.")}
      />

      <Container wide className="pb-32 md:pb-0">
        {/* Wait for the location too, so the back link never flips label. */}
        {c.hostelReady && (dir.data || dir.error) ? (
          <PageHeader
            title={c.selectedHostel}
            crumbs={[
              { label: "Properties", href: "/hostels" },
              { label: back.label, href: back.href },
              { label: c.selectedHostel },
            ]}
            back={back}
            subtitle="Select a data plan and get instant access to high-speed internet."
          />
        ) : (
          <div className="pb-6 pt-2 md:pb-8 md:pt-10">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-3 h-9 w-60" />
            <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          </div>
        )}

        <div className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-8 lg:gap-12">
          {/* ── Plans ──────────────────────────────────────────────────── */}
          <div>
            <PlanTypeTabs c={c} />

            {c.error && !checkoutOpen && <InlineAlert className="mt-4">{c.error}</InlineAlert>}

            <div className="mt-5">
              {c.showLoading ? (
                <PlanListSkeleton label={c.loading ? "Loading plans…" : "Checking availability…"} />
              ) : c.displayPlans.length === 0 ? (
                <div className="rounded-card bg-surface shadow-card">
                  <EmptyState icon={<WifiOff />} title={emptyText} message="Check another tab, or ask us on WhatsApp." />
                </div>
              ) : (
                <PlanList c={c} />
              )}
            </div>

            <GroupedList className="mt-8">
              <ListRow
                onClick={() => c.setShowSupportModal(true)}
                leading={
                  <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-accent/10 text-accent-ink">
                    <Headset className="h-5 w-5" />
                  </span>
                }
                title="Need help?"
                subtitle="Chat with our support team on WhatsApp"
              />
            </GroupedList>
          </div>

          {/* ── Desktop: sticky checkout ───────────────────────────────── */}
          <aside className="hidden md:sticky md:top-24 md:block">
            {c.selectedPlan ? (
              <CheckoutPanel c={c} />
            ) : (
              <div className="rounded-card bg-surface p-6 text-center shadow-card">
                <p className="ui-headline text-ink">Choose a plan</p>
                <p className="ui-subhead mt-1 text-ink-2">Your order summary and payment will appear here.</p>
              </div>
            )}
          </aside>
        </div>
      </Container>

      {/* ── Mobile: checkout bar + sheet ─────────────────────────────── */}
      {c.selectedPlan && !checkoutOpen && (
        <CheckoutBar plan={c.selectedPlan} onContinue={() => setCheckoutOpen(true)} />
      )}
      <Sheet
        open={checkoutOpen && Boolean(c.selectedPlan)}
        onClose={() => setCheckoutOpen(false)}
        dismissible={!c.purchasing}
        history
        title="Complete your payment"
      >
        <CheckoutPanel c={c} />
      </Sheet>

      {/* ── Overlays ─────────────────────────────────────────────────── */}
      <PaymentWarningAlert c={c} />
      <CodeSheet c={c} />
      <TvMacSheet c={c} />
      <TvPasswordSheet c={c} />
      <HostelConfirmSheet c={c} />
      <SupportContactsSheet c={c} />
      {c.showReAuth && <ReAuthModal onSuccess={c.completeReAuth} onCancel={c.cancelReAuth} />}
    </>
  );
}
