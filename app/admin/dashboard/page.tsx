"use client";

/**
 * Superadmin analytics overview — the landing page after admin login.
 *
 * The whole page is one `GET /api/admin/analytics` response. The backend owns
 * every metric's meaning and serves a materialised snapshot, so this file only
 * lays numbers out; it never reconstructs business state by fanning out to one
 * endpoint per controller, hostel or plan.
 *
 * The grid button in the header swaps the metrics for a tiled index of the
 * admin sections, for when you came here to go somewhere rather than to read.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  LayoutGrid,
  LineChart,
  LogOut,
  Menu,
  RefreshCw,
} from "lucide-react";
import AdminDrawer from "@/components/admin/AdminDrawer";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { apiFetch } from "@/lib/apiClient";
import { ADMIN_NAV, primeAttention } from "@/lib/adminNav";
import { useAuthStore } from "@/store/authStore";

type CountMap = Record<string, number>;

type Pool = {
  poolKey: string;
  label: string;
  controllerId?: string;
  controller?: string;
  planType?: string;
  price?: number | null;
  available?: number;
  reserved?: number;
  claimed?: number;
  usedOrExpired?: number;
  lowStock?: boolean;
  needsPrice?: boolean;
  needsMetadata?: boolean;
  sellable?: boolean;
};

type Controller = {
  id: string;
  name: string;
  hostels: number;
  plans: number;
  approvedForSale: number;
  availableCodes: number;
  reservedCodes: number;
  usedOrExpiredCodes: number;
  needsPrice: number;
  needsMetadata: number;
  disabled: number;
  lowStockPools: number;
  isActive?: boolean;
  lastSync?: { status?: string; ranAt?: string; added?: number; updated?: number };
  syncProgress?: { status?: string; percent?: number; stage?: string };
  pools?: Pool[];
};

type RecentEvent = { at: string; type: string; plan: string; hostel: string; amount: number };

type Analytics = {
  generatedAt: string;
  freshness: "live" | "cached" | "stale";
  ageSeconds?: number;
  overview: CountMap;
  attention: CountMap & { modules?: CountMap };
  catalogue: {
    plans: CountMap;
    approvedForSale: number;
    needsMetadata: number;
    needsPrice: number;
    disabled: number;
    pools: CountMap;
    standalonePlans: number;
    supersededPlans: number;
  };
  inventory: CountMap & { byStatus?: CountMap };
  pools?: Pool[];
  sales: CountMap;
  users: { total: number; verified: number };
  hostels: { total: number; controllerManaged: number; standalone: number };
  controllers: Controller[];
  bot: CountMap;
  tv: CountMap;
  emails: CountMap;
  migrations: { available?: boolean; tracked?: boolean };
  support: CountMap;
  recent?: RecentEvent[];
};

/** Conservative: the snapshot itself only rebuilds every few minutes. */
const POLL_MS = 60_000;
const VIEW_KEY = "lodge.admin.dashboardView";

const FRESHNESS_LABEL: Record<string, string> = {
  live: "Live",
  cached: "Cached",
  stale: "Stale",
};

const TONE_RAIL: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-rose-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  slate: "bg-slate-400",
};

const money = (value: number | undefined) => `₦${Math.round(value || 0).toLocaleString()}`;
const fmt = (value: number | undefined) => (value || 0).toLocaleString();
const pct = (part: number | undefined, whole: number | undefined) =>
  whole ? Math.round(((part || 0) / whole) * 100) : 0;

