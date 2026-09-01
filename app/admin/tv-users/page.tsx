"use client";

/**
 * TV subscriptions — the operator's view of who is watching and who is not.
 *
 * Subscriptions activate themselves at purchase now: the device goes onto its
 * controller's allow list and the clock starts. So this page is no longer a
 * queue of things to approve. What it is for is seeing where the records and
 * the controllers *disagree* — devices on a controller with nobody paying for
 * them, and paying customers whose device never made it onto a list.
 *
 * All the reconciling happens in `/api/admin/tv-devices`. This file renders.
 */

import { apiFetch } from "@/lib/apiClient";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  RefreshCw,
  Router,
  Trash2,
  Tv,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import ConfirmationModal from "@/components/ConfirmationModal";
import type { Hostel, TVSubscription } from "@/types";

interface TVPlanOption {
  id: string;
  name: string;
  duration: number;
  price: number;
}

type DeviceRow = {
  macAddress: string;
  label: string;
  ruleId?: number;
  subscriptionId?: string | null;
  email?: string | null;
  hostel?: string | null;
  planName?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  unmatched: boolean;
};

type ControllerRow = {
  controller: string;
  allow: DeviceRow[];
  deny: DeviceRow[];
  allowGroupName?: string | null;
  denyGroupName?: string | null;
  // Entries with no subscription behind them and no `Name(Hostel)` label —
  // staff devices, one-off manual grants — filtered out of `allow`/`deny`
  // above rather than shown as clutter. Counted, not listed.
  allowHiddenCount?: number;
  denyHiddenCount?: number;
  error?: string | null;
};

type DeviceReport = {
  controllers: ControllerRow[];
  missingFromControllers: {
    subscriptionId: string;
    email?: string;
    hostel?: string;
    planName?: string;
    macAddress: string;
    expiresAt?: string | null;
  }[];
};

type Tab = "active" | "expiring" | "expired" | "devices" | "attention";

const EXPIRING_WITHIN_DAYS = 7;

const money = (value: number | undefined) => `₦${(value || 0).toLocaleString()}`;

const daysLeft = (expiresAt: unknown): number | null => {
  if (!expiresAt) return null;
  const time = new Date(expiresAt as string).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - Date.now()) / 86_400_000);
};

const shortDate = (value: unknown) =>
  value
    ? new Date(value as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

/** A single figure, sitting on its own tinted ground. */
function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: "blue" | "green" | "amber" | "rose" | "slate";
  icon: React.ComponentType<{ className?: string }>;
}) {
  // Written out in full: Tailwind scans source text, so a class assembled at
  // runtime is never found and the rule is purged from the stylesheet.
  const grounds = {
    blue: "bg-blue-50/80 text-blue-700 ring-blue-100",
    green: "bg-emerald-50/80 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50/80 text-amber-700 ring-amber-100",
    rose: "bg-rose-50/80 text-rose-700 ring-rose-100",
    slate: "bg-slate-50/80 text-slate-600 ring-slate-200",
  }[tone];

  return (
    <div className={`rounded-[22px] p-4 ring-1 backdrop-blur-xl sm:p-5 ${grounds}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-slate-900">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs opacity-80">{hint}</p>}
    </div>
  );
}

function StatusPill({ status, expiresAt }: { status?: string | null; expiresAt?: unknown }) {
  const left = daysLeft(expiresAt);
  const map: Record<string, { cls: string; label: string }> = {
    active: { cls: "bg-emerald-100 text-emerald-700", label: "Active" },
    extension: { cls: "bg-emerald-100 text-emerald-700", label: "Extended" },
    pending_activation: { cls: "bg-amber-100 text-amber-700", label: "Awaiting access" },
    blocked: { cls: "bg-rose-100 text-rose-700", label: "Needs attention" },
    expired: { cls: "bg-slate-200 text-slate-600", label: "Expired" },
  };
  const shown = map[status || ""] ?? map.expired;
  const soon =
    (status === "active" || status === "extension") && left !== null && left >= 0 && left <= 3;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        soon ? "bg-amber-100 text-amber-700" : shown.cls
      }`}
    >
      {soon ? (left === 0 ? "Expires today" : `${left}d left`) : shown.label}
    </span>
  );
}

