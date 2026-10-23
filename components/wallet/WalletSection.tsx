"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CreditCard, RotateCcw, SlidersHorizontal, Smartphone, Wallet as WalletIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { EmptyState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { AccountDetails } from "./AccountDetails";
import {
  confirmCardTopup,
  fetchWallet,
  looksLikePhone,
  naira,
  requestDva,
  savePhone,
  startCardTopup,
  type CardTopup,
  type Wallet,
  type WalletActivity,
} from "./walletApi";

/**
 * Dashboard "Wallet": balance, the customer's own account number for top-ups,
 * and the recent activity. Renders nothing while loading or when the wallet
 * is off.
 *
 * The account number is opened for the customer, never asked for: straight
 * away when we have their phone (the bank needs one), otherwise right after
 * they add it. Only if the bank still can't open it does the card top-up
 * appear, with a retry.
 */
export default function WalletSection({ profileHasPhone }: { profileHasPhone?: boolean }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const autoOpened = useRef(false);
  // Bumped by every load and every local change: a load that started
  // earlier is stale when it lands and is dropped, so it can't undo, say, a
  // failure we've just been told about.
  const version = useRef(0);

  const load = () => {
    const mine = ++version.current;
    fetchWallet().then((w) => {
      if (mine === version.current) setWallet(w);
    });
  };
  const update = (patch: Partial<Extract<Wallet, { available: true }>>) => {
    version.current++;
    setWallet((w) => (w && w.available ? { ...w, ...patch } : w));
  };

  // POST /api/wallet/dva. A failure is remembered by the server (dvaFailed),
  // which is what unlocks card top-ups and card at checkout.
  const openAccount = async () => {
    setOpening(true);
    setError("");
    try {
      update({ dva: await requestDva(), dvaFailed: false, hasPhone: true });
    } catch (err: any) {
      if (err?.code === "DVA_UNAVAILABLE") update({ dvaFailed: true });
      else setError(err?.message || "Couldn't open your account number. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from Paystack's card page: confirm the top-up, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("topup") !== "card" || !reference) return;
    window.history.replaceState(null, "", window.location.pathname);
    confirmCardTopup(reference)
      .then((balanceKobo) => {
        update({ balanceKobo });
        setNotice(`Top-up received. Your balance is ${naira(balanceKobo)}.`);
        load();
      })
      .catch((err) => setError(err?.message || "We couldn't confirm your top-up yet. It will show here shortly."));
  }, []);

  // Either source saying "no phone" is enough to ask (the wallet one also
  // checks that the saved number is a valid Nigerian mobile).
  const hasPhone = !!wallet && wallet.available && wallet.hasPhone && profileHasPhone !== false;

  // We have their phone but no account number yet (and no recorded failure):
  // open it now, once, without making them press anything.
  useEffect(() => {
    if (!wallet || !wallet.available || wallet.dva || wallet.dvaFailed || !hasPhone || autoOpened.current) return;
    autoOpened.current = true;
    openAccount();
  }, [wallet, hasPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wallet || !wallet.available) return null;

  // A phone was just saved: open the account straight away — that's what the
  // customer added the number for.
  const afterPhoneSaved = () => {
    autoOpened.current = true;
    update({ hasPhone: true });
    openAccount();
  };

  return (
    <>
      <section className="mt-8">
        <h2 className="ui-footnote mb-2 px-4 font-medium uppercase tracking-[0.04em] text-ink-2">Wallet</h2>
        <div className="rounded-card bg-surface p-5 shadow-card">
          <p className="ui-subhead flex items-center gap-1.5 text-ink-2">
            <WalletIcon className="h-4 w-4" /> Balance
          </p>
          <p className="mt-1 text-[34px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-ink">
            {naira(wallet.balanceKobo)}
          </p>
          {notice && <InlineAlert tone="info" className="mt-3">{notice}</InlineAlert>}

          <div className="mt-4">
            {wallet.dva ? (
              <>
                <AccountDetails dva={wallet.dva} />
                <p className="ui-footnote mt-3 text-ink-2">
                  Transfer any amount to this account to top up. Your balance pays for plans instantly.
                </p>
              </>
            ) : opening ? (
              <p className="ui-subhead text-ink-2">Opening your own account number…</p>
            ) : wallet.dvaFailed ? (
              <>
                <InlineAlert tone="warning">
                  The bank couldn&apos;t open your account number just now. You can top up by card meanwhile.
                </InlineAlert>
                <Button variant="tinted" full size="md" onClick={openAccount} className="mt-3">
                  Try again
                </Button>
                <CardTopUp />
              </>
            ) : !hasPhone ? (
              <p className="ui-subhead text-ink-2">Add your phone number below to get your own account number for top-ups.</p>
            ) : null}
          </div>

          {error && <InlineAlert className="mt-3">{error}</InlineAlert>}
        </div>

        {!hasPhone && <PhonePrompt onSaved={afterPhoneSaved} />}
      </section>

      <GroupedList header="Wallet activity" className="mt-8">
        {wallet.activity.length === 0 ? (
          <div className="relative">
            <EmptyState
              icon={<WalletIcon />}
              title="No wallet activity yet"
              message="Top-ups and plans paid from your wallet will show here."
            />
          </div>
        ) : (
          wallet.activity.map((item, i) => <ActivityRow key={`${item.reference}-${i}`} item={item} />)
        )}
      </GroupedList>
    </>
  );
}

/** Card top-up (only shown when the bank couldn't open an account number).
 * The card fee is added on top and shown before paying; Paystack brings the
 * customer back here to confirm. */
function CardTopUp() {
  const [amount, setAmount] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<CardTopup | null>(null);

  if (ready) {
    return (
      <div className="mt-4 rounded-2xl bg-ink/[0.04] p-4">
        <dl className="ui-subhead space-y-1 text-ink-2">
          <div className="flex justify-between gap-3">
            <dt>To your wallet</dt>
            <dd className="tabular-nums text-ink">{naira(ready.creditKobo)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Card fee</dt>
            <dd className="tabular-nums text-ink">{naira(ready.feeKobo)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-semibold text-ink">
            <dt>You pay</dt>
            <dd className="tabular-nums">{naira(ready.totalKobo)}</dd>
          </div>
        </dl>
        <Button full size="md" className="mt-3" onClick={() => (window.location.href = ready.authorizationUrl)}>
          <CreditCard className="h-4 w-4" />
          Pay {naira(ready.totalKobo)} by card
        </Button>
        <Button variant="plain" full size="md" className="mt-1" onClick={() => setReady(null)}>
          Change amount
        </Button>
      </div>
    );
  }

  const start = async () => {
    const value = Number(amount);
    if (!value || value < 500) {
      setError("Top up at least ₦500.");
      return;
    }
    setStarting(true);
    setError("");
    try {
      setReady(await startCardTopup(value));
    } catch (err: any) {
      setError(err?.message || "Couldn't start the top-up.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
    >
      <TextField
        label="Top up by card"
        type="number"
        inputMode="numeric"
        min={500}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount in naira, e.g. 2000"
        error={error || null}
        className="min-w-0 flex-1"
      />
      <Button type="submit" size="md" loading={starting} className="sm:mt-[26px]">
        {!starting && <CreditCard className="h-4 w-4" />}
        Top up
      </Button>
    </form>
  );
}

// Label + icon per ledger entry type (literal classes so Tailwind keeps them).
const ACTIVITY: Record<string, { label: string; icon: typeof ArrowDownLeft; tile: string }> = {
  wallet_topup: { label: "Top-up", icon: ArrowDownLeft, tile: "bg-success/10 text-success" },
  wallet_spend: { label: "Plan purchase", icon: ArrowUpRight, tile: "bg-accent/10 text-accent-ink" },
  wallet_spend_reversal: { label: "Refund", icon: RotateCcw, tile: "bg-success/10 text-success" },
  wallet_adjustment: { label: "Adjustment", icon: SlidersHorizontal, tile: "bg-ink/[0.06] text-ink-2" },
};

/** "Plan purchase · 5GB", "Top-up by card": what the ledger entry was for. */
function activityTitle(item: WalletActivity, label: string): string {
  const meta = item.metadata || {};
  if (item.type === "wallet_spend" && typeof meta.planName === "string" && meta.planName) {
    return `${label} · ${meta.planName}`;
  }
  if (item.type === "wallet_topup" && meta.channel === "card") return "Top-up by card";
  return label;
}

function ActivityRow({ item }: { item: WalletActivity }) {
  const kind = ACTIVITY[item.type] ?? ACTIVITY.wallet_adjustment;
  const Icon = kind.icon;
  const moneyIn = item.changeKobo > 0;
  return (
    <ListRow
      leading={
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]", kind.tile)}>
          <Icon className="h-5 w-5" />
        </span>
      }
      title={activityTitle(item, kind.label)}
      subtitle={
        item.at
          ? new Date(item.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "—"
      }
      trailing={
        <span className={cx("font-semibold tabular-nums", moneyIn ? "text-success" : "text-ink")}>
          {moneyIn ? "+" : "−"}
          {naira(Math.abs(item.changeKobo))}
        </span>
      }
    />
  );
}

/** "Add your phone number…" with an inline save (PATCH /api/account/phone). */
function PhonePrompt({ onSaved }: { onSaved: () => void }) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!looksLikePhone(phone)) {
      setError("Enter a Nigerian mobile number, e.g. 0803 123 4567.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await savePhone(phone);
      onSaved();
    } catch (err: any) {
      setError(err?.message || "Couldn't save your phone number.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-3 rounded-card bg-surface p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-accent/10 text-accent-ink">
          <Smartphone className="h-5 w-5" />
        </span>
        <p className="ui-subhead min-w-0 flex-1 text-ink">
          Add your phone number to get your own bank account for faster payments.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 123 4567"
          error={error || null}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="md" loading={saving} className="sm:mt-[26px]">
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
