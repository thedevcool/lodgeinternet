"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Smartphone, Trash2 } from "lucide-react";
import DeleteAccountSheet from "@/components/account/DeleteAccountSheet";
import { useCustomer } from "@/components/client/CustomerProvider";
import ThemeToggle from "@/components/client/ThemeToggle";
import Badge from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { ListSkeleton } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useWalletDesign, WALLET_DESIGNS, type WalletDesign } from "@/components/wallet/walletDesigns";

/**
 * /settings — Appearance, Wallet design, the Lodge app teaser, Legal and
 * "Delete my account". Signed-in customers only.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { user, ready } = useCustomer();
  const [design, chooseDesign] = useWalletDesign();
  const [deleting, setDeleting] = useState(false);
  // Signed out while on the page (Log out / Delete my account): those flows
  // send the customer home themselves — don't bounce them to sign-in.
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (user) wasSignedIn.current = true;
    else if (ready) router.replace(wasSignedIn.current ? "/" : "/login?redirect=/settings");
  }, [user, ready, router]);

  if (!user) {
    return (
      <Container>
        <PageHeader title="Settings" />
        <ListSkeleton rows={3} />
      </Container>
    );
  }

  return (
    <Container className="pb-16">
      <PageHeader title="Settings" back={{ href: "/dashboard", label: "Account" }} />

      <section>
        <h2 className="ui-footnote mb-2 px-4 font-medium uppercase tracking-[0.04em] text-ink-2">Appearance</h2>
        <div className="rounded-card bg-surface p-4 shadow-card">
          <ThemeToggle withLabels className="w-full sm:w-auto" />
        </div>
        <p className="ui-footnote mt-2 px-4 text-ink-2">System follows your phone or computer&apos;s setting.</p>
      </section>

      <section className="mt-8">
        <h2 className="ui-footnote mb-2 px-4 font-medium uppercase tracking-[0.04em] text-ink-2">Wallet design</h2>
        <div
          role="radiogroup"
          aria-label="Wallet design"
          className="grid grid-cols-2 gap-3 rounded-card bg-surface p-3 shadow-card sm:grid-cols-3"
        >
          {WALLET_DESIGNS.map((d) => (
            <DesignOption key={d.id} design={d} selected={design.id === d.id} onSelect={() => chooseDesign(d.id)} />
          ))}
        </div>
        <p className="ui-footnote mt-2 px-4 text-ink-2">Changes how your wallet card looks on your Account page.</p>
      </section>

      <section className="mt-8">
        <h2 className="ui-footnote mb-2 px-4 font-medium uppercase tracking-[0.04em] text-ink-2">Lodge app</h2>
        <div className="flex items-start gap-4 rounded-card bg-surface p-5 shadow-card">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="ui-headline text-ink">Lodge for iPhone and Android</p>
              <Badge tone="accent">Coming soon</Badge>
            </div>
            <p className="ui-subhead mt-1 text-ink-2">
              Buy plans, top up your wallet and check your data in a tap — all from your home screen.
            </p>
          </div>
        </div>
      </section>

      <GroupedList header="Account" className="mt-8">
        <ListRow
          href="/legal"
          leading={<Tile className="bg-ink/[0.06] text-ink-2"><FileText className="h-5 w-5" /></Tile>}
          title="Legal"
          subtitle="Terms, privacy and refunds"
        />
        <ListRow
          onClick={() => setDeleting(true)}
          leading={<Tile className="bg-danger/10 text-danger"><Trash2 className="h-5 w-5" /></Tile>}
          title={<span className="text-danger">Delete my account</span>}
          subtitle="Close your account for good"
        />
      </GroupedList>

      <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} />
    </Container>
  );
}

function Tile({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]", className)}>{children}</span>
  );
}

/** A tappable live preview: the design's card with a sample balance and
 * masked account number, as the wallet will look. */
function DesignOption({ design, selected, onSelect }: { design: WalletDesign; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="group rounded-[18px] p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* The ring sits on this wrapper: coloured designs re-point --accent
          to white inside the card itself. */}
      <span
        className={cx(
          "block rounded-[16px] ring-2 ring-offset-2 ring-offset-surface transition",
          selected ? "ring-accent" : "ring-transparent group-hover:ring-ink/10",
        )}
      >
        <span className={cx("relative block rounded-[14px] p-3 shadow-card", design.card)}>
          <span className="ui-caption block text-ink-2">Balance</span>
          <span className="block text-[17px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-ink">
            ₦12,500.00
          </span>
          <span className={cx("mt-2 block rounded-lg px-2 py-1.5", design.panel)}>
            <span className="block font-mono text-[12px] font-semibold tracking-[0.08em] text-ink">•••• 4821</span>
          </span>
          {selected && (
            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white [--accent:37_99_235]">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </span>
      </span>
      <span className={cx("ui-footnote mt-1.5 block px-1 font-medium", selected ? "text-ink" : "text-ink-2")}>
        {design.name}
      </span>
    </button>
  );
}
