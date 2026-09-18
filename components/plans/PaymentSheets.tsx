"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy, KeyRound, Star, TriangleAlert, Tv, Wifi } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";
import SearchField from "@/components/ui/SearchField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import WhatsAppIcon from "@/components/ui/WhatsAppIcon";
import { Skeleton } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { CORE_SUPPORT_AGENTS, whatsappChatLink } from "@/lib/supportContacts";
import type { PlansCheckout } from "./usePlansCheckout";

/**
 * Every overlay of the checkout flow. All state lives in usePlansCheckout;
 * these only render it. Handlers are always called with explicit arguments
 * (never passed a click event) — see the notes at the top of the hook.
 */

// ── One-time "keep this page open" warning ──────────────────────────────────
export function PaymentWarningAlert({ c }: { c: PlansCheckout }) {
  return (
    // No onClose: the only way on is "I Understand", exactly as before.
    <Sheet open={c.showPaymentWarning} variant="alert" layer="alert" ariaLabel="Before you pay">
      <div className="payment-warning-shake text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <TriangleAlert className="h-7 w-7" />
        </span>
        <h2 className="ui-title-3 mt-4 text-danger">Bad Things Will Happen If You Do Not Read This Modal</h2>
        <p className="ui-subhead mt-2 text-ink-2">
          After making payment, you must return to this site to get your access code. If you leave before your code
          appears, it may be difficult to recover it.
        </p>
        <p className="ui-footnote mt-4 rounded-inner bg-danger/10 px-3 py-2.5 font-semibold text-danger">
          Keep this page open until your code is displayed.
        </p>
        <Button full className="mt-5" onClick={() => c.acknowledgePaymentWarning()}>
          I Understand
        </Button>
      </div>
    </Sheet>
  );
}

