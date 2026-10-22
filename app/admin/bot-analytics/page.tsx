"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { AdminPage, Panel, Kpi, EmptyState, type Tone } from "@/components/admin/ui";

/** One tint per tile, in the order the cards are listed. */
const CARD_TONES: Tone[] = ["blue", "green", "teal", "violet", "orange", "purple", "red", "slate"];

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
  const { adminProfile } = useAuthStore();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminProfile?.isSuperAdmin) return;
    adminFetch("/api/admin/bot-analytics")
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
    <ProtectedRoute requireSuperAdmin>
      <AdminPage
        eyebrow="WHATSAPP BOT"
        title="Bot Analytics"
        subtitle="Super-admin payment reliability metrics"
      >
        {!adminProfile?.isSuperAdmin ? (
          <Panel>
            <EmptyState title="This section is available to the super admin only." />
          </Panel>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700 break-words">{error}</div>
        ) : !metrics ? (
          <Panel>
            <EmptyState title="Loading analytics…" />
          </Panel>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map(([label, value], i) => (
              <Kpi key={String(label)} label={String(label)} value={value} tone={CARD_TONES[i % CARD_TONES.length]} />
            ))}
          </div>
        )}
      </AdminPage>
    </ProtectedRoute>
  );
}
