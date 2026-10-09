"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, MessageCircle, RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";

/**
 * WhatsApp bot usage, for the super admin: who messages the bot and how much,
 * over a date range. Message counts start the day the bot began reporting
 * them (`recordingSince`); bot checkouts go back further, so both are shown.
 */

type Spread = { highest: number; average: number; median: number; lowest: number };

type Report = {
  from: string | null;
  to: string | null;
  messages: {
    recordingSince: string | null;
    activeUsers: number;
    messages: number;
    perUser: Spread;
    averageUsersPerDay: number;
    daily: { day: string; users: number; messages: number }[];
    topUsers: { user: string; messages: number; activeDays: number; firstAt: string | null; lastAt: string | null }[];
  };
  checkouts: { users: number; checkouts: number; completed: number; perUser: Spread };
};

type Preset = "7" | "30" | "month" | "all" | "custom";

const todayUtc = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const monthStart = () => `${todayUtc().slice(0, 8)}01`;

function query(preset: Preset, from: string, to: string): string {
  if (preset === "all") return "range=all";
  if (preset === "7") return `from=${daysAgo(6)}&to=${todayUtc()}`;
  if (preset === "30") return `from=${daysAgo(29)}&to=${todayUtc()}`;
  if (preset === "month") return `from=${monthStart()}&to=${todayUtc()}`;
  const parts = [];
  if (from) parts.push(`from=${from}`);
  if (to) parts.push(`to=${to}`);
  return parts.join("&");
}

