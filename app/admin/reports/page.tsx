"use client";

import { notFound } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import { AdminPage, EmptyState, GLASS_INPUT, IconButton, Kpi, Panel } from "@/components/admin/ui";
import { RefreshCw } from "lucide-react";

/**
 * /admin/reports — the owners' private money report (backend:
 * app/services/money_reports.py). Superadmin only, and hidden: anyone else
 * gets the ordinary "page not found", here and from the API, so nothing says
 * it exists. Read live from Paystack for both accounts. Phone-first.
 */

type Sum = { count: number; paid: number; fee: number; main: number; reserve: number };
type Report = {
  range: { from: string; to: string; days: number };
  generatedAt: string;
  accounts: string[];
  totals: Sum & { gap: number; average: number; feeRate: number };
  savings: { actualFees: number; cardFees: number; saved: number };
  byChannel: (Sum & { channel: string; label: string; feeRate: number; cardFee: number; saved: number; share: number })[];
  byAccount: (Sum & { account: string })[];
  byKind: (Sum & { kind: string; label: string })[];
  daily: (Sum & { date: string })[];
  payouts: { date: string; main: number; reserve: number; count: number; status: "upcoming" | "due";
    byAccount: { account: string; main: number; reserve: number }[] }[];
  settlements: { account: string; date: string; status: string; amount: number; fees: number }[];
  health: { noReserve: number; noReserveSamples: { reference: string; account: string; channel: string; paid: number }[];
    unaccounted: number };
};

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const nairaExact = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ACCOUNT = (a: string) => (a === "site" ? "Website account" : a === "bot" ? "Bot account" : a);

// Lagos dates, as YYYY-MM-DD.
const lagosToday = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

type Preset = "today" | "yesterday" | "7d" | "month" | "last-month" | "custom";
function presetRange(p: Preset, custom: { from: string; to: string }) {
  const today = lagosToday();
  const monthStart = `${today.slice(0, 8)}01`;
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: shift(today, -1), to: shift(today, -1) };
    case "7d":
      return { from: shift(today, -6), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "last-month": {
      const lastEnd = shift(monthStart, -1);
      return { from: `${lastEnd.slice(0, 8)}01`, to: lastEnd };
    }
    default:
      return custom;
  }
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "custom", label: "Custom" },
];

export default function ReportsPage() {
  // Decided only once the browser has the admin session (it isn't known
  // while the page renders on the server).
  const [mounted, setMounted] = useState(false);
  const isSuperAdmin = useAuthStore((s) => !!s.isAuthenticated && !!s.adminProfile?.isSuperAdmin);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (!isSuperAdmin) notFound();
  return <Reports />;
}

