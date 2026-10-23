"use client";

/**
 * Whether the website's reserve subaccount splits wallet transfers correctly.
 *
 * Transfers into customers' wallet account numbers (on the website's Paystack
 * account) split by that subaccount's `percentage_charge` — the MAIN account's
 * share — so it must be 97.7 for the reserve to receive 2.3%. Card payments
 * are unaffected: they pass their own exact amount.
 */

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/apiClient";
import { GLASS_INPUT, Panel } from "@/components/admin/ui";

type Status = { code: string; percentageCharge: number; correct: boolean; expected: number; accountName?: string };

export default function SiteSubaccountCheck() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await adminFetch("/api/admin/reserve/site-subaccount");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the website subaccount");
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the website subaccount");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fix = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/reserve/site-subaccount/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the subaccount");
      setPin("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the subaccount");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel eyebrow="WEBSITE ACCOUNT · WALLET TRANSFERS" title="Website reserve split">
      {status ? (
        <div className="space-y-3 text-sm">
          <p className={`rounded-2xl px-4 py-3 ${status.correct ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            <span className="font-semibold">{status.code}</span>
            {status.accountName ? ` · ${status.accountName}` : ""} — main account keeps {status.percentageCharge}%
            {status.correct
              ? `, so the reserve gets ${(100 - status.expected).toFixed(1)}% of each wallet transfer. Correct.`
              : `. It should be ${status.expected}% so the reserve gets ${(100 - status.expected).toFixed(1)}% of each wallet transfer.`}
          </p>
          {!status.correct && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={`${GLASS_INPUT} sm:max-w-[200px]`} type="password" inputMode="numeric" placeholder="Reserve PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
              <button type="button" onClick={fix} disabled={saving || !pin} className="glass-primary">
                {saving ? "Saving…" : `Set to ${status.expected}%`}
              </button>
            </div>
          )}
        </div>
      ) : (
        !error && <p className="text-sm text-slate-500">Checking…</p>
      )}
      {error && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Panel>
  );
}
