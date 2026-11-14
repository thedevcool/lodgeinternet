"use client";

/**
 * The App page, for the super admin (it shows money, P6): how the mobile app
 * is doing, and the Cookie jar that scores the app's hostel guess
 * (GET /api/admin/app, backend services/cookie_jar.py).
 *
 * The Cookie jar is the owner's idea (2026-11-12): every guess the customer
 * keeps through their first purchase earns the "tiny model" a cookie; every
 * guess they correct is a lesson, and the hostel they chose teaches detection
 * the right answer. Aim: 85–95% of settled guesses right in the first month.
 * Accuracy always shows its sample size, and coverage shows how often the
 * guess dared to guess, so it can't score well by keeping quiet.
 *
 * Prototype, awaiting approval (W2). Mobile first (P10).
 */

import { useCallback, useEffect, useState } from "react";
import { Cookie, RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { AdminPage, Panel, Kpi, IconButton, ResponsiveTable, MobileCard, EmptyState, type Column } from "@/components/admin/ui";

// ── What the engine sends ────────────────────────────────────────────────────

type Scored = { cookies: number; lessons: number; oven: number; accuracy: number | null };
type BySource = Scored & { source: string };
type ByHostel = Scored & { hostel: string };
type Overview = {
  signups: { total: number; verified: number; byDay: { day: string; count: number }[]; byHostel: { hostel: string; count: number }[] };
  signIns: { activeToday: number; active7d: number; active30d: number; signIns30d: number };
  buyers: { count: number; conversion: number | null };
  money: { spentNaira: number; byHostel: { hostel: string; naira: number }[] };
  cookieJar: Scored & {
    settled: number;
    guessed: number;
    coverage: number | null;
    target: { low: number; high: number };
    bySource: BySource[];
    byHostel: ByHostel[];
    trend: { day: string; cookies: number; lessons: number }[];
    recentLessons: { at: string; guessed: string; chosen: string; source: string }[];
  };
};

// ── Small helpers ────────────────────────────────────────────────────────────

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const percent = (fraction: number | null) => (fraction === null ? "—" : `${Math.round(fraction * 100)}%`);
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SOURCE_LABELS: Record<string, string> = {
  wifi: "Known Wi-Fi",
  nearby: "Nearest hostel",
  unknown: "Not recorded",
};

/** Where accuracy stands against the 85–95% target, as a whole class string (F2). */
function accuracyTone(accuracy: number | null, low: number): "green" | "orange" | "red" | "slate" {
  if (accuracy === null) return "slate";
  if (accuracy >= low) return "green";
  return accuracy >= 0.6 ? "orange" : "red";
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** Accuracy as a bar, with the 85–95% target band marked on it. */
function TargetBar({ accuracy, low, high }: { accuracy: number | null; low: number; high: number }) {
  const value = accuracy ?? 0;
  return (
    <div className="space-y-1.5">
      <div className="relative h-3 rounded-full bg-white/70">
        <div className="absolute inset-y-0 rounded-full bg-emerald-200/80" style={{ left: `${low * 100}%`, width: `${(high - low) * 100}%` }} />
        <div
          className={accuracy !== null && accuracy >= low ? "h-3 rounded-full bg-emerald-500" : "h-3 rounded-full bg-amber-500"}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>0%</span>
        <span>Target {Math.round(low * 100)}–{Math.round(high * 100)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/** Cookies and lessons per day: cookies grow up, lessons hang below. */
function Trend({ days }: { days: Overview["cookieJar"]["trend"] }) {
  const tallest = Math.max(1, ...days.map((d) => Math.max(d.cookies, d.lessons)));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {days.map((d) => (
          <div key={d.day} className="flex min-w-0 flex-1 flex-col justify-end" title={`${shortDay(d.day)}: ${d.cookies} cookies, ${d.lessons} lessons`}>
            <div className="w-full rounded-t bg-amber-400" style={{ height: `${(d.cookies / tallest) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex h-10 items-start gap-[3px] border-t border-slate-200">
        {days.map((d) => (
          <div key={d.day} className="min-w-0 flex-1">
            <div className="w-full rounded-b bg-slate-300" style={{ height: `${(d.lessons / tallest) * 40}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{days[0] ? shortDay(days[0].day) : ""}</span>
        <span>🍪 cookies · ▬ lessons</span>
        <span>{days.length ? shortDay(days[days.length - 1].day) : ""}</span>
      </div>
    </div>
  );
}

/** A column chart of a simple count per day (sign-ups). */
function DailyBars({ days }: { days: { day: string; count: number }[] }) {
  const tallest = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {days.map((d) => (
          <div key={d.day} className="min-w-0 flex-1" title={`${shortDay(d.day)}: ${d.count}`}>
            <div className="w-full rounded-t bg-blue-500" style={{ height: `${(d.count / tallest) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{days[0] ? shortDay(days[0].day) : ""}</span>
        <span>{days.length ? shortDay(days[days.length - 1].day) : ""}</span>
      </div>
    </div>
  );
}

const scoreColumns = <T extends Scored>(name: (row: T) => string, header: string): Column<T>[] => [
  { key: "name", header, cell: (r) => <span className="font-medium text-slate-800">{name(r)}</span> },
  { key: "cookies", header: "🍪", align: "right", cell: (r) => r.cookies },
  { key: "lessons", header: "Lessons", align: "right", cell: (r) => r.lessons },
  { key: "oven", header: "In the oven", align: "right", cell: (r) => r.oven },
  { key: "accuracy", header: "Right", align: "right", cell: (r) => `${percent(r.accuracy)} of ${r.cookies + r.lessons}` },
];

function ScoreCard<T extends Scored>({ row, name }: { row: T; name: string }) {
  return (
    <MobileCard
      title={name}
      lines={[
        { label: "Cookies", value: `🍪 ${row.cookies}` },
        { label: "Lessons", value: row.lessons },
        { label: "In the oven", value: row.oven },
        { label: "Right", value: `${percent(row.accuracy)} of ${row.cookies + row.lessons}` },
      ]}
    />
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function AppPage() {
  const { adminProfile } = useAuthStore();
  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/app");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load the App page");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the App page");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, load]);

  const jar = data?.cookieJar;

  return (
    <ProtectedRoute requireSuperAdmin>
      <AdminPage
        eyebrow="MOBILE APP"
        title="App"
        subtitle="Sign-ups, sign-ins and money from the app, and the Cookie jar"
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
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700 break-words">
            {error}{" "}
            <button onClick={load} className="glass-link">Try again</button>
          </div>
        ) : !data || !jar ? (
          <div className="space-y-3">
            <div className="ui-skeleton h-36 rounded-[22px]" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="ui-skeleton h-24 rounded-[20px]" />)}
            </div>
          </div>
        ) : (
          <>
            {/* ── The Cookie jar ── */}
            <section className="rounded-[24px] bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-[0_18px_60px_rgba(31,41,55,0.09)] ring-1 ring-amber-100 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-white shadow-sm">
                  <Cookie className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cookie jar</p>
                  <h2 className="text-xl font-bold text-slate-900">
                    🍪 {jar.cookies} {jar.cookies === 1 ? "cookie" : "cookies"}
                  </h2>
                  <p className="text-sm text-slate-600">
                    The hostel guess was right {percent(jar.accuracy)} of the time, over {jar.settled} settled{" "}
                    {jar.settled === 1 ? "guess" : "guesses"}. {jar.oven} more {jar.oven === 1 ? "is" : "are"} in the oven, waiting for a first purchase.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <TargetBar accuracy={jar.accuracy} low={jar.target.low} high={jar.target.high} />
              </div>
              {jar.settled < 20 ? (
                <p className="mt-2 text-xs text-amber-800">
                  Early days: with fewer than 20 settled guesses the percentage swings a lot. Read it with the count beside it.
                </p>
              ) : null}
            </section>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Accuracy" value={percent(jar.accuracy)} note={`${jar.cookies} of ${jar.settled} settled`} tone={accuracyTone(jar.accuracy, jar.target.low)} />
              <Kpi label="Coverage" value={percent(jar.coverage)} note={`Guessed for ${jar.guessed} of ${data.signups.total} sign-ups`} tone="blue" />
              <Kpi label="Lessons" value={jar.lessons} note="Guesses customers corrected" tone="slate" />
              <Kpi label="In the oven" value={jar.oven} note="Kept, no purchase yet" tone="orange" />
            </div>

            <Panel title="Cookies and lessons, last 30 days">
              <Trend days={jar.trend} />
            </Panel>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="How it guessed" flush>
                {jar.bySource.length === 0 ? (
                  <p className="px-4 pb-6 text-sm text-slate-400 sm:px-7">No guesses yet.</p>
                ) : (
                  <ResponsiveTable
                    rows={jar.bySource}
                    columns={scoreColumns<BySource>((r) => SOURCE_LABELS[r.source] ?? r.source, "Method")}
                    rowKey={(r) => r.source}
                    renderCard={(r) => <ScoreCard row={r} name={SOURCE_LABELS[r.source] ?? r.source} />}
                  />
                )}
              </Panel>
              <Panel title="Where the cookies come from" flush>
                {jar.byHostel.length === 0 ? (
                  <p className="px-4 pb-6 text-sm text-slate-400 sm:px-7">No guesses yet.</p>
                ) : (
                  <ResponsiveTable
                    rows={jar.byHostel}
                    columns={scoreColumns<ByHostel>((r) => r.hostel, "Hostel we guessed")}
                    rowKey={(r) => r.hostel}
                    renderCard={(r) => <ScoreCard row={r} name={r.hostel} />}
                  />
                )}
              </Panel>
            </div>

            <Panel title="Recent lessons">
              {jar.recentLessons.length === 0 ? (
                <p className="text-sm text-slate-400">No corrections yet. Every guess so far has been kept.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {jar.recentLessons.map((l) => (
                    <li key={`${l.at}-${l.guessed}-${l.chosen}`} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-slate-800">
                        Guessed <strong>{l.guessed}</strong>, it was <strong>{l.chosen}</strong>
                      </span>
                      <span className="text-xs text-slate-500">{SOURCE_LABELS[l.source] ?? l.source} · {when(l.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* ── The app ── */}
            <h2 className="pt-2 text-lg font-semibold text-slate-900">The app</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Sign-ups" value={data.signups.total} note={`${data.signups.verified} verified`} tone="blue" />
              <Kpi label="Active this week" value={data.signIns.active7d} note={`${data.signIns.activeToday} today · ${data.signIns.active30d} this month`} tone="teal" />
              <Kpi label="Buyers" value={data.buyers.count} note={`${percent(data.buyers.conversion)} of sign-ups`} tone="green" />
              <Kpi label="Spent" value={naira(data.money.spentNaira)} note="By app customers, all channels" tone="violet" />
            </div>

            <Panel title="Sign-ups, last 30 days">
              <DailyBars days={data.signups.byDay} />
              <p className="mt-2 text-xs text-slate-500">{data.signIns.signIns30d} app sign-ins in the same 30 days.</p>
            </Panel>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="Sign-ups by hostel">
                {data.signups.byHostel.length === 0 ? (
                  <p className="text-sm text-slate-400">No sign-ups yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.signups.byHostel.map((h) => (
                      <li key={h.hostel} className="flex justify-between py-2 text-sm">
                        <span className="text-slate-800">{h.hostel}</span>
                        <span className="font-semibold text-slate-900">{h.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Money by hostel">
                {data.money.byHostel.length === 0 ? (
                  <p className="text-sm text-slate-400">No purchases by app customers yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.money.byHostel.map((h) => (
                      <li key={h.hostel} className="flex justify-between py-2 text-sm">
                        <span className="text-slate-800">{h.hostel}</span>
                        <span className="font-semibold text-slate-900">{naira(h.naira)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  What customers who signed up in the app have spent, on any channel: purchases don&apos;t yet record which channel they came through.
                </p>
              </Panel>
            </div>
          </>
        )}
      </AdminPage>
    </ProtectedRoute>
  );
}
