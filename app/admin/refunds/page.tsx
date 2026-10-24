"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/apiClient";
import { clearAttentionCache } from "@/lib/adminNav";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import WalletModal from "@/components/admin/WalletModal";
import { AdminPage, EmptyState, GLASS_INPUT, Modal, Panel } from "@/components/admin/ui";

/**
 * /admin/refunds — superadmin only (backend: app/routers/account_deletion.py).
 *
 * Deletion requests: customers who closed their account. Refund any wallet
 * balance first (Record refund = a PIN-confirmed wallet correction with a
 * note), then Erase: their personal details go, their payment records stay.
 * Below: every wallet holding money, and the latest refunds recorded.
 */

type DeletionRequest = {
  userId: string;
  email: string;
  name: string;
  phone: string;
  hostel: string;
  requestedAt: string | null;
  balanceKobo: number;
};
type Balance = { userId: string; email: string; name: string; deletionRequested: boolean; balanceKobo: number };
type Recent = { userId: string; email: string; changeKobo: number; at: string | null; note: string; by: string };

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function RefundsPage() {
  const [requests, setRequests] = useState<DeletionRequest[] | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState("");
  const [walletFor, setWalletFor] = useState<{ userId: string; email: string } | null>(null);
  const [eraseFor, setEraseFor] = useState<DeletionRequest | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [deletions, refunds] = await Promise.all([
        adminFetch("/api/admin/account-deletions").then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(d)))),
        adminFetch("/api/admin/refunds").then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(d)))),
      ]);
      setRequests(deletions.requests);
      setBalances(refunds.balances ?? []);
      setRecent(refunds.recent ?? []);
    } catch (err: any) {
      setError(err?.error || err?.message || "Could not load refunds and deletions");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const afterChange = () => {
    clearAttentionCache(); // the drawer's badge counts deletion requests
    load();
  };

  return (
    <ProtectedRoute requireSuperAdmin>
      <AdminPage eyebrow="MONEY" title="Refunds & deletions" subtitle="Wallet refunds and closed accounts" width="narrow">
        {error && (
          <div className="mb-4 break-words rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700">{error}</div>
        )}

        <Panel eyebrow="WITHIN 30 DAYS" title="Deletion requests">
          {!requests ? (
            <EmptyState title="Loading…" />
          ) : requests.length === 0 ? (
            <EmptyState title="No accounts waiting to be erased" />
          ) : (
            <ul className="divide-y divide-slate-200/60">
              {requests.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{r.name || r.email}</p>
                    <p className="break-all text-sm text-slate-500">
                      {r.email} · {r.phone || "no phone"} · {r.hostel || "no hostel"}
                    </p>
                    <p className="text-xs text-slate-400">Requested {when(r.requestedAt)}</p>
                    {r.balanceKobo > 0 && (
                      <p className="mt-1 text-sm font-semibold text-amber-700">
                        Wallet holds {naira(r.balanceKobo)} — refund it before erasing
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.balanceKobo > 0 && (
                      <button type="button" className="glass-button" onClick={() => setWalletFor({ userId: r.userId, email: r.email })}>
                        Record refund
                      </button>
                    )}
                    <button
                      type="button"
                      className="glass-button text-rose-700"
                      disabled={r.balanceKobo > 0}
                      title={r.balanceKobo > 0 ? "Refund the wallet balance first" : undefined}
                      onClick={() => setEraseFor(r)}
                    >
                      Erase account
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel eyebrow="CUSTOMER MONEY" title="Wallets holding money" className="mt-4">
          {balances.length === 0 ? (
            <EmptyState title="No wallet balances" />
          ) : (
            <ul className="divide-y divide-slate-200/60">
              {balances.map((b) => (
                <li key={b.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="break-all font-medium text-slate-900">{b.name || b.email || b.userId}</p>
                    <p className="break-all text-sm text-slate-500">
                      {b.email}
                      {b.deletionRequested && <span className="ml-2 font-semibold text-amber-700">· closed account</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">{naira(b.balanceKobo)}</span>
                    <button type="button" className="glass-button" onClick={() => setWalletFor({ userId: b.userId, email: b.email })}>
                      Record refund
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel eyebrow="HISTORY" title="Recent refunds and corrections" className="mt-4">
          {recent.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <ul className="divide-y divide-slate-200/60">
              {recent.map((r, i) => (
                <li key={`${r.userId}-${r.at}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="break-all font-medium text-slate-900">{r.email || r.userId}</p>
                    <p className="break-words text-slate-500">
                      {r.note || "—"} · by {r.by || "—"} · {when(r.at)}
                    </p>
                  </div>
                  <span className={`font-semibold ${r.changeKobo < 0 ? "text-slate-900" : "text-emerald-700"}`}>
                    {r.changeKobo < 0 ? "−" : "+"}
                    {naira(Math.abs(r.changeKobo))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {walletFor && (
          <WalletModal
            userId={walletFor.userId}
            email={walletFor.email}
            onClose={() => {
              setWalletFor(null);
              afterChange();
            }}
          />
        )}
        {eraseFor && <EraseModal request={eraseFor} onClose={() => setEraseFor(null)} onErased={afterChange} />}
      </AdminPage>
    </ProtectedRoute>
  );
}

/** PIN-confirmed erase: personal details go, payment records stay. */
function EraseModal({ request, onClose, onErased }: { request: DeletionRequest; onClose: () => void; onErased: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const erase = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(request.userId)}/erase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not erase the account");
      onClose();
      onErased();
    } catch (err: any) {
      setError(err?.message || "Could not erase the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} dismissible={!busy} title={`Erase ${request.email}?`}>
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          This permanently removes their name, email, phone, hostel, sign-in and TV device addresses. Their purchase,
          payment and wallet records are kept, as the law requires. It can&apos;t be undone.
        </p>
        <input
          className={GLASS_INPUT}
          type="password"
          inputMode="numeric"
          placeholder="Reserve PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="glass-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            onClick={erase}
            disabled={busy || !pin}
          >
            {busy ? "Erasing…" : "Erase account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
