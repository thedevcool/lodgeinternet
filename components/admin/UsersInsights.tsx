"use client";

/**
 * The Users page's Insights tab (backend: app/routers/admin_users_analytics.py).
 * Phone-first: one column of panels, each a short list or a small bar chart,
 * nothing that needs a wide screen.
 */

import { EmptyState, Panel } from "@/components/admin/ui";

export type UsersAnalytics = {
  totals: {
    users: number;
    verified: number;
    buyers: number;
    newThisMonth: number;
    newLastMonth: number;
    averagePerMonth: number;
  };
  perHostel: { hostel: string; users: number; verified: number; buyers: number }[];
  perController: { controller: string; users: number }[] | null;
  monthly: { month: string; newUsers: number }[];
  recentPurchases: { email: string; name: string; plan: string; price: number; hostel: string; kind: string; at: string | null }[];
  topBuyers: { email: string; name: string; hostel: string; purchases: number; spent: number; lastPurchaseAt: string | null }[];
  onlineNow: number | null;
  onlineWindowMinutes: number;
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

function ago(iso: string | null): string {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

/** A labelled horizontal bar: label left, value right, bar underneath. */
function BarRow({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-slate-800">{label}</span>
        <span className="shrink-0 font-semibold text-slate-900">{value.toLocaleString()}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70">
        <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </li>
  );
}

export default function UsersInsights({ data }: { data: UsersAnalytics | null }) {
  if (!data) {
    return (
      <Panel>
        <EmptyState title="Loading insights…" />
      </Panel>
    );
  }

  const peak = Math.max(1, ...data.monthly.map((m) => m.newUsers));
  const hostelMax = Math.max(1, ...data.perHostel.map((h) => h.users));
  const ctrlMax = Math.max(1, ...(data.perController ?? []).map((c) => c.users));

  return (
    <div className="space-y-4">
      <Panel eyebrow="LAST 12 MONTHS" title="New users per month">
        <p className="text-sm text-slate-500">
          Average <span className="font-semibold text-slate-900">{data.totals.averagePerMonth}</span> a month ·{" "}
          {data.totals.newThisMonth} this month, {data.totals.newLastMonth} last month
        </p>
        {/* 12 slim columns fit a 360px phone without scrolling. */}
        <div className="mt-4 flex h-36 items-end gap-1.5">
          {data.monthly.map((m) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold text-slate-500">{m.newUsers || ""}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-blue-500 to-purple-400"
                style={{ height: `${(m.newUsers / peak) * 100}%`, minHeight: m.newUsers ? 4 : 2 }}
                title={`${m.month}: ${m.newUsers}`}
              />
              <span className="text-[10px] text-slate-400">{monthLabel(m.month).slice(0, 1)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="WHERE THEY ARE" title="Users per hostel">
        {data.perHostel.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <ul className="divide-y divide-slate-200/50">
            {data.perHostel.map((h) => (
              <BarRow
                key={h.hostel}
                label={h.hostel}
                value={h.users}
                max={hostelMax}
                note={`${h.verified} verified · ${h.buyers} bought a plan`}
              />
            ))}
          </ul>
        )}
      </Panel>

      {data.perController && (
        <Panel eyebrow="NETWORKS" title="Users per controller">
          <ul className="divide-y divide-slate-200/50">
            {data.perController.map((c) => (
              <BarRow key={c.controller} label={c.controller} value={c.users} max={ctrlMax} />
            ))}
          </ul>
        </Panel>
      )}

      <Panel eyebrow="LATEST" title="Recent purchases">
        {data.recentPurchases.length === 0 ? (
          <EmptyState title="No purchases yet" />
        ) : (
          <ul className="divide-y divide-slate-200/50">
            {data.recentPurchases.map((p, i) => (
              <li key={`${p.email}-${p.at}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{p.name || p.email || "—"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.plan} · {p.hostel || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-900">{naira(p.price)}</p>
                  <p className="text-xs text-slate-400">{ago(p.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel eyebrow="ALL TIME" title="Top buyers">
        {data.topBuyers.length === 0 ? (
          <EmptyState title="No purchases yet" />
        ) : (
          <ol className="divide-y divide-slate-200/50">
            {data.topBuyers.map((b, i) => (
              <li key={b.email} className="flex items-center gap-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{b.name || b.email}</p>
                  <p className="truncate text-xs text-slate-500">
                    {b.hostel || "—"} · last {ago(b.lastPurchaseAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-900">{b.purchases === 1 ? "1 plan" : `${b.purchases} plans`}</p>
                  <p className="text-xs text-slate-500">{naira(b.spent)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
