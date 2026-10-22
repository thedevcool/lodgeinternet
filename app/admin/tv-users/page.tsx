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

import { adminFetch } from "@/lib/apiClient";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Router,
  Trash2,
  Tv,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import ConfirmationModal from "@/components/ConfirmationModal";
import type { Hostel, TVSubscription } from "@/types";
import {
  AdminPage,
  EmptyState,
  GLASS_INPUT,
  GLASS_INPUT_ICON,
  IconButton,
  Kpi,
  Modal,
  Panel,
  TabBar,
} from "@/components/admin/ui";

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
  const { canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("tv-users");
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
      const res = await adminFetch("/api/tv/subscriptions?isAdmin=true");
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
      const res = await adminFetch("/api/admin/tv-devices");
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
      const res = await adminFetch("/api/tv/plans");
      const data = await res.json();
      if (res.ok) setTvPlans(data.plans || []);
    } catch {
      /* the plan-change modal simply has nothing to offer */
    }
  }, []);

  const fetchHostels = useCallback(async () => {
    try {
      const res = await adminFetch("/api/hostels");
      const data = await res.json();
      if (res.ok) setHostels(data.hostels || []);
    } catch {
      /* the hostel filter falls back to "all" */
    }
  }, []);

  const fetchTvPassword = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/tv-settings");
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
      const res = await adminFetch("/api/admin/tv-settings", {
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
      const res = await adminFetch("/api/tv/update-plan", {
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
      const res = await adminFetch("/api/tv/check-expiry", { method: "POST" });
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
      const res = await adminFetch(`/api/tv/delete?id=${subscriptionId}`, { method: "DELETE" });
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
    <ProtectedRoute module="tv-users">
      <AdminPage
        eyebrow="TELEVISION"
        title="TV subscriptions"
        actions={
          <>
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
              className="glass-button"
              title="Remind those expiring, expire those due, and revoke their devices"
            >
              <Clock size={16} />
              {checkingExpiry ? "Checking…" : "Run expiry"}
            </button>
          </>
        }
      >
        {error && (
          <div className="glass-alert">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="min-w-0 flex-1 break-words">{error}</span>
          </div>
        )}

        {/* Five tiles: on a two-column phone grid the last spans the row
            rather than sitting alone in half of it. */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Watching now" value={running.length} icon={<Tv size={16} />} tone="green"
            note={`${money(monthlyRevenue)} of active plans`} />
          <Kpi label="Expiring soon" value={expiringSoon.length} icon={<Clock size={16} />} tone="orange"
            note={`within ${EXPIRING_WITHIN_DAYS} days`} />
          <Kpi label="Expired" value={expired.length} icon={<XCircle size={16} />} tone="slate" />
          <Kpi label="Free access" value={unmatchedCount} icon={<Router size={16} />} tone="red"
            note="on a controller, nobody paying" />
          <div className="col-span-2 lg:col-span-1">
            <Kpi label="Paid, no access" value={missingCount} icon={<AlertTriangle size={16} />} tone="red"
              note="paying but not on any list" />
          </div>
        </section>

        {/* Activation password. Sent with every activation email. */}
        <Panel
          eyebrow="ACTIVATION"
          title="TV password"
          actions={
            tvPasswordMeta.updatedAt && (
              <p className="text-xs text-slate-500">
                Set {new Date(tvPasswordMeta.updatedAt).toLocaleDateString()}
                {tvPasswordMeta.updatedBy ? ` by ${tvPasswordMeta.updatedBy}` : ""}
              </p>
            )
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <KeyRound className={GLASS_INPUT_ICON} />
              <input
                type={showTvPassword ? "text" : "password"}
                value={tvPassword}
                onChange={(e) => setTvPassword(e.target.value)}
                maxLength={128}
                placeholder="e.g. LODGE2026"
                aria-label="TV activation password"
                className={`${GLASS_INPUT} pl-11 pr-14 font-mono tracking-wider`}
              />
              <button
                type="button"
                onClick={() => setShowTvPassword((v) => !v)}
                aria-label={showTvPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:text-slate-700"
              >
                {showTvPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              onClick={() => void handleSaveTvPassword()}
              disabled={savingTvPassword || tvPassword === savedTvPassword || !canEdit}
              className="glass-primary"
            >
              {savingTvPassword ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Sent to every customer with their activation email. Leave empty to send none.
          </p>
        </Panel>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabBar
            tabs={TABS.map((t) => ({ value: t.key, label: t.label, count: t.count }))}
            value={tab}
            onChange={setTab}
          />

          {tab !== "devices" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email, name, plan…"
                className={`${GLASS_INPUT} sm:flex-1 lg:w-64 lg:flex-none`}
              />
              {allowedHostels.length > 0 && (
                <select
                  value={filterHostel}
                  onChange={(e) => setFilterHostel(e.target.value)}
                  className={`${GLASS_INPUT} sm:w-auto`}
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
              <Panel className="ring-1 ring-rose-200">
                <div className="panel-heading">
                  <div className="min-w-0">
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
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl bg-rose-50/70 px-3 py-3 sm:px-4">
                      <div className="min-w-0 max-w-full">
                        <p className="truncate text-sm font-semibold text-slate-900">{m.email}</p>
                        <p className="break-words text-xs text-slate-500">
                          {m.hostel} · {m.planName} · until {shortDate(m.expiresAt)}
                        </p>
                      </div>
                      <code className="max-w-full break-all rounded-lg bg-white/80 px-2 py-1 text-xs">{m.macAddress}</code>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {(devices?.controllers || []).map((c) => (
              <Panel
                key={c.controller}
                eyebrow="CONTROLLER"
                title={<span className="break-words [overflow-wrap:anywhere]">{c.controller}</span>}
                actions={
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="status-chip">{c.allow.length} allowed</span>
                    <span className="slate-chip">{c.deny.length} denied</span>
                    {c.allow.some((d) => d.unmatched) && (
                      <span className="warning-chip">
                        {c.allow.filter((d) => d.unmatched).length} unmatched
                      </span>
                    )}
                  </div>
                }
              >
                {c.error ? (
                  <p className="break-words rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{c.error}</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {(["allow", "deny"] as const).map((kind) => (
                      <div key={kind} className="min-w-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          {kind === "allow" ? "Allow list" : "Deny list"}
                          {c[`${kind}GroupName` as const] && (
                            <span className="ml-2 break-words font-normal normal-case tracking-normal text-slate-400">
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
                              className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 sm:px-4 ${
                                d.unmatched ? "bg-amber-50/70" : "bg-white/60"
                              }`}>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {d.label || "(no label)"}
                                </p>
                                <code className="break-all text-[11px] text-slate-500">{d.macAddress}</code>
                              </div>
                              {d.unmatched ? (
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                  no subscription
                                </span>
                              ) : (
                                <span className="shrink-0">
                                  <StatusPill status={d.status} expiresAt={d.expiresAt} />
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ))}
          </div>
        ) : (
          /* ── Subscriptions ──────────────────────────────────────────── */
          <Panel>
            {loading ? (
              <EmptyState title="Loading…" />
            ) : rows.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-8 w-8 text-slate-300" />} title="Nothing here." />
            ) : (
              <div className="space-y-2">
                {rows.map((s) => {
                  const left = daysLeft(s.expiresAt);
                  return (
                    // Phone: who on top, then plan / expiry / actions in a row
                    // underneath. From md the four sit side by side.
                    <div key={s.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white/60 px-3 py-3 transition hover:bg-white/90 sm:px-4 md:flex-nowrap">
                      <div className="min-w-0 basis-full md:basis-auto md:flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                            {s.name || s.email}
                          </p>
                          <StatusPill status={s.subscriptionStatus} expiresAt={s.expiresAt} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {s.email} · {s.hostel || "—"}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1 md:flex-none md:text-right">
                        <p className="truncate text-sm font-medium text-slate-900">{s.planName}</p>
                        <p className="text-xs text-slate-500">{money(s.price)}</p>
                      </div>

                      <div className="shrink-0 text-right md:w-32">
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
                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton
                            label="Change plan"
                            onClick={() => {
                              setPlanModal({
                                subId: s.id,
                                subName: s.name || s.email,
                                currentPlanId: s.planId,
                              });
                              setSelectedPlanId(s.planId);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label="Delete subscription"
                            tone="danger"
                            onClick={() =>
                              setConfirmModal({
                                isOpen: true,
                                title: "Delete subscription",
                                message: `Remove ${s.email}'s record? Their device is not taken off the controller by this.`,
                                onConfirm: () => confirmDelete(s.id),
                              })
                            }
                            disabled={deleting === s.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        )}
      </AdminPage>

      <Modal
        open={!!planModal}
        onClose={() => setPlanModal(null)}
        title="Change plan"
        footer={
          <>
            <button onClick={() => setPlanModal(null)} className="glass-button">
              Cancel
            </button>
            <button onClick={() => void handleUpdatePlan()} disabled={updatingPlan} className="glass-primary">
              {updatingPlan ? "Saving…" : "Change plan"}
            </button>
          </>
        }
      >
        <p className="break-words text-sm text-slate-500">{planModal?.subName}</p>
        <select
          value={selectedPlanId}
          onChange={(e) => setSelectedPlanId(e.target.value)}
          aria-label="Plan"
          className={`${GLASS_INPUT} mt-4`}
        >
          {tvPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {money(p.price)} · {p.duration} days
            </option>
          ))}
        </select>
      </Modal>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((m) => ({ ...m, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
      />
    </ProtectedRoute>
  );
}
