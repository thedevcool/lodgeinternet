"use client";

import { CircleCheck, CreditCard, Lock, LogIn, Smartphone, Tv, Wifi } from "lucide-react";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";
import WhatsAppCard from "@/components/ui/WhatsAppCard";
import { checkoutCharges, checkoutTotal } from "@/lib/pricing";
import type { DataPlan } from "@/types";
import { planTypeLine } from "./checkout";
import type { PlansCheckout } from "./usePlansCheckout";

/**
 * "Complete your payment" (Figma): order summary, who's paying, the Paystack
 * method row, the Pay button, and the WhatsApp alternative.
 * Rendered in the desktop sidebar and inside the mobile checkout sheet.
 */
export default function CheckoutPanel({ c }: { c: PlansCheckout }) {
  const plan = c.selectedPlan;
  if (!plan) return null;
  const isCodePlan = plan.planType === "device" || plan.planType === "unlimited";

  return (
    <div className="space-y-4">
      <OrderSummary plan={plan} />

      {c.error && <InlineAlert>{c.error}</InlineAlert>}

      {isCodePlan ? (
        // Kept as a form: submit calls handlePurchase() with NO arguments —
        // passing the event would skip the one-time payment warning.
        <form
          onSubmit={(e) => {
            e.preventDefault();
            c.handlePurchase();
          }}
          className="space-y-4"
        >
          {c.currentUser ? (
            <div className="flex items-center gap-2.5 rounded-2xl bg-accent/10 px-4 py-3 text-accent-ink">
              <LogIn className="h-4 w-4 shrink-0" />
              <span className="ui-subhead min-w-0 truncate font-medium">Purchasing as {c.email}</span>
            </div>
          ) : (
            <TextField
              label="Email address (for receipt)"
              type="email"
              value={c.email}
              onChange={c.handleEmailChange}
              placeholder="your.email@example.com"
              autoComplete="email"
              required
            />
          )}

          {c.codesNotAvailable && (
            <InlineAlert title="No codes available for this plan">Please select a different plan or try again later.</InlineAlert>
          )}

          <PaymentMethodRow />

          <Button type="submit" full disabled={c.payDisabled} loading={c.purchasing}>
            {c.codesNotAvailable
              ? "No Codes Available"
              : !c.paystackLoaded
                ? "Loading payment..."
                : c.purchasing
                  ? "Processing..."
                  : `Pay ₦${checkoutTotal(plan.price).toLocaleString()}`}
          </Button>
          <SecureNote />
        </form>
      ) : (
        <div className="space-y-4">
          <PaymentMethodRow />
          <Button full onClick={() => c.handleTvPurchaseStart()} disabled={c.tvDisabled} loading={c.checkingTvMac}>
            {!c.paystackLoaded ? "Loading payment..." : c.checkingTvMac ? "Checking your TV..." : "Continue to Purchase"}
          </Button>
          <SecureNote />
        </div>
      )}

      <WhatsAppCard
        compact
        title="Prefer WhatsApp?"
        message="Select your plan, pay securely and receive your access code directly in WhatsApp."
        cta="Chat & Buy on WhatsApp"
        prefill={`Hi Lodge Internet, I want to buy ${plan.name}${c.selectedHostel ? ` for ${c.selectedHostel}` : ""}`}
      />
    </div>
  );
}

function OrderSummary({ plan }: { plan: DataPlan }) {
  const Icon = plan.planType === "tv" ? Tv : plan.planType === "unlimited" ? Wifi : Smartphone;
  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <p className="ui-eyebrow text-ink-2">Order summary</p>
      <p className="ui-title-2 mt-2 text-ink">{plan.name}</p>
      <p className="ui-subhead mt-1 flex items-center gap-1.5 text-ink-2">
        <Icon className="h-4 w-4" /> {planTypeLine(plan)}
      </p>
      <dl className="ui-subhead mt-4 space-y-2 border-t border-hairline pt-4">
        <div className="flex justify-between text-ink-2">
          <dt>Plan Price</dt>
          <dd className="tabular-nums">₦{plan.price.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between text-ink-2">
          <dt>Bank Charges</dt>
          <dd className="tabular-nums">₦{checkoutCharges(plan.price).toLocaleString()}</dd>
        </div>
        <div className="flex justify-between border-t border-hairline pt-3 text-[17px] font-semibold text-ink">
          <dt>Total to Pay</dt>
          <dd className="tabular-nums">₦{checkoutTotal(plan.price).toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Figma "Payment Method" row — Paystack is the only method, shown selected. */
function PaymentMethodRow() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-card ring-1 ring-accent/40">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent/10 text-accent-ink">
        <CreditCard className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="ui-subhead font-semibold text-ink">Pay securely with Paystack</p>
        <p className="ui-footnote text-ink-2">Secure online payment</p>
      </div>
      <CircleCheck className="h-6 w-6 text-accent-ink" fill="currentColor" stroke="rgb(var(--surface))" />
    </div>
  );
}

function SecureNote() {
  return (
    <p className="ui-footnote flex items-center justify-center gap-1.5 text-ink-2">
      <Lock className="h-3.5 w-3.5" /> Secure payment
    </p>
  );
}

/** Mobile: glass bar with the selected plan's total and Continue. */
export function CheckoutBar({ plan, onContinue }: { plan: DataPlan; onContinue: () => void }) {
  return (
    <div className="ui-glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-40 flex animate-sheet-up items-center gap-3 rounded-[26px] py-2.5 pl-4 pr-2.5 md:hidden">
      <div className="min-w-0 flex-1">
        <p className="ui-footnote truncate text-ink-2">{plan.name}</p>
        <p className="ui-headline tabular-nums text-ink">
          ₦{checkoutTotal(plan.price).toLocaleString()} <span className="ui-footnote font-normal text-ink-2">total</span>
        </p>
      </div>
      <Button size="md" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