function Kpi({
  label,
  value,
  note,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="kpi-card">
      <span className={`kpi-rail ${TONE_RAIL[tone] || TONE_RAIL.blue}`} />
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {note && <p className="kpi-note">{note}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  href,
  children,
}: {
  eyebrow: string;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <Link href={href} className="glass-link">
          Manage <ChevronRight size={16} />
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Proportion bar — segments are [value, colour class] pairs. */
function Meter({ parts }: { parts: [number, string][] }) {
  const total = parts.reduce((sum, [value]) => sum + value, 0) || 1;
  return (
    <div className="meter mt-4">
      {parts.map(([value, colour], index) => (
        <span key={index} className={colour} style={{ width: `${(value / total) * 100}%` }} />
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { logout, adminProfile, canAccess } = useAuthStore();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [view, setView] = useState<"analytics" | "tiles">("analytics");

  // Remember the last view, so someone who prefers the launcher gets it back.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "tiles" || saved === "analytics") setView(saved);
    } catch {
      /* private browsing — the default view is fine */
    }
  }, []);

  const chooseView = (next: "analytics" | "tiles") => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* nothing to do; the choice just won't persist */
    }
  };

  // One request at a time. A newer refresh aborts the older one so a slow
  // response can never land on top of a fresher one.
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (mode: "read" | "rebuild" = "read") => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    if (mode === "rebuild") setRebuilding(true);
    else setLoading(true);

    try {
      const response = await apiFetch(
        mode === "rebuild" ? "/api/admin/analytics/rebuild" : "/api/admin/analytics",
        { method: mode === "rebuild" ? "POST" : "GET", signal: controller.signal },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Analytics could not be loaded");
      setData(body);
      primeAttention(body?.attention?.modules);
      setError("");
    } catch (err) {
      if (controller.signal.aborted) return;
      // Deliberately leaves `data` alone: a transient failure must not blank
      // out metrics that were valid a moment ago.
      setError(err instanceof Error ? err.message : "Analytics could not be loaded");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      setLoading(false);
      setRebuilding(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      inFlight.current?.abort();
    };
  }, [load]);

  const overview = data?.overview ?? {};
  const attention = data?.attention ?? {};
  const catalogue = data?.catalogue;
  const pools = catalogue?.pools ?? {};
  const inventory = data?.inventory ?? {};
  const sales = data?.sales ?? {};
  const bot = data?.bot ?? {};
  const tv = data?.tv ?? {};
  const emails = data?.emails ?? {};
  const support = data?.support ?? {};
  const freshness = data?.freshness ?? "stale";
  const badges = data?.attention?.modules ?? {};
  const tiles = ADMIN_NAV.filter((item) =>
    item.superAdminOnly ? adminProfile?.isSuperAdmin : canAccess(item.module),
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen analytics-shell">
        <header className="glass-header">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" onClick={() => setDrawer(true)} className="glass-icon">
              <Menu size={20} />
            </button>
            <Logo variant="dark" />
            <div>
              <p className="eyebrow">SUPERADMIN CONTROL CENTRE</p>
              <h1 className="text-xl font-semibold sm:text-2xl">
                {view === "analytics" ? "Analytics overview" : "All sections"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={freshness === "live" ? "live-pill" : "live-pill bg-amber-100/80 text-amber-700"}
              title={data ? `Snapshot age ${data.ageSeconds ?? 0}s` : undefined}
            >
              <span className={freshness === "live" ? "live-dot" : "live-dot bg-amber-500"} />
              {data ? FRESHNESS_LABEL[freshness] : "Waiting"}
            </span>

            {view === "analytics" && (
              <>
                <button onClick={() => void load()} disabled={loading} className="glass-button hidden sm:inline-flex">
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
                <button
                  onClick={() => void load("rebuild")}
                  disabled={rebuilding}
                  className="glass-button hidden md:inline-flex"
                  title="Rescan Firestore and rewrite the snapshot"
                >
                  <Database size={16} />
                  {rebuilding ? "Rebuilding…" : "Rebuild"}
                </button>
              </>
            )}

            {/* Metrics ⇄ section tiles */}
            <div className="segmented" role="group" aria-label="Dashboard view">
              <button
                className="segmented-item"
                aria-pressed={view === "analytics"}
                aria-label="Show analytics"
                title="Show analytics"
                onClick={() => chooseView("analytics")}
              >
                <LineChart size={17} />
              </button>
              <button
                className="segmented-item"
                aria-pressed={view === "tiles"}
                aria-label="Show section tiles"
                title="Hide analytics and show the sections as tiles"
                onClick={() => chooseView("tiles")}
              >
                <LayoutGrid size={17} />
              </button>
            </div>

            <button
              onClick={() => {
                logout();
                window.location.href = "/admin/login";
              }}
              className="glass-button hidden lg:inline-flex"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1900px] space-y-5 px-4 py-6 sm:px-8 lg:px-12">
          {error && (
            <div className="glass-alert">
              <AlertTriangle size={18} />
              <span>
                {error}
                {data && ` · showing the snapshot from ${new Date(data.generatedAt).toLocaleTimeString()}`}
              </span>
              <button onClick={() => void load()} className="ml-auto underline">
                Retry
              </button>
              <button onClick={() => void load("rebuild")} className="underline">
                Rebuild
              </button>
            </div>
          )}

          {view === "tiles" ? (
            <>
              <section className="glass-hero">
                <div>
                  <p className="eyebrow">LODGE INTERNET · CONTROL CENTRE</p>
                  <h2 className="text-3xl font-semibold sm:text-4xl">Where do you want to go?</h2>
                  <p className="mt-3 max-w-2xl opacity-70">
                    Every section you can reach, with anything waiting for you marked.
                  </p>
                </div>
                <div className="text-right text-sm opacity-60">
                  {fmt(attention.total)} items need attention
                  <br />
                  {adminProfile?.username}
                </div>
              </section>

              <div className="tile-grid">
                {tiles.map(({ label, href, icon: Icon, module, description }) => (
                  <Link key={href} href={href} className="tile">
                    <span className="tile-icon">
                      <Icon size={22} />
                    </span>
                    <span className="min-w-0">
                      <span className="tile-title">{label}</span>
                      <span className="tile-desc block">{description}</span>
                    </span>
                    {(badges[module] || 0) > 0 && <span className="tile-badge">{fmt(badges[module])}</span>}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <section className="glass-hero">
                <div>
                  <p className="eyebrow">LODGE INTERNET · LIVE OPERATIONS</p>
                  <h2 className="text-3xl font-semibold sm:text-5xl">
                    Everything important,
                    <br />
                    at a glance.
                  </h2>
                  <p className="mt-4 max-w-2xl opacity-70">
                    Customers, hostels, controllers, catalogue, inventory, payments, bot, TV,
                    communications and maintenance.
                  </p>
                </div>
                <div className="text-right text-sm opacity-60">
                  {data ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : "Preparing metrics"}
                  <br />
                  {adminProfile?.username}
                </div>
              </section>

              {!error && freshness === "stale" && data && (
                <div className="glass-alert">
                  <AlertTriangle size={18} />
                  <span>
                    These figures are {Math.round((data.ageSeconds ?? 0) / 60)} minutes old. A refresh
                    is running in the background.
                  </span>
                  <button onClick={() => void load("rebuild")} className="ml-auto underline">
                    Rebuild now
                  </button>
                </div>
              )}

              {/* ── Headline KPIs ─────────────────────────────────────────── */}
              <section className="kpi-grid">
                <Kpi label="Revenue · all time" value={money(sales.revenue)} tone="green"
                     note={`${fmt(sales.dataPurchases)} data · ${fmt(sales.tvSubscriptions)} TV`} />
                <Kpi label="Revenue · 30 days" value={money(sales.revenueLast30Days)} tone="green"
                     note={`7d ${money(sales.revenueLast7Days)}`} />
                <Kpi label="Revenue · today" value={money(sales.revenueToday)} tone="green" />
                <Kpi label="Available codes" value={fmt(inventory.available)} tone="violet"
                     note={`${pct(inventory.available, inventory.total)}% of ${fmt(inventory.total)} vouchers`} />
                <Kpi label="Sellable pools" value={fmt(pools.sellable)} tone="blue"
                     note={`of ${fmt(pools.total)} controller pools`} />
                <Kpi label="Pools needing a price" value={fmt(catalogue?.needsPrice)} tone="orange"
                     note={pools.needsSetup ? `${fmt(pools.needsSetup)} need setup in total` : "All priced"} />
                <Kpi label="Low-stock pools" value={fmt(inventory.lowStockPools)} tone="red"
                     note={`threshold ${fmt(inventory.lowStockThreshold)} · ${fmt(inventory.emptyPools)} empty`} />
                <Kpi label="Customers" value={fmt(overview.users)} tone="purple"
                     note={`${fmt(data?.hostels.total)} hostels · ${fmt(overview.controllers)} controllers`} />
              </section>

              {/* ── Attention ─────────────────────────────────────────────── */}
              <Section
                eyebrow={`ATTENTION QUEUE · ${fmt(attention.total)} OPEN`}
                title="Needs your attention"
                href="/admin/data-codes"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  <Kpi label="Needs price" value={fmt(attention.needsPrice)} tone="orange" />
                  <Kpi label="Needs metadata" value={fmt(attention.needsMetadata)} tone="orange" />
                  <Kpi label="Low-stock pools" value={fmt(attention.lowStockPools)} tone="red" />
                  <Kpi label="Pending payments" value={fmt(attention.pendingPayments)} tone="red" />
                  <Kpi label="Controllers offline" value={fmt(attention.controllersOffline)} tone="red" />
                  <Kpi label="Failed syncs" value={fmt(attention.failedSyncs)} tone="orange" />
                  <Kpi label="Open feedback" value={fmt(attention.openFeedback)} tone="purple" />
                  <Kpi label="Waitlist" value={fmt(attention.waitlist)} tone="blue" />
                  <Kpi label="Disabled pools" value={fmt(attention.disabled)} tone="slate" />
                  <Kpi label="Unapproved pools" value={fmt(pools.unapproved)} tone="slate" />
                </div>
              </Section>

              {/* ── Catalogue + inventory ─────────────────────────────────── */}
              <div className="grid gap-5 xl:grid-cols-2">
                <Section eyebrow="CATALOGUE" title="Pools, plans & setup" href="/admin/data-codes">
                  <div className="stat-row">
                    <Stat label="Controller pools" value={fmt(pools.total)} />
                    <Stat label="Sellable" value={fmt(pools.sellable)} />
                    <Stat label="Needs price" value={fmt(pools.needsPrice)} />
                    <Stat label="Needs metadata" value={fmt(pools.needsMetadata)} />
                  </div>
                  <Meter
                    parts={[
                      [pools.sellable || 0, "bg-emerald-500"],
                      [pools.needsPrice || 0, "bg-amber-500"],
                      [Math.max(0, (pools.total || 0) - (pools.sellable || 0) - (pools.needsPrice || 0)), "bg-slate-300"],
                    ]}
                  />
                  <div className="stat-row mt-4">
                    <Stat label="Device plans" value={fmt(catalogue?.plans?.device)} />
                    <Stat label="Unlimited" value={fmt(catalogue?.plans?.unlimited)} />
                    <Stat label="TV plans" value={fmt(catalogue?.plans?.tv)} />
                    <Stat label="Standalone" value={fmt(catalogue?.standalonePlans)} />
                  </div>
                  {(catalogue?.supersededPlans || 0) > 0 && (
                    <p className="mt-4 text-xs opacity-60">
                      {fmt(catalogue?.supersededPlans)} older per-hostel plans are superseded by a
                      controller and are no longer offered.
                    </p>
                  )}
                </Section>

                <Section eyebrow="CODE INVENTORY" title="Voucher stock" href="/admin/data-codes">
                  <div className="stat-row">
                    <Stat label="Available" value={fmt(inventory.available)} />
                    <Stat label="Reserved" value={fmt(inventory.reserved)} />
                    <Stat label="In use" value={fmt(inventory.claimed)} />
                    <Stat label="Spent / expired" value={fmt(inventory.usedOrExpired)} />
                  </div>
                  <Meter
                    parts={[
                      [inventory.available || 0, "bg-emerald-500"],
                      [inventory.reserved || 0, "bg-amber-500"],
                      [inventory.claimed || 0, "bg-violet-500"],
                      [inventory.usedOrExpired || 0, "bg-slate-300"],
                    ]}
                  />
                  <p className="mt-4 text-xs opacity-60">
                    Pools needing attention first · threshold {fmt(inventory.lowStockThreshold)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {(data?.pools || []).slice(0, 14).map((pool) => (
                      <span
                        className={
                          pool.needsPrice || pool.needsMetadata
                            ? "slate-chip"
                            : pool.lowStock
                              ? "warning-chip"
                              : "status-chip"
                        }
                        key={`${pool.controllerId}:${pool.poolKey}`}
                        title={`${pool.controller} · ${pool.poolKey}`}
                      >
                        {pool.label}:{" "}
                        {pool.needsPrice ? "no price" : pool.needsMetadata ? "setup" : `${fmt(pool.available)} left`}
                      </span>
                    ))}
                  </div>
                </Section>
              </div>

              {/* ── Controllers ───────────────────────────────────────────── */}
              <Section eyebrow="CONTROLLERS · OMADA" title="Network health" href="/admin/controllers">
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {(data?.controllers || []).map((controller) => (
                    <Link href="/admin/controllers" key={controller.id} className="glass-controller">
                      <div className="flex items-center justify-between gap-2">
                        <b>{controller.name}</b>
                        <span className={controller.lastSync?.status === "error" ? "warning-chip" : "status-chip"}>
                          {controller.lastSync?.status || "No sync"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm opacity-60">
                        {controller.hostels} hostels · {controller.plans} pools ·{" "}
                        {controller.approvedForSale} sellable
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-white/70 py-2">
                          <div className="text-base font-semibold">{fmt(controller.availableCodes)}</div>
                          <div className="opacity-60">available</div>
                        </div>
                        <div className="rounded-xl bg-white/70 py-2">
                          <div className="text-base font-semibold">{fmt(controller.needsPrice)}</div>
                          <div className="opacity-60">need price</div>
                        </div>
                        <div className="rounded-xl bg-white/70 py-2">
                          <div className="text-base font-semibold">{fmt(controller.lowStockPools)}</div>
                          <div className="opacity-60">low stock</div>
                        </div>
                      </div>
                      {controller.syncProgress?.status === "running" && (
                        <span className="mt-3 inline-block warning-chip text-xs">
                          {controller.syncProgress.percent || 0}% syncing
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </Section>

              {/* ── Commerce ──────────────────────────────────────────────── */}
              <div className="grid gap-5 xl:grid-cols-2">
                <Section eyebrow="SALES & PAYMENTS" title="Commercial activity" href="/admin/transactions">
                  <div className="stat-row">
                    <Stat label="Data purchases" value={fmt(sales.dataPurchases)} />
                    <Stat label="TV sales" value={fmt(sales.tvSubscriptions)} />
                    <Stat label="Completed payments" value={fmt(sales.completedPayments)} />
                    <Stat label="Pending payments" value={fmt(sales.pendingPayments)} />
                  </div>
                  <div className="stat-row mt-3">
                    <Stat label="Data revenue" value={money(sales.dataRevenue)} />
                    <Stat label="TV revenue" value={money(sales.tvRevenue)} />
                    <Stat label="Last 7 days" value={money(sales.revenueLast7Days)} />
                    <Stat label="Today" value={money(sales.revenueToday)} />
                  </div>
                </Section>

                <Section eyebrow="WHATSAPP BOT" title="Bot operations" href="/admin/bot-analytics">
                  <div className="stat-row">
                    <Stat label="Checkouts" value={fmt(bot.checkouts)} />
                    <Stat label="Completed" value={fmt(bot.completed)} />
                    <Stat label="Cancelled" value={fmt(bot.cancelled)} />
                    <Stat label="Part-paid" value={fmt(bot.partiallyPaid)} />
                  </div>
                  <div className="stat-row mt-3">
                    <Stat label="Bank transfer" value={fmt(bot.dvaPayments)} />
                    <Stat label="Card fallback" value={fmt(bot.cardFallbacks)} />
                    <Stat
                      label="Completion"
                      value={`${pct(bot.completed, bot.checkouts)}%`}
                    />
                    <Stat label="Status" value={bot.available ? "Online" : "—"} />
                  </div>
                </Section>
              </div>

              {/* ── People, TV, comms ─────────────────────────────────────── */}
              <div className="grid gap-5 xl:grid-cols-3">
                <Section eyebrow="PEOPLE & PLACES" title="Users and hostels" href="/admin/users">
                  <div className="stat-row grid-cols-2 sm:grid-cols-2">
                    <Stat label="Users" value={fmt(data?.users.total)} />
                    <Stat label="Verified" value={fmt(data?.users.verified)} />
                    <Stat label="Hostels" value={fmt(data?.hostels.total)} />
                    <Stat label="On a controller" value={fmt(data?.hostels.controllerManaged)} />
                  </div>
                </Section>

                <Section eyebrow="TELEVISION" title="TV operations" href="/admin/tv-users">
                  <div className="stat-row grid-cols-2 sm:grid-cols-2">
                    <Stat label="Subscriptions" value={fmt(tv.subscriptions)} />
                    <Stat label="Active" value={fmt(tv.active)} />
                    <Stat label="Pending activation" value={fmt(tv.pending)} />
                    <Stat label="Expired" value={fmt(tv.expired)} />
                  </div>
                </Section>

                <Section eyebrow="COMMS & SUPPORT" title="Email, waitlist, feedback" href="/admin/emails">
                  <div className="stat-row grid-cols-2 sm:grid-cols-2">
                    <Stat label="Controllers offline" value={fmt(emails.operationalAlerts)} />
                    <Stat label="Email drafts" value={fmt(emails.drafts)} />
                    <Stat label="Waitlist" value={fmt(support.waitlist)} />
                    <Stat label="Open feedback" value={fmt(support.openFeedback)} />
                  </div>
                </Section>
              </div>

              {/* ── Recent ────────────────────────────────────────────────── */}
              <Section eyebrow="RECENT ACTIVITY" title="Latest purchases" href="/admin/transactions">
                {data?.recent?.length ? (
                  <ul className="space-y-2 text-sm">
                    {data.recent.map((event) => (
                      <li
                        key={`${event.at}-${event.plan}-${event.amount}`}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3 py-2"
                      >
                        <span className="truncate">
                          {event.plan}
                          {event.hostel && <span className="opacity-60"> · {event.hostel}</span>}
                        </span>
                        <span className="shrink-0 font-semibold">{money(event.amount)}</span>
                        <span className="shrink-0 text-xs opacity-50">
                          {new Date(event.at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm opacity-60">No purchases recorded yet.</p>
                )}
              </Section>
            </>
          )}
        </main>

        <AdminDrawer open={drawer} onClose={() => setDrawer(false)} attention={badges} />
      </div>
    </ProtectedRoute>
  );
}
