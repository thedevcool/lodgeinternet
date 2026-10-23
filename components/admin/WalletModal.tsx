"use client";

/**
 * One customer's wallet, for the superadmin: balance, account numbers, recent
 * activity, and a PIN-confirmed correction (credit or remove) with a required
 * note. Every correction is a ledger entry carrying who made it and why.
 */

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { GLASS_INPUT, Modal } from "@/components/admin/ui";

type Activity = { type: string; reference: string; changeKobo: number; at: string | null; metadata: Record<string, unknown> };
type Dva = { account_number?: string; bank_name?: string; account_name?: string } | null;
type WalletView = { balanceKobo: number; walletDva: Dva; dvaFailed: boolean; activity: Activity[] };

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

const LABEL: Record<string, string> = {
  wallet_topup: "Top-up",
  wallet_spend: "Plan purchase",
  wallet_spend_reversal: "Refund (purchase failed)",
  wallet_adjustment: "Admin adjustment",
};

export default function WalletModal({
  userId,
  email,
  onClose,
}: {
  userId: string;
  email: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<WalletView | null>(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/wallet`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the wallet");
      setView(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the wallet");
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const adjust = async () => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/wallet/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountNaira: Number(amount), note, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the adjustment");
      setAmount("");
      setNote("");
      setPin("");
      setSaved(`Saved. New balance ${naira(data.balanceKobo)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the adjustment");
    } finally {
      setSaving(false);
    }
  };

  const dvaLine = (dva: Dva) =>
    dva?.account_number ? `${dva.account_number} · ${dva.bank_name ?? ""} · ${dva.account_name ?? ""}` : "—";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!saving}
      icon={
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-blue-500 text-white">
          <Wallet size={18} />
        </span>
      }
      title={<span className="block pt-1.5">Wallet · <span className="break-all font-normal text-slate-500">{email}</span></span>}
    >
      {!view && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {view && (
        <div className="space-y-4">
          <div className="kpi-card kpi-green">
            <p className="kpi-label">Balance</p>
            <p className="kpi-value">{naira(view.balanceKobo)}</p>
          </div>
          <div className="glass-card text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Account number</p>
            <p className="mt-1 break-words text-slate-700">
              {view.dvaFailed ? "The bank couldn't open one — card payments and card top-ups are unlocked." : dvaLine(view.walletDva)}
            </p>
          </div>

          <div>
            <p className="eyebrow">ACTIVITY</p>
            {view.activity.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No wallet activity yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200/60 rounded-2xl bg-white/50">
                {view.activity.map((a, i) => (
                  <li key={`${a.reference}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {LABEL[a.type] ?? a.type}
                        {typeof a.metadata?.planName === "string" && a.metadata.planName ? ` · ${a.metadata.planName}` : ""}
                        {a.type === "wallet_topup" && a.metadata?.channel === "card" ? " · card" : ""}
                      </p>
                      <p className="break-all text-xs text-slate-500">
                        {a.at ? new Date(a.at).toLocaleString() : ""}
                        {typeof a.metadata?.note === "string" ? ` · ${a.metadata.note}` : ""}
                      </p>
                    </div>
                    <span className={`font-semibold ${a.changeKobo >= 0 ? "text-emerald-700" : "text-slate-700"}`}>
                      {a.changeKobo >= 0 ? "+" : "−"}
                      {naira(Math.abs(a.changeKobo))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/50 p-4">
            <p className="eyebrow">CORRECT THE BALANCE</p>
            <p className="mt-1 text-sm text-slate-500">
              Positive credits the customer (a refund or goodwill); negative removes credit (for example money already
              refunded to them). Needs a note and your reserve PIN.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input className={GLASS_INPUT} type="number" inputMode="decimal" placeholder="Amount in naira, e.g. 500 or -500" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input className={GLASS_INPUT} type="password" inputMode="numeric" placeholder="Reserve PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
              <input className={`${GLASS_INPUT} sm:col-span-2`} placeholder="Why (shown in the history)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={adjust}
              disabled={saving || !amount || !note.trim() || !pin}
              className="glass-primary mt-3 w-full sm:w-auto"
            >
              {saving ? "Saving…" : "Save adjustment"}
            </button>
            {saved && <p className="mt-2 text-sm text-emerald-700">{saved}</p>}
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Modal>
  );
}