export default function AdminTVUsersPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("tv-users");
  const router = useRouter();
  const { addToast } = useToast();

  const [subscriptions, setSubscriptions] = useState<TVSubscription[]>([]);
  const [devices, setDevices] = useState<DeviceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [checkingExpiry, setCheckingExpiry] = useState(false);
  const [error, setError] = useState("");

  const [tvPlans, setTvPlans] = useState<TVPlanOption[]>([]);
  const [planModal, setPlanModal] = useState<{
    subId: string;
    subName: string;
    currentPlanId: string;
  } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [updatingPlan, setUpdatingPlan] = useState(false);

  const [tvPassword, setTvPassword] = useState("");
  const [savedTvPassword, setSavedTvPassword] = useState("");
  const [tvPasswordMeta, setTvPasswordMeta] = useState<{ updatedAt?: string; updatedBy?: string }>({});
  const [savingTvPassword, setSavingTvPassword] = useState(false);
  const [showTvPassword, setShowTvPassword] = useState(false);

  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [filterHostel, setFilterHostel] = useState("all");
  const [search, setSearch] = useState("");

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const allowedHostels = useMemo(
    () =>
      !adminProfile?.hostels?.length || adminProfile.isSuperAdmin
        ? hostels
        : hostels.filter((h) => adminProfile.hostels.includes(h.id)),
    [hostels, adminProfile],
  );
  const allowedHostelNames = useMemo(
    () => new Set(allowedHostels.map((h) => h.name)),
    [allowedHostels],
  );

  // ─── Loading ──────────────────────────────────────────────────────────────

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/tv/subscriptions?isAdmin=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load subscriptions");
      setSubscriptions(data.subscriptions || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load subscriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await apiFetch("/api/admin/tv-devices");
      const data = await res.json();
      if (res.ok) setDevices(data);
    } catch {
      /* the subscription tabs still work without the controller view */
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  const fetchTVPlans = useCallback(async () => {
    try {
      const res = await apiFetch("/api/tv/plans");
      const data = await res.json();
      if (res.ok) setTvPlans(data.plans || []);
    } catch {
      /* the plan-change modal simply has nothing to offer */
    }
  }, []);

  const fetchHostels = useCallback(async () => {
    try {
      const res = await apiFetch("/api/hostels");
      const data = await res.json();
      if (res.ok) setHostels(data.hostels || []);
    } catch {
      /* the hostel filter falls back to "all" */
    }
  }, []);

  const fetchTvPassword = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/tv-settings");
      const data = await res.json();
      if (!res.ok) return;
      setTvPassword(data.tvPassword || "");
      setSavedTvPassword(data.tvPassword || "");
      setTvPasswordMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
    } catch {
      /* the rest of the page still works without it */
    }
  }, []);

  useEffect(() => {
    void fetchSubscriptions();
    void fetchTVPlans();
    void fetchHostels();
    void fetchTvPassword();
    void fetchDevices();
  }, [fetchSubscriptions, fetchTVPlans, fetchHostels, fetchTvPassword, fetchDevices]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSaveTvPassword = async () => {
    setSavingTvPassword(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/tv-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tvPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the TV password");
      setSavedTvPassword(data.tvPassword ?? tvPassword);
      await fetchTvPassword();
      addToast({
        type: "success",
        title: "TV password saved",
        message: data.tvPassword
          ? "New subscribers receive this with their activation email."
          : "Cleared — activation emails will omit it.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the TV password");
    } finally {
      setSavingTvPassword(false);
    }
  };

  const handleUpdatePlan = async () => {
    if (!planModal || !selectedPlanId) return;
    setUpdatingPlan(true);
    try {
      const res = await apiFetch("/api/tv/update-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: planModal.subId, planId: selectedPlanId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change the plan");
      setPlanModal(null);
      await fetchSubscriptions();
      addToast({ type: "success", title: "Plan updated", message: "The subscription now uses the new plan." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the plan");
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleCheckExpiry = async () => {
    setCheckingExpiry(true);
    try {
      const res = await apiFetch("/api/tv/check-expiry", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Expiry check failed");
      await Promise.all([fetchSubscriptions(), fetchDevices()]);
      addToast({
        type: "success",
        title: "Expiry check complete",
        message:
          `${data.expiringSoonNotifications ?? 0} reminded · ` +
          `${data.expiredNotifications ?? 0} expired · ` +
          `${data.accessRevoked ?? 0} device(s) revoked`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expiry check failed");
    } finally {
      setCheckingExpiry(false);
    }
  };

  const confirmDelete = async (subscriptionId: string) => {
    setDeleting(subscriptionId);
    try {
      const res = await apiFetch(`/api/tv/delete?id=${subscriptionId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      await fetchSubscriptions();
      addToast({ type: "success", title: "Subscription deleted", message: "The record has been removed." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeleting(null);
      setConfirmModal((m) => ({ ...m, isOpen: false }));
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const visible = useMemo(
    () =>
      subscriptions.filter((s) => {
        if (
          adminProfile?.hostels?.length &&
          !adminProfile.isSuperAdmin &&
          !allowedHostelNames.has(s.hostel ?? "")
        )
          return false;
        if (filterHostel !== "all" && (s.hostel || "") !== filterHostel) return false;
        if (search) {
          const hay = `${s.email} ${s.name} ${s.planName} ${s.hostel}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      }),
    [subscriptions, adminProfile, allowedHostelNames, filterHostel, search],
  );

  const running = visible.filter(
    (s) => s.subscriptionStatus === "active" || (s.subscriptionStatus as string) === "extension",
  );
  const expiringSoon = running.filter((s) => {
    const left = daysLeft(s.expiresAt);
    return left !== null && left >= 0 && left <= EXPIRING_WITHIN_DAYS;
  });
  const expired = visible.filter((s) => s.subscriptionStatus === "expired");
  const needsAttention = visible.filter(
    (s) =>
      (s.subscriptionStatus as string) === "blocked" ||
      s.subscriptionStatus === "pending_activation",
  );

  const unmatchedCount = (devices?.controllers || []).reduce(
    (sum, c) => sum + c.allow.filter((d) => d.unmatched).length,
    0,
  );
  const missingCount = devices?.missingFromControllers.length ?? 0;
  const monthlyRevenue = running.reduce((sum, s) => sum + (s.price || 0), 0);

  const rows =
    tab === "active"
      ? running
      : tab === "expiring"
        ? expiringSoon
        : tab === "expired"
          ? expired
          : needsAttention;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "active", label: "Watching", count: running.length },
    { key: "expiring", label: "Expiring soon", count: expiringSoon.length },
    { key: "expired", label: "Expired", count: expired.length },
    { key: "attention", label: "Needs attention", count: needsAttention.length },
    { key: "devices", label: "On controllers", count: unmatchedCount + missingCount },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="min-h-screen analytics-shell">
        <header className="glass-header">
          <div className="flex items-center gap-3">
            <Logo variant="dark" />
            <div>
              <p className="eyebrow">TELEVISION</p>
              <h1 className="text-xl font-semibold sm:text-2xl">TV subscriptions</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void fetchSubscriptions();
                void fetchDevices();
              }}
              className="glass-button"
            >
              <RefreshCw size={16} className={loading || loadingDevices ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => void handleCheckExpiry()}
              disabled={checkingExpiry}
              className="glass-button hidden md:flex"
              title="Remind those expiring, expire those due, and revoke their devices"
            >
              <Clock size={16} />
              {checkingExpiry ? "Checking…" : "Run expiry"}
            </button>
            <button
              onClick={() => {
                logout();
                router.push("/admin/login");
              }}
              className="glass-button hidden sm:flex"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-8">
          {error && (
            <div className="glass-alert">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Watching now" value={running.length} icon={Tv} tone="green"
              hint={`${money(monthlyRevenue)} of active plans`} />
            <Stat label="Expiring soon" value={expiringSoon.length} icon={Clock} tone="amber"
              hint={`within ${EXPIRING_WITHIN_DAYS} days`} />
            <Stat label="Expired" value={expired.length} icon={XCircle} tone="slate" />
            <Stat label="Free access" value={unmatchedCount} icon={Router} tone="rose"
              hint="on a controller, nobody paying" />
            <Stat label="Paid, no access" value={missingCount} icon={AlertTriangle} tone="rose"
              hint="paying but not on any list" />
          </section>

          {/* Activation password. Sent with every activation email. */}
          <section className="glass-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">ACTIVATION</p>
                <h3>TV password</h3>
              </div>
              {tvPasswordMeta.updatedAt && (
                <p className="text-xs text-slate-500">
                  Set {new Date(tvPasswordMeta.updatedAt).toLocaleDateString()}
                  {tvPasswordMeta.updatedBy ? ` by ${tvPasswordMeta.updatedBy}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showTvPassword ? "text" : "password"}
                  value={tvPassword}
                  onChange={(e) => setTvPassword(e.target.value)}
                  maxLength={128}
                  placeholder="e.g. LODGE2026"
                  aria-label="TV activation password"
                  className="w-full rounded-2xl border border-white/80 bg-white/70 py-3 pl-11 pr-16 font-mono tracking-wider backdrop-blur-xl focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowTvPassword((v) => !v)}
                  aria-label={showTvPassword ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showTvPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={() => void handleSaveTvPassword()}
                disabled={savingTvPassword || tvPassword === savedTvPassword || !canEdit}
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
              >
                {savingTvPassword ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Sent to every customer with their activation email. Leave empty to send none.
            </p>
          </section>

          {/* Segmented control, iOS-style. */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-1 overflow-x-auto rounded-full border border-white/80 bg-white/70 p-1 backdrop-blur-xl">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    tab === t.key
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-xs font-semibold ${
                        tab === t.key ? "bg-white/20" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab !== "devices" && (
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, name, plan…"
                  className="w-full rounded-2xl border border-white/80 bg-white/70 px-4 py-2 text-sm backdrop-blur-xl focus:border-blue-400 focus:outline-none lg:w-64"
                />
                {allowedHostels.length > 0 && (
                  <select
                    value={filterHostel}
                    onChange={(e) => setFilterHostel(e.target.value)}
                    className="rounded-2xl border border-white/80 bg-white/70 px-4 py-2 text-sm backdrop-blur-xl focus:outline-none"
                  >
                    <option value="all">All hostels</option>
                    {allowedHostels.map((h) => (
                      <option key={h.id} value={h.name}>{h.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* ── Controllers ─────────────────────────────────────────────── */}
          {tab === "devices" ? (
            <div className="space-y-4">
              {missingCount > 0 && (
                <section className="glass-panel ring-1 ring-rose-200">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow text-rose-600">PAYING, NO ACCESS</p>
                      <h3>Not on any controller</h3>
                    </div>
                  </div>
                  <p className="mb-4 text-sm text-slate-500">
                    These subscriptions are running and paid for, but the device is on no
                    allow list — so the customer is getting nothing.
                  </p>
                  <div className="space-y-2">
                    {devices?.missingFromControllers.map((m) => (
                      <div key={m.subscriptionId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50/70 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{m.email}</p>
                          <p className="text-xs text-slate-500">
                            {m.hostel} · {m.planName} · until {shortDate(m.expiresAt)}
                          </p>
                        </div>
                        <code className="rounded-lg bg-white/80 px-2 py-1 text-xs">{m.macAddress}</code>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(devices?.controllers || []).map((c) => (
                <section key={c.controller} className="glass-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">CONTROLLER</p>
                      <h3>{c.controller}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="status-chip">{c.allow.length} allowed</span>
                      <span className="slate-chip">{c.deny.length} denied</span>
                      {c.allow.some((d) => d.unmatched) && (
                        <span className="warning-chip">
                          {c.allow.filter((d) => d.unmatched).length} unmatched
                        </span>
                      )}
                    </div>
                  </div>

                  {c.error ? (
                    <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{c.error}</p>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {(["allow", "deny"] as const).map((kind) => (
                        <div key={kind}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            {kind === "allow" ? "Allow list" : "Deny list"}
                            {c[`${kind}GroupName` as const] && (
                              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                                {c[`${kind}GroupName` as const]}
                              </span>
                            )}
                            {!!c[`${kind}HiddenCount` as const] && (
                              <span
                                className="ml-2 font-normal normal-case tracking-normal text-slate-400"
                                title="Devices with no subscription and no Name(Hostel) label — staff devices, one-off manual grants — hidden to keep this list readable."
                              >
                                · {c[`${kind}HiddenCount` as const]} legacy hidden
                              </span>
                            )}
                          </p>
                          <div className="space-y-1.5">
                            {c[kind].length === 0 && (
                              <p className="rounded-2xl bg-white/50 px-4 py-3 text-sm text-slate-400">
                                {!c[`${kind}GroupName` as const]
                                  ? kind === "deny"
                                    ? "No deny list on this controller yet."
                                    : "Empty."
                                  : `All entries are legacy (${c[`${kind}HiddenCount` as const] || 0} hidden).`}
                              </p>
                            )}
                            {c[kind].map((d) => (
                              <div key={`${d.macAddress}-${d.ruleId}`}
                                className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 ${
                                  d.unmatched ? "bg-amber-50/70" : "bg-white/60"
                                }`}>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900">
                                    {d.label || "(no label)"}
                                  </p>
                                  <code className="text-[11px] text-slate-500">{d.macAddress}</code>
                                </div>
                                {d.unmatched ? (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                    no subscription
                                  </span>
                                ) : (
                                  <StatusPill status={d.status} expiresAt={d.expiresAt} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            /* ── Subscriptions ──────────────────────────────────────────── */
            <section className="glass-panel">
              {loading ? (
                <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
              ) : rows.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-400">Nothing here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((s) => {
                    const left = daysLeft(s.expiresAt);
                    return (
                      <div key={s.id}
                        className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 px-4 py-3 transition hover:bg-white/90">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {s.name || s.email}
                            </p>
                            <StatusPill status={s.subscriptionStatus} expiresAt={s.expiresAt} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {s.email} · {s.hostel || "—"}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-900">{s.planName}</p>
                          <p className="text-xs text-slate-500">{money(s.price)}</p>
                        </div>

                        <div className="w-32 text-right">
                          <p className="text-xs text-slate-500">
                            {s.expiresAt ? shortDate(s.expiresAt) : "not started"}
                          </p>
                          {left !== null && left >= 0 && (
                            <p className={`text-xs ${left <= 3 ? "font-semibold text-amber-600" : "text-slate-400"}`}>
                              {left === 0 ? "today" : `${left} days`}
                            </p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setPlanModal({
                                  subId: s.id,
                                  subName: s.name || s.email,
                                  currentPlanId: s.planId,
                                });
                                setSelectedPlanId(s.planId);
                              }}
                              aria-label="Change plan"
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() =>
                                setConfirmModal({
                                  isOpen: true,
                                  title: "Delete subscription",
                                  message: `Remove ${s.email}'s record? Their device is not taken off the controller by this.`,
                                  onConfirm: () => confirmDelete(s.id),
                                })
                              }
                              disabled={deleting === s.id}
                              aria-label="Delete subscription"
                              className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>

        {planModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
            <div className="glass-drawer w-full max-w-md p-6">
              <h3 className="text-lg font-semibold">Change plan</h3>
              <p className="mt-1 text-sm text-slate-500">{planModal.subName}</p>
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="mt-4 w-full rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm focus:outline-none"
              >
                {tvPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {money(p.price)} · {p.duration} days
                  </option>
                ))}
              </select>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setPlanModal(null)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button onClick={() => void handleUpdatePlan()} disabled={updatingPlan}
                  className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">
                  {updatingPlan ? "Saving…" : "Change plan"}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal((m) => ({ ...m, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          type="danger"
        />
      </div>
    </ProtectedRoute>
  );
}