const formatWhen = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="text-sm text-apple-gray-500">{label}</p>
      <p className="text-3xl font-bold text-apple-gray-900 mt-2">{value}</p>
      {hint && <p className="text-xs text-apple-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function SpreadRow({ title, spread, unit }: { title: string; spread: Spread; unit: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="text-sm font-semibold text-apple-gray-900 mb-3">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            ["Highest", spread.highest],
            ["Average", spread.average],
            ["Median", spread.median],
            ["Lowest", spread.lowest],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-apple-gray-50 p-3">
            <p className="text-xs text-apple-gray-500">{label}</p>
            <p className="text-xl font-semibold text-apple-gray-900">
              {value} <span className="text-xs font-normal text-apple-gray-400">{unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BotUsagePage() {
  const { adminProfile, logout } = useAuthStore();
  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;
  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayUtc());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/bot-activity?${query(preset, from, to)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load bot usage");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bot usage");
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    if (isSuperAdmin && preset !== "custom") load();
  }, [isSuperAdmin, preset, load]);

  const m = report?.messages;
  const c = report?.checkouts;
  const busiestDay = m?.daily.reduce((top, d) => Math.max(top, d.messages), 0) || 1;
  const rangeLabel = report ? `${report.from ?? "the beginning"} → ${report.to ?? "today"}` : "";

  return (
    <ProtectedRoute requireSuperAdmin>
      <div className="min-h-screen bg-apple-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Logo variant="dark" />
              <div>
                <h1 className="text-2xl font-bold text-apple-gray-900">Bot Usage</h1>
                <p className="text-sm text-apple-gray-500">Who messages the WhatsApp bot, and how much</p>
              </div>
            </div>
            <button
              onClick={() => { logout(); window.location.href = "/admin/login"; }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg hover:bg-apple-gray-100"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm text-apple-gray-600 hover:text-apple-gray-900">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </Link>
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>

          {!isSuperAdmin ? (
            <div className="bg-white rounded-2xl p-8 text-center text-apple-gray-500">This section is available to the super admin only.</div>
          ) : (
            <>
              {/* Filters */}
              <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap items-end gap-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["7", "Last 7 days"],
                      ["30", "Last 30 days"],
                      ["month", "This month"],
                      ["all", "All time"],
                      ["custom", "Custom"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setPreset(value)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        preset === value ? "bg-green-600 text-white" : "bg-apple-gray-100 text-apple-gray-700 hover:bg-apple-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-apple-gray-500">
                      From
                      <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                        className="block mt-1 rounded-lg border border-apple-gray-200 px-2 py-2 text-sm" />
                    </label>
                    <label className="text-xs text-apple-gray-500">
                      To
                      <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                        className="block mt-1 rounded-lg border border-apple-gray-200 px-2 py-2 text-sm" />
                    </label>
                    <button onClick={load} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                      Apply
                    </button>
                  </div>
                )}
                <button onClick={load} disabled={loading} className="ml-auto p-2 rounded-xl bg-apple-gray-100 hover:bg-apple-gray-200 disabled:opacity-50" title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {error && <div className="bg-red-50 text-red-700 rounded-2xl p-5">{error}</div>}
              {!report && !error && <div className="bg-white rounded-2xl p-8 text-center text-apple-gray-500">Loading…</div>}

              {report && m && c && (
                <>
                  <p className="text-xs text-apple-gray-500">
                    {rangeLabel} (UTC).{" "}
                    {m.recordingSince
                      ? `Message counts are recorded from ${m.recordingSince}; earlier days show none.`
                      : "Message counts haven't started yet: they begin once the updated bot is deployed."}
                  </p>

                  {/* Messages */}
                  <h2 className="text-lg font-semibold text-apple-gray-900">Messages</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card label="Active users" value={m.activeUsers} hint="Sent at least one message" />
                    <Card label="Messages" value={m.messages} />
                    <Card label="Average users per day" value={m.averageUsersPerDay} hint="Quiet days count as zero" />
                  </div>
                  <SpreadRow title="Messages per user" spread={m.perUser} unit="msgs" />

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm">
                      <p className="text-sm font-semibold text-apple-gray-900 mb-3">By day</p>
                      {m.daily.length === 0 ? (
                        <p className="text-sm text-apple-gray-400">No messages in this range.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-96 overflow-y-auto">
                          {m.daily.map((d) => (
                            <div key={d.day} className="flex items-center gap-3 text-xs">
                              <span className="w-20 shrink-0 text-apple-gray-500">{d.day}</span>
                              <div className="flex-1 h-4 rounded bg-apple-gray-50">
                                <div className="h-4 rounded bg-green-500" style={{ width: `${(d.messages / busiestDay) * 100}%` }} />
                              </div>
                              <span className="w-28 shrink-0 text-right text-apple-gray-700">
                                {d.users} users · {d.messages} msgs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm overflow-x-auto">
                      <p className="text-sm font-semibold text-apple-gray-900 mb-3">Most active users</p>
                      {m.topUsers.length === 0 ? (
                        <p className="text-sm text-apple-gray-400">No messages in this range.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-apple-gray-500">
                              <th className="pb-2">User</th>
                              <th className="pb-2 text-right">Messages</th>
                              <th className="pb-2 text-right">Days</th>
                              <th className="pb-2 text-right">Last message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-apple-gray-100">
                            {m.topUsers.map((u) => (
                              <tr key={`${u.user}-${u.firstAt}`}>
                                <td className="py-2 font-mono text-xs">{u.user}</td>
                                <td className="py-2 text-right">{u.messages}</td>
                                <td className="py-2 text-right">{u.activeDays}</td>
                                <td className="py-2 text-right text-apple-gray-500">{formatWhen(u.lastAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Checkouts */}
                  <h2 className="text-lg font-semibold text-apple-gray-900 pt-2">Bot checkouts</h2>
                  <p className="text-xs text-apple-gray-500 -mt-4">
                    Purchases started in the bot. These go back to the bot&apos;s launch, so use them for older periods.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card label="Users who started a checkout" value={c.users} />
                    <Card label="Checkouts" value={c.checkouts} />
                    <Card label="Completed" value={c.completed}
                      hint={c.checkouts ? `${Math.round((c.completed / c.checkouts) * 100)}% of checkouts` : undefined} />
                  </div>
                  <SpreadRow title="Checkouts per user" spread={c.perUser} unit="checkouts" />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