function Reports() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState({ from: shift(lagosToday(), -6), to: lagosToday() });
  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/reports/money?from=${range.from}&to=${range.to}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Could not load the report");
      setReport(data);
    } catch (err: any) {
      setError(err?.message || "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const t = report?.totals;
  const peakDay = Math.max(1, ...(report?.daily ?? []).map((d) => d.paid));
  const topMethod = report?.byChannel[0];

  return (
    <AdminPage
      eyebrow="PRIVATE"
      title="Money reports"
      subtitle={report ? `${dayLabel(report.range.from)} – ${dayLabel(report.range.to)}` : "Paystack, both accounts"}
      actions={
        <IconButton label="Refresh" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </IconButton>
      }
    >
      {/* Range: chips scroll sideways on a phone. */}
      <div className="ui-scroll-x -mx-4 px-4">
        <div className="flex min-w-max gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              className={`min-h-[38px] rounded-full px-4 text-sm font-semibold transition ${
                preset === p.value ? "bg-slate-900 text-white shadow-sm" : "border border-white/80 bg-white/70 text-slate-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" aria-label="From" className={GLASS_INPUT} value={custom.from} max={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <input type="date" aria-label="To" className={GLASS_INPUT} value={custom.to} max={lagosToday()}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
      )}

      {error && <div className="break-words rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700">{error}</div>}

      {!report || !t ? (
        <Panel>
          <EmptyState title={loading ? "Reading Paystack…" : "No report yet"} />
        </Panel>
      ) : (
        <>
          <div className="kpi-grid grid-cols-2 lg:!grid-cols-3">
            <Kpi label="Money in" value={naira(t.paid)} tone="blue" note={`${t.count} payments · avg ${naira(t.average)}`} small />
            <Kpi label="Paystack fees" value={naira(t.fee)} tone="red" note={`${t.feeRate}% of money in`} small />
            <Kpi label="To main accounts" value={naira(t.main)} tone="green" note="After fees and reserve" small />
            <Kpi label="To reserve" value={naira(t.reserve)} tone="purple" note="Split off at payment" small />
            <Kpi label="Saved vs card" value={naira(report.savings.saved)} tone="teal"
              note={`Card would have cost ${naira(report.savings.cardFees)}`} small />
            <Kpi label="Most used" value={topMethod ? topMethod.label : "—"} tone="orange"
              note={topMethod ? `${topMethod.share}% of payments` : undefined} small />
          </div>

          <Panel eyebrow="WHEN IT LANDS" title="Expected payouts">
            <p className="text-xs text-slate-500">
              Paystack pays each day&apos;s money on the next weekday (public holidays push it later — compare with
              Paystack&apos;s own list below).
            </p>
            {report.payouts.length === 0 ? (
              <EmptyState title="Nothing to pay out in this range" />
            ) : (
              <ul className="mt-2 divide-y divide-slate-200/60">
                {report.payouts.map((p) => (
                  <li key={p.date} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{dayLabel(p.date)}</p>
                        <p className="text-xs text-slate-500">
                          {p.count} payments ·{" "}
                          <span className={p.status === "upcoming" ? "text-blue-700" : "text-slate-500"}>
                            {p.status === "upcoming" ? "upcoming" : "due"}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-700">{naira(p.main)}</p>
                        <p className="text-xs text-purple-700">+ {naira(p.reserve)} reserve</p>
                      </div>
                    </div>
                    {p.byAccount.length > 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {p.byAccount.map((a) => `${ACCOUNT(a.account)} ${naira(a.main)}`).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="HOW PEOPLE PAY" title="Payment methods">
            <ul className="divide-y divide-slate-200/60">
              {report.byChannel.map((c) => (
                <li key={c.channel} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-slate-900">{c.label}</p>
                    <p className="shrink-0 font-semibold text-slate-900">{naira(c.paid)}</p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500" style={{ width: `${c.share}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {c.count} payments ({c.share}%) · fees {naira(c.fee)} ({c.feeRate}%)
                    {c.saved > 0 && <span className="text-emerald-700"> · saved {naira(c.saved)} vs card</span>}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel eyebrow="DAY BY DAY" title="Money in per day">
            {/* Slim bars; a long range scrolls sideways inside the panel. */}
            <div className="ui-scroll-x -mx-1 px-1">
              <div className="flex h-40 items-end gap-1" style={{ minWidth: `${Math.max(report.daily.length * 14, 100)}px` }}>
                {report.daily.map((d) => (
                  <div key={d.date} className="flex h-full min-w-[10px] flex-1 flex-col items-center justify-end gap-1"
                    title={`${dayLabel(d.date)}: ${naira(d.paid)} (${d.count})`}>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-blue-500 to-purple-400"
                      style={{ height: `${(d.paid / peakDay) * 100}%`, minHeight: d.paid ? 4 : 2 }} />
                    <span className="text-[9px] text-slate-400">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
            {report.daily.length > 1 && (
              <p className="mt-2 text-xs text-slate-500">
                Best day {(() => {
                  const best = [...report.daily].sort((a, b) => b.paid - a.paid)[0];
                  return `${dayLabel(best.date)} · ${naira(best.paid)}`;
                })()}
              </p>
            )}
          </Panel>

          <Panel eyebrow="WHAT IT WAS FOR" title="Purchases and top-ups">
            <ul className="divide-y divide-slate-200/60">
              {report.byKind.map((k) => (
                <li key={k.kind} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{k.label}</p>
                    <p className="text-xs text-slate-500">{k.count} payments</p>
                  </div>
                  <p className="shrink-0 font-semibold text-slate-900">{naira(k.paid)}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel eyebrow="WHERE IT CAME IN" title="By Paystack account">
            <ul className="divide-y divide-slate-200/60">
              {report.byAccount.map((a) => (
                <li key={a.account} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-slate-900">{ACCOUNT(a.account)}</p>
                    <p className="font-semibold text-slate-900">{naira(a.paid)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {a.count} payments · fees {naira(a.fee)} · main {naira(a.main)} · reserve {naira(a.reserve)}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel eyebrow="FROM PAYSTACK" title="Settlements">
            {report.settlements.length === 0 ? (
              <EmptyState title="Paystack lists no settlements for these dates yet" />
            ) : (
              <ul className="divide-y divide-slate-200/60">
                {report.settlements.map((s, i) => (
                  <li key={`${s.account}-${s.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{s.date ? dayLabel(s.date) : "—"}</p>
                      <p className="text-xs text-slate-500">{ACCOUNT(s.account)} · {s.status || "—"}</p>
                    </div>
                    <p className="shrink-0 font-semibold text-slate-900">{naira(s.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="CHECKS" title="Split health">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-slate-700">Payments with no reserve split</span>
                <span className={`font-semibold ${report.health.noReserve ? "text-amber-700" : "text-emerald-700"}`}>
                  {report.health.noReserve}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-slate-700">Amounts that don&apos;t add up (beyond 1 kobo rounding)</span>
                <span className={`font-semibold ${report.health.unaccounted ? "text-rose-700" : "text-emerald-700"}`}>
                  {report.health.unaccounted}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>Rounding across all payments</span>
                <span>{nairaExact(t.gap)}</span>
              </li>
            </ul>
            {report.health.noReserveSamples.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {report.health.noReserveSamples.map((s) => (
                  <li key={s.reference} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{ACCOUNT(s.account)} · {s.channel}</span>
                    <span className="shrink-0">{naira(s.paid)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-center text-xs text-slate-400">
            Read from Paystack {new Date(report.generatedAt).toLocaleString()} · finished days are kept for a few hours
          </p>
        </>
      )}
    </AdminPage>
  );
}
