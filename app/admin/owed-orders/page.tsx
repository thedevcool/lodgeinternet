"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, HandCoins, LogOut } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { clearAttentionCache } from "@/lib/adminNav";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";

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
  if (order.kind === "purchase") return "Paid on checkout, no code was available";
  if (order.state === "partially_paid") return `Part paid by transfer: ₦${order.amountOwed.toLocaleString()} still to pay`;
  return "Paid by transfer to the bot, no code was sent";
}

export default function OwedOrdersPage() {
  const { logout } = useAuthStore();
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
      <div className="min-h-screen bg-apple-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Logo variant="dark" />
              <div>
                <h1 className="text-2xl font-bold text-apple-gray-900">Owed orders</h1>
                <p className="text-sm text-apple-gray-500">Paid for but not delivered</p>
              </div>
            </div>
            <button onClick={() => { logout(); window.location.href = "/admin/login"; }} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg hover:bg-apple-gray-100">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm text-apple-gray-600 hover:text-apple-gray-900">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </Link>
            <HandCoins className="w-6 h-6 text-amber-600" />
          </div>
          {error ? (
            <div className="bg-red-50 text-red-700 rounded-2xl p-5">{error}</div>
          ) : !orders ? (
            <div className="bg-white rounded-2xl p-8 text-center text-apple-gray-500">Loading owed orders…</div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-apple-gray-500">Nothing owed: every paid order was delivered.</div>
          ) : (
            <>
              <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
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
        </main>
      </div>
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
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-apple-gray-900">
            {order.planName || "Plan"} · {order.hostel || "Unknown hostel"}
          </p>
          <p className="text-sm text-apple-gray-600">{order.customerEmail || "No email"}</p>
          <p className="text-sm text-amber-700 mt-1">{describe(order)}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-apple-gray-900">₦{order.amountPaid.toLocaleString()} paid</p>
          <p className="text-xs text-apple-gray-500">{order.paymentRef || "No reference"}</p>
          <p className="text-xs text-apple-gray-500">{order.at ? new Date(order.at).toLocaleString() : ""}</p>
        </div>
      </div>
      <form onSubmit={settle} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How was it settled? (e.g. voucher from Omada by WhatsApp)"
          className="flex-1 rounded-lg border border-apple-gray-200 px-3 py-2 text-sm"
        />
        {order.kind === "purchase" && (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code handed over (optional)"
            className="rounded-lg border border-apple-gray-200 px-3 py-2 text-sm sm:w-56"
          />
        )}
        <button type="submit" disabled={saving} className="rounded-lg bg-apple-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Settled offline"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
