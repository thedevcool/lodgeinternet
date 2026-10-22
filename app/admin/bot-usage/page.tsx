"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import {
  AdminPage,
  Panel,
  Kpi,
  GLASS_INPUT,
  IconButton,
  ResponsiveTable,
  MobileCard,
  EmptyState,
  type Column,
} from "@/components/admin/ui";

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

function SpreadRow({ title, spread, unit }: { title: string; spread: Spread; unit: string }) {
  return (
    <Panel title={title}>
      <div className="stat-row">
        {(
          [
            ["Highest", spread.highest],
            ["Average", spread.average],
            ["Median", spread.median],
            ["Lowest", spread.lowest],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="stat min-w-0">
            <p className="stat-label">{label}</p>
            <p className="stat-value break-words">
              {value} <span className="text-xs font-normal text-slate-400">{unit}</span>
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

type TopUser = Report["messages"]["topUsers"][number];

const TOP_USER_COLUMNS: Column<TopUser>[] = [
  { key: "user", header: "User", cell: (u) => <span className="font-mono text-xs break-all">{u.user}</span> },
  { key: "messages", header: "Messages", align: "right", cell: (u) => u.messages },
  { key: "days", header: "Days", align: "right", cell: (u) => u.activeDays },
  {
    key: "last",
    header: "Last message",
    align: "right",
    className: "whitespace-nowrap text-slate-500",
    cell: (u) => formatWhen(u.lastAt),
  },
];

export default function BotUsagePage() {
  const { adminProfile } = useAuthStore();
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
      <AdminPage
        eyebrow="WHATSAPP BOT"
        title="Bot Usage"
        subtitle="Who messages the WhatsApp bot, and how much"
        actions={
          isSuperAdmin && (
            <IconButton label="Refresh" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </IconButton>
          )
        }
      >
        {!isSuperAdmin ? (
          <Panel>
            <EmptyState title="This section is available to the super admin only." />
          </Panel>
        ) : (
          <>
            {/* Filters */}
            <Panel>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
                      aria-pressed={preset === value}
                      className={
                        preset === value
                          ? "inline-flex min-h-[40px] items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                          : "glass-button"
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
                    <label className="min-w-0 text-xs text-slate-500">
                      From
                      <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                        className={`${GLASS_INPUT} mt-1 block sm:w-44`} />
                    </label>
                    <label className="min-w-0 text-xs text-slate-500">
                      To
                      <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                        className={`${GLASS_INPUT} mt-1 block sm:w-44`} />
                    </label>
                    <button onClick={load} className="glass-primary col-span-2 sm:col-span-1">
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </Panel>

            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700 break-words">{error}</div>}
            {!report && !error && (
              <Panel>
                <EmptyState title="Loading…" />
              </Panel>
            )}

            {report && m && c && (
              <>
                <p className="text-xs text-slate-500">
                  {rangeLabel} (UTC).{" "}
                  {m.recordingSince
                    ? `Message counts are recorded from ${m.recordingSince}; earlier days show none.`
                    : "Message counts haven't started yet: they begin once the updated bot is deployed."}
                </p>

                {/* Messages */}
                <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Kpi label="Active users" value={m.activeUsers} note="Sent at least one message" tone="green" />
                  <Kpi label="Messages" value={m.messages} tone="blue" />
                  <Kpi label="Average users per day" value={m.averageUsersPerDay} note="Quiet days count as zero" tone="teal" />
                </div>
                <SpreadRow title="Messages per user" spread={m.perUser} unit="msgs" />

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <Panel title="By day">
                    {m.daily.length === 0 ? (
                      <p className="text-sm text-slate-400">No messages in this range.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-96 overflow-y-auto">
                        {m.daily.map((d) => (
                          <div key={d.day} className="flex items-center gap-2 text-xs sm:gap-3">
                            <span className="w-[4.5rem] shrink-0 text-slate-500 sm:w-20">{d.day}</span>
                            <div className="h-4 min-w-0 flex-1 rounded bg-white/70">
                              <div className="h-4 rounded bg-emerald-500" style={{ width: `${(d.messages / busiestDay) * 100}%` }} />
                            </div>
                            <span className="shrink-0 whitespace-nowrap text-right text-slate-700 sm:w-28">
                              {d.users} users · {d.messages} msgs
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title="Most active users" flush>
                    {m.topUsers.length === 0 ? (
                      <p className="px-4 pb-6 text-sm text-slate-400 sm:px-7">No messages in this range.</p>
                    ) : (
                      <ResponsiveTable
                        rows={m.topUsers}
                        columns={TOP_USER_COLUMNS}
                        rowKey={(u) => `${u.user}-${u.firstAt}`}
                        renderCard={(u) => (
                          <MobileCard
                            title={<span className="font-mono text-xs break-all">{u.user}</span>}
                            lines={[
                              { label: "Messages", value: u.messages },
                              { label: "Days", value: u.activeDays },
                              { label: "Last message", value: formatWhen(u.lastAt) },
                            ]}
                          />
                        )}
                      />
                    )}
                  </Panel>
                </div>

                {/* Checkouts */}
                <div>
                  <h2 className="pt-2 text-lg font-semibold text-slate-900">Bot checkouts</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Purchases started in the bot. These go back to the bot&apos;s launch, so use them for older periods.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Kpi label="Users who started a checkout" value={c.users} tone="violet" />
                  <Kpi label="Checkouts" value={c.checkouts} tone="blue" />
                  <Kpi label="Completed" value={c.completed} tone="green"
                    note={c.checkouts ? `${Math.round((c.completed / c.checkouts) * 100)}% of checkouts` : undefined} />
                </div>
                <SpreadRow title="Checkouts per user" spread={c.perUser} unit="checkouts" />
              </>
            )}
          </>
        )}
      </AdminPage>
    </ProtectedRoute>
  );
}