// ── Processing → "You're connected!" ────────────────────────────────────────
export function CodeSheet({ c }: { c: PlansCheckout }) {
  const revealed = c.revealedCode;
  return (
    <Sheet
      open={c.showCodeSheet}
      // Can't be dismissed while the code is being prepared.
      onClose={revealed ? () => c.setRevealedCode(null) : undefined}
      showClose={Boolean(revealed)}
      ariaLabel={revealed ? "Your access code" : "Preparing your access code"}
    >
      {revealed ? (
        <div className="pt-1 text-center">
          <span className="mx-auto flex h-16 w-16 animate-check-pop items-center justify-center rounded-full bg-success text-white">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <h2 className="ui-title-1 mt-4 text-ink">You’re connected!</h2>
          <p className="ui-subhead mt-1 text-ink-2">Payment successful — here’s your access code.</p>

          <div className="mt-6 rounded-card bg-surface p-5 shadow-card ring-1 ring-success/30">
            <p className="ui-eyebrow flex items-center justify-center gap-1.5 text-ink-2">
              <KeyRound className="h-3.5 w-3.5" /> Your access code
            </p>
            <p className="mt-2 select-all break-all font-mono text-[30px] font-bold leading-tight tracking-[0.12em] text-ink">
              {revealed}
            </p>
            <Button full className="mt-4" onClick={() => c.copyToClipboard()}>
              <Copy className="h-[18px] w-[18px]" /> Copy Code
            </Button>
          </div>

          <p className="ui-subhead mt-4 text-ink-2">
            Don’t worry — it’s also saved to your{" "}
            <Link href="/dashboard" className="font-semibold text-accent-ink">
              Account
            </Link>{" "}
            and we’ve emailed it to {c.email || "you"}.
          </p>

          <FeedbackRow c={c} />

          <Button variant="gray" full className="mt-4" onClick={() => c.setRevealedCode(null)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="pt-1 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-current border-t-transparent" />
          </span>
          <h2 className="ui-title-2 mt-4 text-ink">Payment successful!</h2>
          <p className="ui-subhead mt-1 text-ink-2">
            {c.recovering ? "Payment confirmed — securing your code…" : "Preparing your access code…"}
          </p>
          <div className="mt-6 space-y-3 rounded-card bg-surface p-5 shadow-card">
            <Skeleton className="mx-auto h-3 w-28" />
            <Skeleton className="mx-auto h-9 w-3/4" />
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
          <p className="ui-footnote mt-4 text-ink-2">This usually takes less than a second. Please don’t close this window.</p>
        </div>
      )}
    </Sheet>
  );
}

/** Optional "Rate your experience" — the existing feedback form, now reachable. */
function FeedbackRow({ c }: { c: PlansCheckout }) {
  const [open, setOpen] = useState(false);

  if (c.feedbackSubmitted) {
    return (
      <div className="mt-5 rounded-2xl bg-success/10 px-4 py-3 text-left text-success">
        <p className="ui-subhead font-semibold">Thank you for your feedback!</p>
        <p className="ui-footnote mt-0.5 opacity-90">We appreciate you taking the time to share your thoughts with us.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-2xl bg-ink/[0.04] text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5"
      >
        <Star className="h-5 w-5 text-warning" fill="currentColor" />
        <span className="ui-subhead flex-1 font-semibold text-ink">Rate your experience</span>
        <span className="ui-footnote text-ink-2">Optional</span>
        <ChevronDown className={cx("h-4 w-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <form onSubmit={c.handleFeedbackSubmit} className="space-y-4 border-t border-hairline px-4 pb-4 pt-4">
          <SegmentedControl
            ariaLabel="Feedback type"
            segments={[
              { value: "review", label: "Review" },
              { value: "complaint", label: "Complaint" },
            ]}
            value={c.feedbackType}
            onSelect={(v) => c.setFeedbackType(v as "review" | "complaint")}
          />

          {c.feedbackType === "review" && (
            <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={c.feedbackRating === star}
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  onClick={() => c.setFeedbackRating(star)}
                  className="p-1 transition-transform active:scale-90"
                >
                  <Star
                    className={cx("h-8 w-8", star <= c.feedbackRating ? "text-warning" : "text-ink-3")}
                    fill={star <= c.feedbackRating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          )}

          <TextField
            label="Your Name"
            value={c.feedbackName}
            onChange={(e) => c.setFeedbackName(e.target.value)}
            placeholder="Enter your name"
            required
          />

          <div>
            <label htmlFor="feedback-message" className="ui-footnote mb-1.5 block px-1 font-medium text-ink-2">
              {c.feedbackType === "review" ? "Your Review" : "Your Complaint"}
            </label>
            <textarea
              id="feedback-message"
              value={c.feedbackMessage}
              onChange={(e) => c.setFeedbackMessage(e.target.value)}
              placeholder={c.feedbackType === "review" ? "Share your experience..." : "Describe your issue..."}
              required
              rows={3}
              className="w-full resize-none rounded-inner bg-surface-2 px-4 py-3 text-[17px] text-ink outline-none ring-1 ring-transparent placeholder:text-ink-3 focus:ring-2 focus:ring-accent"
            />
          </div>

          {c.error && <InlineAlert>{c.error}</InlineAlert>}

          <Button type="submit" full size="md" loading={c.submittingFeedback}>
            {c.submittingFeedback ? "Submitting..." : "Submit Feedback"}
          </Button>
        </form>
      )}
    </div>
  );
}

// ── TV: MAC address (first-time TV buyers) ─────────────────────────────────
export function TvMacSheet({ c }: { c: PlansCheckout }) {
  return (
    <Sheet open={c.tvPurchaseStep === "mac"} onClose={() => c.closeTvMac()} layer="sheet-over" ariaLabel="Your TV MAC address">
      <div className="pt-1 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent text-white">
          <Tv className="h-7 w-7" />
        </span>
        <h2 className="ui-title-2 mt-4 text-ink">Your TV MAC Address</h2>
        <p className="ui-subhead mx-auto mt-1.5 max-w-xs text-ink-2">
          One quick detail — we use this to provision your TV on the network.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          c.handleTvMacSubmit();
        }}
        className="mt-6 space-y-5"
      >
        {c.error && <InlineAlert>{c.error}</InlineAlert>}
        <TextField
          label="TV MAC Address"
          value={c.tvMacAddress}
          onChange={(e) => c.setTvMacAddress(e.target.value)}
          required
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="00:1A:2B:3C:4D:5E"
          className="[&_input]:font-mono"
          hint="Find this in your TV’s network settings. Accepts colons, hyphens, or no separator."
        />
        <Button type="submit" full loading={c.purchasing}>
          {c.purchasing ? "Processing..." : "Continue to Payment"}
        </Button>
      </form>
    </Sheet>
  );
}

// ── TV: new customer sets a password after paying ──────────────────────────
export function TvPasswordSheet({ c }: { c: PlansCheckout }) {
  return (
    <Sheet open={c.tvPurchaseStep === "password"} layer="sheet-over" ariaLabel="Create your password">
      <div className="pt-1 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-7 w-7" strokeWidth={3} />
        </span>
        <h2 className="ui-title-2 mt-4 text-ink">Payment Successful!</h2>
        <p className="ui-subhead mt-1.5 text-ink-2">Create a password to access your dashboard</p>
      </div>
      <div className="mt-6 space-y-4">
        {c.error && <InlineAlert>{c.error}</InlineAlert>}
        <TextField
          label="Password"
          type="password"
          value={c.tvPassword}
          onChange={(e) => c.setTvPassword(e.target.value)}
          placeholder="Enter password (min. 6 characters)"
          autoComplete="new-password"
          autoFocus
        />
        <TextField
          label="Confirm Password"
          type="password"
          value={c.tvConfirmPassword}
          onChange={(e) => c.setTvConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          autoComplete="new-password"
        />
        <Button full onClick={() => c.handleCreateAccount()} loading={c.purchasing}>
          {c.purchasing ? "Creating Account..." : "Create Account & Continue"}
        </Button>
      </div>
    </Sheet>
  );
}

// ── Link the account to a hostel before the first purchase ──────────────────
export function HostelConfirmSheet({ c }: { c: PlansCheckout }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...c.allHostels]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((h) => !q || h.name.toLowerCase().includes(q));
  }, [c.allHostels, query]);

  return (
    <Sheet
      open={c.showHostelConfirm}
      onClose={() => c.cancelHostelConfirm()}
      layer="sheet-over"
      title="Confirm Your Hostel"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="gray" size="md" onClick={() => c.cancelHostelConfirm()}>
            Cancel
          </Button>
          <Button size="md" onClick={() => c.handleHostelConfirmed()} disabled={!c.confirmedHostel}>
            Confirm &amp; Buy
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent text-white">
          <Wifi className="h-5 w-5" />
        </span>
        <p className="ui-subhead text-ink-2">
          We need to link your account to a hostel before you can purchase. Please confirm which hostel you’re at.
        </p>
      </div>

      {c.allHostels.length > 6 && (
        <SearchField value={query} onChange={setQuery} placeholder="Search hostels" className="mt-4 h-11 shadow-none" />
      )}

      <div role="radiogroup" aria-label="Your hostel" className="ui-grouped mt-4 overflow-hidden rounded-card bg-surface shadow-card">
        {options.map((h) => {
          const selected = c.confirmedHostel === h.name;
          return (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => c.setConfirmedHostel(h.name)}
              className="relative flex min-h-[50px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
            >
              <span className="flex-1 text-[17px] text-ink">{h.name}</span>
              {selected && <Check className="h-5 w-5 text-accent-ink" strokeWidth={2.8} />}
            </button>
          );
        })}
      </div>
      {c.suggestedHostel && <p className="ui-footnote mt-2 px-1 text-ink-2">Suggested based on your purchase history</p>}
    </Sheet>
  );
}

// ── Support team on WhatsApp ────────────────────────────────────────────────
export function SupportContactsSheet({ c }: { c: PlansCheckout }) {
  const agents = [
    ...CORE_SUPPORT_AGENTS,
    ...c.supportContacts.map((s) => ({ name: s.username, phone: s.whatsappPhone })),
  ];
  return (
    <Sheet open={c.showSupportModal} onClose={() => c.setShowSupportModal(false)} history title="Support Team">
      <p className="ui-subhead -mt-1 mb-4 text-ink-2">Choose who to chat with</p>
      <div className="ui-grouped overflow-hidden rounded-card bg-surface shadow-card">
        {agents.map((agent) => (
          <a
            key={agent.phone}
            href={whatsappChatLink(agent.phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => c.setShowSupportModal(false)}
            className="relative flex min-h-[60px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-ink/[0.03]"
            style={{ ["--inset" as string]: "70px" }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wa/10 text-wa-ink">
              <WhatsAppIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-medium text-ink">Chat with {agent.name}</span>
              <span className="ui-footnote text-ink-2">WhatsApp</span>
            </span>
            <ArrowUpRight className="h-[18px] w-[18px] text-ink-3" />
          </a>
        ))}
      </div>
    </Sheet>
  );
}
