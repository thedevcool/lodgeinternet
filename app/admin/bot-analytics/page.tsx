"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";

type Metrics = {
  totalCheckouts: number;
  completed: number;
  partiallyPaid: number;
  cancelled: number;
  cardFallbacks: number;
  dvaPayments: number;
  invalidPhoneFallbacks: number;
  providerFallbacks: number;
  completionRate: number;
};

export default function BotAnalyticsPage() {
  const { adminProfile, logout } = useAuthStore();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminProfile?.isSuperAdmin) return;
    apiFetch("/api/admin/bot-analytics")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load analytics");
        setMetrics(data);
      })
      .catch((err) => setError(err.message || "Could not load analytics"));
  }, [adminProfile?.isSuperAdmin]);

  const cards = metrics
    ? [
        ["Total checkouts", metrics.totalCheckouts],
        ["Completed", metrics.completed],
        ["Completion rate", `${metrics.completionRate}%`],
        ["DVA payments", metrics.dvaPayments],
        ["Card fallbacks", metrics.cardFallbacks],
        ["Partial payments", metrics.partiallyPaid],
        ["Invalid phone cases", metrics.invalidPhoneFallbacks],
        ["Provider fallback cases", metrics.providerFallbacks],
      ]
    : [];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-apple-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo variant="dark" />
              <div>
                <h1 className="text-2xl font-bold text-apple-gray-900">Bot Analytics</h1>
                <p className="text-sm text-apple-gray-500">Super-admin payment reliability metrics</p>
              </div>
            </div>
            <button onClick={() => { logout(); window.location.href = "/admin/login"; }} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg hover:bg-apple-gray-100">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm text-apple-gray-600 hover:text-apple-gray-900">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </Link>
            <Activity className="w-6 h-6 text-cyan-600" />
          </div>
          {!adminProfile?.isSuperAdmin ? (
            <div className="bg-white rounded-2xl p-8 text-center text-apple-gray-500">This section is available to the super admin only.</div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 rounded-2xl p-5">{error}</div>
          ) : !metrics ? (
            <div className="bg-white rounded-2xl p-8 text-center text-apple-gray-500">Loading analytics…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cards.map(([label, value]) => (
                <div key={String(label)} className="bg-white rounded-2xl shadow-sm p-5">
                  <p className="text-sm text-apple-gray-500">{label}</p>
                  <p className="text-3xl font-bold text-apple-gray-900 mt-2">{value}</p>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
