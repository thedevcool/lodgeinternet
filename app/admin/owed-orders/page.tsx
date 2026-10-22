"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/apiClient";
import { clearAttentionCache } from "@/lib/adminNav";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { AdminPage, Panel, EmptyState, GLASS_INPUT } from "@/components/admin/ui";

/**
 * /admin/owed-orders — paid for but not delivered (backend:
 * app/routers/admin_owed_orders.py). Superadmin only: they sort each one out
 * by hand, usually a voucher straight from Omada, and record it here as
 * settled offline: who, when, and how.
 */

type Order = {
  kind: "purchase" | "checkout";
  id: string;
  state: string;
  customerEmail: string;
  planName: string;
  hostel: string;
  amountPaid: number;
  amountOwed: number;
  paymentRef: string;
  at: string | null;
};

function describe(order: Order): string {
  if (order.kind === "purchase" && order.state === "unmatched")
    return "Payment received with no order to match it to: give them a code, or refund them";
  if (order.kind === "purchase") return "Paid on checkout, no code was available";
  if (order.state === "partially_paid") return `Part paid by transfer: ₦${order.amountOwed.toLocaleString()} still to pay`;
  return "Paid by transfer to the bot, no code was sent";
}

export default function OwedOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    adminFetch("/api/admin/owed-orders")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load owed orders");
        setOrders(data.orders);
      })
      .catch((err) => setError(err.message || "Could not load owed orders"));
  }, []);

  useEffect(load, [load]);

  return (
    <ProtectedRoute requireSuperAdmin>
      <AdminPage eyebrow="MONEY" title="Owed orders" subtitle="Paid for but not delivered" width="narrow">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700 break-words">{error}</div>
        ) : !orders ? (
          <Panel>
            <EmptyState title="Loading owed orders…" />
          </Panel>
        ) : orders.length === 0 ? (
          <Panel>
            <EmptyState title="Nothing owed: every paid order was delivered." />
          </Panel>
        ) : (
          <>
            <p className="glass-alert">
              {orders.length} paid order{orders.length === 1 ? "" : "s"} still owed. Sort each one out with the customer (a voucher
              from Omada, or a refund), then record it here.
            </p>
            <div className="space-y-4">
              {orders.map((order) => (
                <OwedOrder
                  key={`${order.kind}:${order.id}`}
                  order={order}
                  onSettled={() => {
                    clearAttentionCache();
                    load();
                  }}
                />
              ))}
            </div>
          </>
        )}
      </AdminPage>
    </ProtectedRoute>
  );
}

function OwedOrder({ order, onSettled }: { order: Order; onSettled: () => void }) {
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const settle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setError("Say how it was settled.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/owed-orders/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: order.kind, id: order.id, note: note.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not record it");
      onSettled();
    } catch (err: any) {
      setError(err.message || "Could not record it");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-semibold text-slate-900">
            {order.planName || "Plan"} · {order.hostel || "Unknown hostel"}
          </p>
          <p className="break-all text-sm text-slate-600">{order.customerEmail || "No email"}</p>
          <p className="text-sm text-amber-700 mt-1">{describe(order)}</p>
        </div>
        <div className="min-w-0 sm:max-w-[45%] sm:text-right">
          <p className="font-semibold text-slate-900">₦{order.amountPaid.toLocaleString()} paid</p>
          <p className="break-all font-mono text-xs text-slate-500">{order.paymentRef || "No reference"}</p>
          <p className="text-xs text-slate-500">{order.at ? new Date(order.at).toLocaleString() : ""}</p>
        </div>
      </div>
      <form onSubmit={settle} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How was it settled? (e.g. Omada voucher)"
          className={`${GLASS_INPUT} min-w-0 sm:flex-1`}
        />
        {order.kind === "purchase" && (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code handed over (optional)"
            className={`${GLASS_INPUT} sm:w-56`}
          />
        )}
        <button type="submit" disabled={saving} className="glass-primary shrink-0">
          {saving ? "Saving…" : "Settled offline"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Panel>
  );
}
