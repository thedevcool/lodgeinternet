"use client";
import { apiFetch } from "@/lib/apiClient";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import ConfirmationModal from "@/components/ConfirmationModal";
import Logo from "@/components/Logo";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Router,
  Scissors,
  Search,
  Trash2,
  Tv,
  Smartphone,
  Wallet,
  Wifi,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { Hostel } from "@/types";

interface DataPurchaseRow {
  id: string;
  planId: string;
  planName: string;
  planType: "device" | "unlimited";
  usersCount?: number;
  price: number;
  /** Server-calculated net share, supplied only by the FastAPI partner view. */
  partnerShare?: number;
  codeId?: string;
  customerEmail?: string;
  paymentRef?: string;
  hostel?: string;
  paymentSource?: string;
  purchasedAt: Date;
}

interface TvPurchaseRow {
  id: string;
  planId: string;
  planName: string;
  planType: "tv";
  usersCount?: undefined;
  price: number;
  /** Server-calculated net share, supplied only by the FastAPI partner view. */
  partnerShare?: number;
  codeId?: undefined;
  customerEmail?: string;
  paymentRef?: string;
  hostel?: string;
  purchasedAt: Date;
}

type TransactionRow = DataPurchaseRow | TvPurchaseRow;

/** Per-controller revenue breakdown, computed by the backend from the same
 * dataPurchases/tvPurchases rows above — see `sales_by_controller` in
 * `app/services/controllers.py`. Absent from the partner response by design. */
interface ControllerSalesRow {
  controllerId: string;
  controllerName: string;
  dataPurchases: number;
  dataRevenue: number;
  tvSubscriptions: number;
  tvRevenue: number;
  revenue: number;
  transactions: number;
  hostelCount: number;
  hostels: string[];
}

/** Backend-computed hostel breakdown — see `sales_by_hostel` in
 * `app/services/controllers.py`. Server-side now (not derived from the
 * loaded page client-side) so it stays accurate once the row list is capped. */
interface HostelSalesRow {
  hostel: string;
  revenue: number;
  count: number;
}

interface SplitRecord {
  id: string;
  hostel: string;
  dateFrom: string;
  dateTo: string;
  isOpen?: boolean;
  adminPercent: number;
  partnerPercent: number;
  maintenancePct?: number;
  adminEmail?: string;
  partnerEmail?: string;
  sendMonthlyEmail?: boolean;
  totalRevenue: number;
  splittableRevenue?: number;
  adminShare: number;
  partnerShare: number;
  transactionCount: number;
  notes?: string;
  createdAt: Date;
}

/** A partner sub-admin, as returned by /api/admin/admins, for the payouts view. */
interface PartnerRow {
  id: string;
  username: string;
  hostels: string[]; // hostel IDs; empty = all hostels
  partnerSplitPercent: number;
  partnerSplitMode: "whole" | "perHostel";
  partnerHostelSplits: Record<string, number>;
}

/** A completed WhatsApp-bot transaction from /api/admin/bot-transactions. */
interface BotTxn {
  id: string;
  planName: string;
  planType: string;
  hostel: string;
  gross: number; // total charged, ₦
  fee: number; // platform 5% service fee, ₦
  paymentMethod: string;
  paymentRef: string;
  completedAt: string | null; // ISO
}

interface BotScenario {
  id: string;
  status: string;
  planName: string;
  hostel: string;
  paymentMethod: string;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  fallbackReason: string;
  createdAt: string | null;
}

/** Row-list page size sent as `?limit=` to `/api/admin/transactions`. Caps
 * the Firestore query itself (confirmed live: a capped query is fast even
 * against a large, growing ledger; an unbounded one isn't) — the summary
 * cards, Revenue by Hostel/Controller, and the "showing N of TOTAL" note all
 * still reflect the FULL filtered set regardless, per the backend response. */
const TRANSACTIONS_PAGE_SIZE = 150;

const PLAN_TYPE_LABELS: Record<string, string> = {
  device: "Device Plan",
  tv: "TV Plan",
  unlimited: "Unlimited",
};

function PlanTypeBadge({ type }: { type: string }) {
  const classes =
    type === "tv"
      ? "bg-purple-100 text-purple-700"
      : type === "unlimited"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";
  const Icon = type === "tv" ? Tv : type === "unlimited" ? Wifi : Smartphone;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      <Icon className='w-3 h-3' />
      {PLAN_TYPE_LABELS[type] ?? type}
    </span>
  );
}

/**
 * Fallbacks only. The backend owns these rates (`settings/splitConfig`, served
 * by `/api/admin/split-config`) and recomputes every stored figure itself, so
 * what the browser calculates here is a preview — never what gets paid out.
 * These values are what ships if the config request has not landed yet.
 */
const FALLBACK_MAINTENANCE_PCT = 10;
const FALLBACK_PAYSTACK_PCT = 1.5;

// ── Shared glass-style building blocks (this page only — see app/globals.css
// for the page-shell/panel/badge classes these are built to sit alongside) ──

/**
 * Headline number tile, copied from the dashboard's `Kpi` pattern. Tone maps
 * are spelled out in full on purpose: Tailwind scans source text for class
 * names, so a name assembled at runtime (`kpi-${tone}`) is invisible to it
 * and gets purged from the build — this bit the dashboard once already.
 */
const KPI_TONE_BG: Record<string, string> = {
  blue: "kpi-blue",
  green: "kpi-green",
  orange: "kpi-orange",
  red: "kpi-red",
  violet: "kpi-violet",
  purple: "kpi-purple",
  slate: "kpi-slate",
  teal: "kpi-teal",
};
const KPI_TONE_RAIL: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-rose-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  slate: "bg-slate-400",
  teal: "bg-teal-500",
};

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
    <div className={`kpi-card ${KPI_TONE_BG[tone] || KPI_TONE_BG.blue}`}>
      <span className={`kpi-rail ${KPI_TONE_RAIL[tone] || KPI_TONE_RAIL.blue}`} />
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {note && <p className="kpi-note">{note}</p>}
    </div>
  );
}

/**
 * Table header/body cells shared by every tab's tables. Header type matches
 * `.kpi-label` exactly, so table headers and KPI labels read as one language.
 * No zebra striping — every existing glass list (dashboard, tv-users) marks
 * rows with hover-only emphasis on a flat ground, not alternating stripes.
 */
const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500 ${ALIGN_CLASS[align]}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return <td className={`px-5 py-3 text-sm text-slate-700 ${ALIGN_CLASS[align]} ${className}`}>{children}</td>;
}

/**
 * Glass input/select convention — no dedicated CSS class exists for this yet
 * (every other still-legacy admin page builds its own inline), so it's kept
 * as one string here rather than added to globals.css ahead of adoption
 * elsewhere. Icon-prefixed fields add `pl-11` and position the icon with
 * `GLASS_INPUT_ICON` (mirrors tv-users' one existing icon-in-input field).
 */
const GLASS_INPUT =
  "w-full rounded-2xl border border-white/80 bg-white/70 px-4 py-2.5 text-sm text-slate-700 backdrop-blur-xl placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";
const GLASS_INPUT_ICON = "absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400";

/**
 * Labeled multi-way toggle (all/month, all/day/month/year, Fixed/Ongoing,
 * etc). Distinct from globals.css's `.segmented`/`.segmented-item`, which is
 * icon-only with no room for text labels. `activeClass` lets a specific
 * instance keep meaningful color (e.g. Splits' Fixed/Ongoing toggle uses
 * green for "ongoing" since that's informative, not just decorative).
 */
function SegToggle<T extends string>({
  value,
  onChange,
  options,
  activeClass = "bg-slate-900 text-white shadow-sm",
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  activeClass?: string;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-1 backdrop-blur-xl">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            value === opt.value ? activeClass : "text-slate-600 hover:bg-white"
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminTransactionsPage() {
  // Deduction rates, fetched rather than hardcoded. The backend recomputes
  // every stored split from these, so this is only what the preview shows.
  const [maintenancePct, setMaintenancePct] = useState(FALLBACK_MAINTENANCE_PCT);
  const [paystackPct, setPaystackPct] = useState(FALLBACK_PAYSTACK_PCT);
  const splittablePct = 100 - maintenancePct - paystackPct;

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch("/api/admin/split-config");
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.maintenancePct === "number") setMaintenancePct(data.maintenancePct);
        if (typeof data.paystackPct === "number") setPaystackPct(data.paystackPct);
      } catch {
        /* the shipped fallbacks stand in; the backend still computes the real split */
      }
    })();
  }, []);

  const { logout, canWrite, adminProfile } = useAuthStore();
  const isPartner = adminProfile?.isPartner ?? false;
  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;
  const canEdit = canWrite("transactions");
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  // The COMPLETE, unfiltered, uncapped ledger — separate from `transactions`
  // above (which the Transactions tab's own filter bar now scopes and caps
  // for speed). Partner Payouts and the Splits tab both compute revenue for
  // an arbitrary hostel/period that has nothing to do with whatever filter
  // happens to be set on the Transactions tab, so they read this instead —
  // conflating the two was a real bug: a split's revenue would silently
  // reflect only whatever page of the Transactions tab happened to be
  // loaded. Fetched once, in the background, for non-partners only (partners
  // never see these tabs at all).
  const [allTransactions, setAllTransactions] = useState<TransactionRow[]>([]);
  const [byController, setByController] = useState<ControllerSalesRow[]>([]);
  const [byHostel, setByHostel] = useState<HostelSalesRow[]>([]);
  // Both revenue breakdowns default collapsed — their card grids can get
  // large, and collapsed panels skip rendering that grid entirely (not just
  // hide it), which is what actually keeps the initial paint light.
  const [showControllerRevenue, setShowControllerRevenue] = useState(false);
  const [showHostelRevenue, setShowHostelRevenue] = useState(false);
  const [hostels, setHostels] = useState<Hostel[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "transactions" | "splits" | "payouts" | "bot"
  >("transactions");

  // ── Partner Payouts view (admin-only) ──────────────────────────────────────
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  // Period scope for the payouts totals: all-time, or a specific YYYY-MM month.
  const [payoutMode, setPayoutMode] = useState<"all" | "month">("all");
  const [payoutMonth, setPayoutMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // ── Bot Transactions view (admin-only) ─────────────────────────────────────
  const [botTxns, setBotTxns] = useState<BotTxn[]>([]);
  const [botScenarios, setBotScenarios] = useState<BotScenario[]>([]);
  // Period filter: all-time, a specific day, month, or year — plus a hostel.
  const [botPeriodMode, setBotPeriodMode] = useState<
    "all" | "day" | "month" | "year"
  >("all");
  const [botDay, setBotDay] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [botMonth, setBotMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [botYear, setBotYear] = useState<string>(() =>
    String(new Date().getFullYear()),
  );
  const [botHostel, setBotHostel] = useState("all");

  // Transaction filters — hostel/controller/planType/paymentSource/date are
  // sent to the backend (it does the filtering; see fetchTransactions), so
  // changing any of them re-fetches. `searchTerm` stays client-side only,
  // refining whatever page is currently loaded — pushing free-text search to
  // Firestore isn't practical, and it doesn't need to be: it's a "find one
  // thing on this page" tool, not a ledger-wide query.
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHostel, setFilterHostel] = useState("all");
  const [controllerFilter, setControllerFilter] = useState("all");
  const [filterPlanType, setFilterPlanType] = useState<
    "all" | "device" | "tv" | "unlimited"
  >("all");
  const [filterPaymentSource, setFilterPaymentSource] = useState<
    "all" | "bot" | "site"
  >("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  // Set from the backend's response — accurate even once the row list is
  // capped by TRANSACTIONS_PAGE_SIZE (see fetchTransactions).
  const [totalMatching, setTotalMatching] = useState(0);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  // Partner-only — their true total share across every matching transaction,
  // not just the loaded page (see `totalPartnerShare` below for when this is
  // actually used vs. the page-scoped fallback).
  const [totalPartnerShareAll, setTotalPartnerShareAll] = useState(0);

  // ── Splits state ──────────────────────────────────────────────────────────
  const [splitRecords, setSplitRecords] = useState<SplitRecord[]>([]);
  const [splitsLoading, setSplitsLoading] = useState(false);
  const [splitsError, setSplitsError] = useState("");
  const [splitSuccess, setSplitSuccess] = useState("");

  // New split form
  const [splitHostel, setSplitHostel] = useState("");
  const [splitDateFrom, setSplitDateFrom] = useState("");
  const [splitDateTo, setSplitDateTo] = useState("");
  const [splitAdminPct, setSplitAdminPct] = useState<number | "">(50);
  const [splitPartnerPct, setSplitPartnerPct] = useState<number | "">(50);
  const [splitNotes, setSplitNotes] = useState("");
  const [creatingSplit, setCreatingSplit] = useState(false);
  const [deletingSplit, setDeletingSplit] = useState<string | null>(null);
  const [expandedSplitId, setExpandedSplitId] = useState<string | null>(null);
  // Confirms before a split is permanently deleted — same shared modal
  // tv-users/page.tsx already uses for its own delete button.
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  // Split list filters
  const [splitFilterHostel, setSplitFilterHostel] = useState("all");
  const [splitFilterFrom, setSplitFilterFrom] = useState("");
  const [splitFilterTo, setSplitFilterTo] = useState("");
  const [splitFilterMonth, setSplitFilterMonth] = useState("");
  const [splitIsOpen, setSplitIsOpen] = useState(false);
  const [expandedSplitMonths, setExpandedSplitMonths] = useState<
    Record<string, string>
  >({});
  const [emailSplitId, setEmailSplitId] = useState<string | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");

  // Per-split email settings & editable maintenance %
  const [splitMaintenancePct, setSplitMaintenancePct] = useState<number | "">(
    maintenancePct,
  );
  const [splitAdminEmail, setSplitAdminEmail] = useState("");
  const [splitPartnerEmail, setSplitPartnerEmail] = useState("");
  const [splitSendMonthlyEmail, setSplitSendMonthlyEmail] = useState(false);

  useEffect(() => {
    fetchAll();
    if (!isPartner) {
      fetchSplits();
      fetchPartners();
      // Backgrounded — Payouts/Splits need the complete ledger, but nothing
      // on the Transactions tab (already fast via fetchAll above) should
      // wait on it.
      void fetchAllTransactions();
    }
    if (isSuperAdmin) {
      fetchBotTransactions();
    }
  }, []);

  // Re-fetch whenever a structured filter changes — the backend does the
  // filtering now, so a change here means different data to ask for, not
  // just a different client-side view of what's already loaded. Skips its
  // own first run since the mount effect above already fetched once with
  // the (empty) initial filter state.
  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    void fetchTransactions();
  }, [filterHostel, controllerFilter, filterPlanType, filterPaymentSource, filterDateFrom, filterDateTo]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([fetchTransactions(), fetchHostels()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHostels = async () => {
    try {
      const res = await apiFetch("/api/hostels");
      const data = await res.json();
      if (res.ok) {
        const all = data.hostels ?? [];
        setHostels(all);
        // Auto-set splitHostel form field if restricted to exactly one hostel
        const allowed =
          !adminProfile?.hostels?.length || adminProfile?.isSuperAdmin
            ? all
            : all.filter(
                (h: { id: string }) =>
                  adminProfile?.hostels?.includes(h.id) ?? false,
              );
        if (allowed.length === 1) {
          setSplitHostel(allowed[0].name);
          setFilterHostel(allowed[0].name);
        }
      }
    } catch {
      // non-critical
    }
  };

  // Completed WhatsApp-bot transactions drive the admin-only bot audit view.
  // Non-critical: on any failure the view just stays empty.
  const fetchBotTransactions = async () => {
    try {
      const res = await apiFetch("/api/admin/bot-transactions");
      const data = await res.json();
      if (!res.ok) return;
      setBotTxns(data.transactions ?? []);
      setBotScenarios(data.scenarios ?? []);
    } catch {
      // non-critical
    }
  };

  // Partner accounts drive the admin-only payouts view. Non-critical: on any
  // failure the view just stays empty.
  const fetchPartners = async () => {
    try {
      const res = await apiFetch("/api/admin/admins");
      const data = await res.json();
      if (!res.ok) return;
      const rows: PartnerRow[] = (data.admins ?? [])
        .filter((a: any) => a.isPartner)
        .map((a: any) => ({
          id: a.id,
          username: a.username,
          hostels: a.hostels ?? [],
          partnerSplitPercent: a.partnerSplitPercent ?? 0,
          partnerSplitMode:
            a.partnerSplitMode === "perHostel" ? "perHostel" : "whole",
          partnerHostelSplits: a.partnerHostelSplits ?? {},
        }));
      setPartners(rows);
    } catch {
      // non-critical
    }
  };

  /** Parses one `/api/admin/transactions` response into the shapes this page
   * renders — shared by the normal (capped) fetch and the unbounded one
   * Export uses, so the two never drift apart. */
  const parseTransactionsResponse = (data: any) => {
    const toDate = (iso: string | null): Date => (iso ? new Date(iso) : new Date(0));

    const dataPurchases: DataPurchaseRow[] = (data.dataPurchases ?? []).map((d: any) => ({
      id: d.id,
      planId: d.planId,
      planName: d.planName,
      planType: d.planType,
      usersCount: d.usersCount,
      price: d.price,
      partnerShare: d.partnerShare,
      codeId: d.codeId,
      customerEmail: d.customerEmail,
      paymentRef: d.paymentRef,
      hostel: d.hostel,
      paymentSource: d.paymentSource || "",
      purchasedAt: toDate(d.purchasedAt),
    }));

    const tvPurchases: TvPurchaseRow[] = (data.tvPurchases ?? []).map((d: any) => ({
      id: d.id,
      planId: d.planId,
      planName: d.planName,
      planType: "tv" as const,
      price: d.price,
      partnerShare: d.partnerShare,
      customerEmail: d.customerEmail,
      paymentRef: d.paymentRef,
      hostel: d.hostel,
      purchasedAt: toDate(d.purchasedAt),
    }));

    const all: TransactionRow[] = [...dataPurchases, ...tvPurchases].sort(
      (a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime(),
    );
    const VALID_PLAN_TYPES = new Set(["device", "tv", "unlimited"]);
    // Partner responses omit customerEmail (PII) by design, so only the admin
    // view requires it — otherwise every partner row is dropped here and the
    // ledger shows blank.
    const partnerView = data.partnerView === true;
    const valid = all.filter(
      (t) => VALID_PLAN_TYPES.has(t.planType) && (partnerView || !!t.customerEmail?.trim()),
    );
    return {
      valid,
      byController: (data.byController ?? []) as ControllerSalesRow[],
      byHostel: (data.byHostel ?? []) as HostelSalesRow[],
      totalMatching: (data.totalMatching as number) ?? valid.length,
      hasMore: data.hasMore === true,
      totalPartnerShare: (data.totalPartnerShare as number) ?? null,
    };
  };

  /** Query string for the current filter selections. `unbounded` drops the
   * page-size cap — used only for Export, which must cover every matching
   * transaction, not just what's currently on screen. */
  const buildTransactionsQuery = (opts: { unbounded?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (filterHostel !== "all") params.set("hostel", filterHostel);
    if (controllerFilter !== "all") params.set("controllerId", controllerFilter);
    if (filterPlanType !== "all") params.set("planType", filterPlanType);
    if (filterPaymentSource !== "all") params.set("paymentSource", filterPaymentSource);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    if (!opts.unbounded) params.set("limit", String(TRANSACTIONS_PAGE_SIZE));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const fetchTransactions = async () => {
    try {
      // The backend does the filtering now (hostel/controller/plan type/
      // payment source/date), so it only ever has to stream what's actually
      // relevant — and `limit` caps the row list at the Firestore query
      // level, which is what keeps this fast even against a growing ledger.
      const res = await apiFetch(`/api/admin/transactions${buildTransactionsQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load transactions");
      const parsed = parseTransactionsResponse(data);
      setTransactions(parsed.valid);
      // Absent from the partner response by design (see admin_transactions.py)
      // — defaulting to [] there is what keeps the panels below hidden for them.
      setByController(parsed.byController);
      setByHostel(parsed.byHostel);
      setTotalMatching(parsed.totalMatching);
      setHasMoreTransactions(parsed.hasMore);
      if (parsed.totalPartnerShare !== null) setTotalPartnerShareAll(parsed.totalPartnerShare);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError("Failed to load transactions. Please try again.");
    }
  };

  /** No query params at all — the complete, unfiltered ledger, exactly what
   * `fetchTransactions` always fetched before it started scoping to the
   * Transactions tab's own filters. Feeds Payouts/Splits (see
   * `allTransactions` above); errors here are silent since it's a background
   * fetch for tabs the user may not even open this session. */
  const fetchAllTransactions = async () => {
    try {
      const res = await apiFetch("/api/admin/transactions");
      const data = await res.json();
      if (!res.ok) return;
      setAllTransactions(parseTransactionsResponse(data).valid);
    } catch {
      // non-critical — Payouts/Splits will just show stale/empty figures
      // until a manual refresh succeeds, rather than blocking anything
    }
  };

  const fetchSplits = async () => {
    setSplitsLoading(true);
    try {
      const res = await apiFetch("/api/admin/splits");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load splits");
      const records = (data.splits ?? []).map((s: any) => ({
        ...s,
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
      }));
      setSplitRecords(records);
    } catch (err) {
      setSplitsError(
        err instanceof Error ? err.message : "Failed to load splits",
      );
    } finally {
      setSplitsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  // ── Transactions computed ─────────────────────────────────────────────────
  // Access control and free-text search are the only two things NOT already
  // applied server-side (see fetchTransactions/buildTransactionsQuery) — the
  // hostel/planType/paymentSource/date re-checks below are now a no-op
  // against `transactions` (the backend already filtered on all of those),
  // kept as a cheap defense-in-depth rather than trusting the response
  // blindly. Pulled out as its own function (not inlined in the `filtered`
  // useMemo below) so the unbounded export fetch in exportToExcel can apply
  // the exact same rules to freshly-fetched rows the page never loaded.
  const matchesClientFilters = useCallback(
    (t: TransactionRow): boolean => {
      if (
        adminProfile?.hostels?.length &&
        !adminProfile.isSuperAdmin &&
        !allowedHostelNames.has(t.hostel ?? "")
      )
        return false;
      if (filterHostel !== "all" && (t.hostel ?? "Unknown") !== filterHostel)
        return false;
      if (filterPlanType !== "all" && t.planType !== filterPlanType)
        return false;
      if (filterPaymentSource !== "all") {
        const src = ("paymentSource" in t ? (t as DataPurchaseRow).paymentSource : "") || "";
        if (filterPaymentSource === "bot" && src !== "bot") return false;
        if (filterPaymentSource === "site" && src === "bot") return false;
      }
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (t.purchasedAt < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (t.purchasedAt > to) return false;
      }
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          t.planName.toLowerCase().includes(s) ||
          (t.customerEmail?.toLowerCase().includes(s) ?? false) ||
          (t.paymentRef?.toLowerCase().includes(s) ?? false) ||
          (t.hostel?.toLowerCase().includes(s) ?? false)
        );
      }
      return true;
    },
    [
      filterHostel,
      filterPlanType,
      filterPaymentSource,
      filterDateFrom,
      filterDateTo,
      searchTerm,
      adminProfile,
      allowedHostelNames,
    ],
  );

  const filtered = useMemo(
    () => transactions.filter(matchesClientFilters),
    [transactions, matchesClientFilters],
  );

  // `filtered` only ever holds up to TRANSACTIONS_PAGE_SIZE rows once the
  // backend caps the query, so summing it under-reports revenue once
  // `hasMoreTransactions` is true. `byHostel` is the backend's own total
  // over the FULL matching set (unaffected by the row-list cap) — used
  // whenever `searchTerm` isn't narrowing things further, since search never
  // reaches the backend and `byHostel` has no way to reflect it.
  const totalRevenue = searchTerm
    ? filtered.reduce((s, t) => s + t.price, 0)
    : byHostel.reduce((s, r) => s + r.revenue, 0);
  // Same reasoning: `totalMatching` is the backend's true count over every
  // matching transaction, not just the loaded page.
  const totalTransactionsCount = searchTerm ? filtered.length : totalMatching;

  // A partner never sees the gross transaction amount. Their share is their
  // split percentage of the FULL transaction amount — the admin decides the
  // split from the whole 100% (no maintenance/Paystack deductions).
  const partnerSplitPercent = adminProfile?.partnerSplitPercent ?? 0;
  const partnerSplitMode = adminProfile?.partnerSplitMode ?? "whole";
  // Transactions store hostel NAMES; per-hostel splits are keyed by hostel ID.
  // Resolve name → % once so the ledger can price each row by its hostel.
  const partnerPercentByHostelName = useMemo(() => {
    const map: Record<string, number> = {};
    if (partnerSplitMode === "perHostel") {
      const splits = adminProfile?.partnerHostelSplits ?? {};
      for (const h of hostels) {
        if (h.id in splits) map[h.name] = splits[h.id];
      }
    }
    return map;
  }, [partnerSplitMode, adminProfile, hostels]);
  const partnerPercentFor = (transaction: TransactionRow) =>
    partnerSplitMode === "perHostel"
      ? partnerPercentByHostelName[transaction.hostel ?? ""] ?? 0
      : partnerSplitPercent;
  const partnerShareFor = (transaction: TransactionRow) => {
    if (typeof transaction.partnerShare === "number")
      return transaction.partnerShare;
    return Math.round((transaction.price * partnerPercentFor(transaction)) / 100);
  };
  // Same reasoning as `totalRevenue` above: `totalPartnerShareAll` is the
  // backend's own total (never gross, always the partner's cut) over every
  // matching transaction, used unless a search term means the visibly-loaded
  // page is genuinely what the partner is looking at.
  const totalPartnerShare = searchTerm
    ? filtered.reduce((sum, transaction) => sum + partnerShareFor(transaction), 0)
    : totalPartnerShareAll;

  // ── Partner Payouts (admin-only) ──────────────────────────────────────────
  // For each partner, sum each of their hostels' FULL revenue over the selected
  // period, apply their split (whole or per-hostel), and show their cut plus the
  // admin's kept share (gross − cut). No split records are created.
  const payoutTransactions = useMemo(() => {
    if (payoutMode === "all") return allTransactions;
    return allTransactions.filter((t) => {
      if (!t.purchasedAt) return false;
      const d = new Date(t.purchasedAt);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return ym === payoutMonth;
    });
  }, [allTransactions, payoutMode, payoutMonth]);

  const hostelNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const h of hostels) m[h.id] = h.name;
    return m;
  }, [hostels]);

  const grossByHostelName = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of payoutTransactions) {
      const name = t.hostel ?? "Unknown";
      m[name] = (m[name] ?? 0) + (t.price || 0);
    }
    return m;
  }, [payoutTransactions]);

  const partnerPayouts = useMemo(() => {
    return partners.map((p) => {
      // Empty hostels array = all hostels.
      const scopeIds = p.hostels.length ? p.hostels : hostels.map((h) => h.id);
      const rows = scopeIds
        .map((hostelId) => {
          const name = hostelNameById[hostelId] ?? hostelId;
          const gross = grossByHostelName[name] ?? 0;
          const pct =
            p.partnerSplitMode === "perHostel"
              ? p.partnerHostelSplits[hostelId] ?? 0
              : p.partnerSplitPercent;
          const cut = Math.round((gross * pct) / 100);
          return { hostelId, name, gross, pct, cut, adminGain: gross - cut };
        })
        .filter((r) => r.gross > 0)
        .sort((a, b) => b.gross - a.gross);
      const totalGross = rows.reduce((s, r) => s + r.gross, 0);
      const totalCut = rows.reduce((s, r) => s + r.cut, 0);
      return {
        id: p.id,
        username: p.username,
        mode: p.partnerSplitMode,
        rows,
        totalGross,
        totalCut,
        adminGain: totalGross - totalCut,
      };
    });
  }, [partners, hostels, hostelNameById, grossByHostelName]);

  const payoutTotals = useMemo(() => {
    const partnerTotal = partnerPayouts.reduce((s, p) => s + p.totalCut, 0);
    const adminTotal = partnerPayouts.reduce((s, p) => s + p.adminGain, 0);
    return { partnerTotal, adminTotal };
  }, [partnerPayouts]);

  // ── Bot Transactions (admin-only) ──────────────────────────────────────────
  // Filter completed bot transactions by the selected period + hostel (and the
  // admin's hostel scope), then total the 5% and group by hostel + by month.
  const botFiltered = useMemo(() => {
    return botTxns.filter((t) => {
      const h = t.hostel || "Unknown";
      // Hostel-level access for restricted admins.
      if (
        adminProfile?.hostels?.length &&
        !adminProfile.isSuperAdmin &&
        !allowedHostelNames.has(t.hostel || "")
      )
        return false;
      if (botHostel !== "all" && h !== botHostel) return false;
      // Period narrowing (local dates, matching the payouts view).
      if (botPeriodMode !== "all") {
        if (!t.completedAt) return false;
        const d = new Date(t.completedAt);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (botPeriodMode === "day" && ymd !== botDay) return false;
        if (botPeriodMode === "month" && ymd.slice(0, 7) !== botMonth) return false;
        if (botPeriodMode === "year" && ymd.slice(0, 4) !== botYear) return false;
      }
      return true;
    });
  }, [
    botTxns,
    botPeriodMode,
    botDay,
    botMonth,
    botYear,
    botHostel,
    adminProfile,
    allowedHostelNames,
  ]);

  const botTotals = useMemo(() => {
    let gross = 0;
    let fee = 0;
    for (const t of botFiltered) {
      gross += t.gross || 0;
      fee += t.fee || 0;
    }
    return { count: botFiltered.length, gross, fee };
  }, [botFiltered]);

  const botByHostel = useMemo(() => {
    const m: Record<string, { count: number; gross: number; fee: number }> = {};
    for (const t of botFiltered) {
      const h = t.hostel || "Unknown";
      if (!m[h]) m[h] = { count: 0, gross: 0, fee: 0 };
      m[h].count += 1;
      m[h].gross += t.gross || 0;
      m[h].fee += t.fee || 0;
    }
    return Object.entries(m).sort((a, b) => b[1].fee - a[1].fee);
  }, [botFiltered]);

  const botByMonth = useMemo(() => {
    const m: Record<string, { count: number; gross: number; fee: number }> = {};
    for (const t of botFiltered) {
      const d = t.completedAt ? new Date(t.completedAt) : null;
      const key = d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : "Unknown";
      if (!m[key]) m[key] = { count: 0, gross: 0, fee: 0 };
      m[key].count += 1;
      m[key].gross += t.gross || 0;
      m[key].fee += t.fee || 0;
    }
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [botFiltered]);

  const botPeriodLabel =
    botPeriodMode === "all"
      ? "All time"
      : botPeriodMode === "day"
        ? botDay
        : botPeriodMode === "month"
          ? botMonth
          : botYear;

  const knownHostels = useMemo(() => {
    const names = new Set<string>();
    // Only include allowed hostels from the API
    allowedHostels.forEach((h) => names.add(h.name));
    // Also include legacy hostel values seen in either ledger view that are
    // within the allowed set. Both sources: `transactions` is capped/filtered
    // for partners (who never get `allTransactions`), `allTransactions` is
    // the complete ledger for everyone else — checking both means this list
    // is never narrower than either alone.
    for (const t of transactions) {
      if (t.hostel && allowedHostelNames.has(t.hostel)) names.add(t.hostel);
    }
    for (const t of allTransactions) {
      if (t.hostel && allowedHostelNames.has(t.hostel)) names.add(t.hostel);
    }
    return Array.from(names).sort();
  }, [transactions, allTransactions, allowedHostels, allowedHostelNames]);

  const [exporting, setExporting] = useState(false);

  const exportToExcel = async () => {
    setExporting(true);
    // The page only ever holds up to TRANSACTIONS_PAGE_SIZE rows once the
    // backend caps the query — Export needs every matching transaction, not
    // just what's currently on screen, so it asks for the unfiltered-by-page
    // (but still filtered-by-filters) set directly. Falls back to what's
    // already loaded if that request fails, rather than blocking entirely.
    let rowsSource: TransactionRow[] = filtered;
    try {
      const res = await apiFetch(`/api/admin/transactions${buildTransactionsQuery({ unbounded: true })}`);
      const data = await res.json();
      if (res.ok) {
        // searchTerm never reaches the backend, so it's applied here same as
        // the on-screen `filtered` list — otherwise a search-narrowed export
        // would silently include rows the user isn't currently looking at.
        rowsSource = parseTransactionsResponse(data).valid.filter(matchesClientFilters);
      }
    } catch {
      // network hiccup — export whatever's already loaded rather than nothing
    } finally {
      setExporting(false);
    }

    const rows = rowsSource.map((t) =>
      isPartner
        ? {
            Date: t.purchasedAt.toLocaleString(),
            "Plan Name": t.planName,
            "Plan Type": PLAN_TYPE_LABELS[t.planType] ?? t.planType,
            Hostel: t.hostel ?? "Unknown",
            "Your Share (₦)": partnerShareFor(t),
          }
        : {
            Date: t.purchasedAt.toLocaleString(),
            "Plan Name": t.planName,
            "Plan Type": PLAN_TYPE_LABELS[t.planType] ?? t.planType,
            Hostel: t.hostel ?? "Unknown",
            Source: "paymentSource" in t ? ((t as DataPurchaseRow).paymentSource === "bot" ? "Bot" : "Site") : "Site",
            "Customer Email": t.customerEmail ?? "N/A",
            "Payment Ref": t.paymentRef ?? "N/A",
            "Price (₦)": t.price,
          },
    );

    // Recomputed from `rowsSource` rather than reused from the `byHostel`
    // state: that state reflects the backend's filters but, like `rowsSource`
    // above, not `searchTerm` — grouping the already search-narrowed rows
    // here keeps the summary sheet consistent with the Transactions sheet.
    const hostelTotals = new Map<string, { count: number; revenue: number }>();
    for (const t of rowsSource) {
      const h = t.hostel ?? "Unknown";
      const cur = hostelTotals.get(h) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += t.price;
      hostelTotals.set(h, cur);
    }
    const hostelRows = Array.from(hostelTotals.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
    const totalRev = rowsSource.reduce((s, t) => s + t.price, 0);
    const totalShare = rowsSource.reduce((s, t) => s + partnerShareFor(t), 0);

    const summaryRows = [
      { Label: "Total Transactions", Value: rowsSource.length },
      isPartner
        ? { Label: "Your Total Share (₦)", Value: totalShare }
        : { Label: "Total Revenue (₦)", Value: totalRev },
      ...(isPartner
        ? []
        : [
            { Label: "", Value: "" },
            { Label: "Hostel", Value: "Transactions", Revenue: "Revenue (₦)" },
            ...hostelRows.map(([hostel, stats]) => ({
              Label: hostel,
              Value: stats.count,
              Revenue: stats.revenue,
            })),
          ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows),
      "Transactions",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "Summary",
    );
    XLSX.writeFile(
      wb,
      `transaction-audit-${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  // ── Splits computed ───────────────────────────────────────────────────────
  const splitPreview = useMemo(() => {
    if (!splitHostel || !splitDateFrom || (!splitIsOpen && !splitDateTo))
      return null;
    const from = new Date(splitDateFrom);
    from.setHours(0, 0, 0, 0);
    const to = splitIsOpen ? new Date() : new Date(splitDateTo);
    to.setHours(23, 59, 59, 999);
    const relevant = allTransactions.filter(
      (t) =>
        (t.hostel ?? "Unknown") === splitHostel &&
        t.purchasedAt >= from &&
        t.purchasedAt <= to,
    );
    const mPct =
      typeof splitMaintenancePct === "number"
        ? splitMaintenancePct
        : maintenancePct;
    const grossRev = relevant.reduce((s, t) => s + t.price, 0);
    const mainDed = Math.round((grossRev * mPct) / 100);
    const paystackDed = Math.round((grossRev * paystackPct) / 100);
    const splittableRev = grossRev - mainDed - paystackDed;
    const aPct = typeof splitAdminPct === "number" ? splitAdminPct : 0;
    const pPct = typeof splitPartnerPct === "number" ? splitPartnerPct : 0;
    return {
      totalRevenue: grossRev,
      maintenanceDeduction: mainDed,
      paystackDeduction: paystackDed,
      splittableRevenue: splittableRev,
      count: relevant.length,
      adminShare: Math.round((splittableRev * aPct) / 100),
      partnerShare: Math.round((splittableRev * pPct) / 100),
    };
  }, [
    allTransactions,
    splitHostel,
    splitDateFrom,
    splitDateTo,
    splitIsOpen,
    splitAdminPct,
    splitPartnerPct,
    splitMaintenancePct,
  ]);

  const handleCreateSplit = async () => {
    if (!splitHostel || !splitDateFrom) {
      setSplitsError("Please select a hostel and start date.");
      return;
    }
    if (!splitIsOpen && !splitDateTo) {
      setSplitsError("Please enter an end date for a fixed split.");
      return;
    }
    const aPct = typeof splitAdminPct === "number" ? splitAdminPct : 0;
    const pPct = typeof splitPartnerPct === "number" ? splitPartnerPct : 0;
    if (aPct + pPct !== 100) {
      setSplitsError("Your % and Partner % must add up to 100.");
      return;
    }
    if (!splitPreview || splitPreview.count === 0) {
      setSplitsError("No transactions found for this hostel and period.");
      return;
    }
    setCreatingSplit(true);
    setSplitsError("");
    try {
      const res = await apiFetch("/api/admin/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostel: splitHostel,
          dateFrom: splitDateFrom,
          dateTo: splitIsOpen ? "" : splitDateTo,
          isOpen: splitIsOpen,
          adminPercent: aPct,
          partnerPercent: pPct,
          maintenancePct:
            typeof splitMaintenancePct === "number"
              ? splitMaintenancePct
              : maintenancePct,
          adminEmail: splitAdminEmail.trim(),
          partnerEmail: splitPartnerEmail.trim(),
          sendMonthlyEmail: splitSendMonthlyEmail,
          totalRevenue: splitPreview.totalRevenue,
          splittableRevenue: splitPreview.splittableRevenue,
          adminShare: splitPreview.adminShare,
          partnerShare: splitPreview.partnerShare,
          transactionCount: splitPreview.count,
          notes: splitNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save split");
      setSplitSuccess("Split saved successfully.");
      setTimeout(() => setSplitSuccess(""), 3000);
      setSplitHostel("");
      setSplitDateFrom("");
      setSplitDateTo("");
      setSplitIsOpen(false);
      setSplitAdminPct(50);
      setSplitPartnerPct(50);
      setSplitNotes("");
      setSplitMaintenancePct(maintenancePct);
      setSplitAdminEmail("");
      setSplitPartnerEmail("");
      setSplitSendMonthlyEmail(false);
      await fetchSplits();
    } catch (err) {
      setSplitsError(
        err instanceof Error ? err.message : "Failed to save split",
      );
    } finally {
      setCreatingSplit(false);
    }
  };

  const handleDeleteSplit = async (id: string) => {
    setDeletingSplit(id);
    try {
      const res = await fetch(
        `/api/admin/splits?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete split");
      await fetchSplits();
    } catch (err) {
      setSplitsError(
        err instanceof Error ? err.message : "Failed to delete split",
      );
    } finally {
      setDeletingSplit(null);
    }
  };

  const handleSendSplitEmail = async (
    s: SplitRecord,
    txns: TransactionRow[],
    toEmail: string,
    periodLabel: string,
  ) => {
    if (!toEmail.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail.trim())) {
      setSplitsError("Please enter a valid email address.");
      return;
    }
    setSendingEmail(true);
    setSplitsError("");
    const mPct = s.maintenancePct ?? maintenancePct;
    const grossRev = txns.reduce((a, t) => a + t.price, 0);
    const mainDed = Math.round((grossRev * mPct) / 100);
    const paystackDed = Math.round((grossRev * paystackPct) / 100);
    const splittableRev = grossRev - mainDed - paystackDed;
    const aShr = Math.round((splittableRev * s.adminPercent) / 100);
    const pShr = Math.round((splittableRev * s.partnerPercent) / 100);
    const splitPayload = {
      hostel: s.hostel,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
      isOpen: s.isOpen ?? false,
      adminPercent: s.adminPercent,
      partnerPercent: s.partnerPercent,
      totalRevenue: grossRev,
      maintenancePct: mPct,
      paystackPct: paystackPct,
      maintenanceDeduction: mainDed,
      paystackDeduction: paystackDed,
      splittableRevenue: splittableRev,
      adminShare: aShr,
      partnerShare: pShr,
      transactionCount: txns.length,
      notes: s.notes,
      createdAt: s.createdAt.toISOString(),
    };
    const transactionsPayload = txns.map((t) => ({
      date: t.purchasedAt.toLocaleString("en-NG"),
      planName: t.planName,
      planType: t.planType,
      email: t.customerEmail ?? "",
      ref: t.paymentRef ?? "",
      price: t.price,
      adminShare: Math.round((t.price * s.adminPercent) / 100),
      partnerShare: Math.round((t.price * s.partnerPercent) / 100),
    }));
    try {
      const res = await apiFetch("/api/admin/send-split-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail.trim(),
          split: splitPayload,
          transactions: transactionsPayload,
          periodLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send email");
      setEmailSuccess("Email sent successfully.");
      setTimeout(() => setEmailSuccess(""), 4000);
      setEmailAddress("");
      setEmailSplitId(null);
    } catch (err) {
      setSplitsError(
        err instanceof Error ? err.message : "Failed to send email",
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const getMonthOptions = (s: SplitRecord) => {
    const from = new Date(s.dateFrom);
    const to = s.dateTo ? new Date(s.dateTo) : new Date();
    const options: { value: string; label: string }[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      options.unshift({
        value: `${y}-${String(m).padStart(2, "0")}`,
        label: new Date(y, m - 1, 1).toLocaleDateString("en-NG", {
          month: "long",
          year: "numeric",
        }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return options;
  };

  const filteredSplits = useMemo(() => {
    return splitRecords.filter((s) => {
      // Enforce hostel-level access on splits
      if (
        adminProfile?.hostels?.length &&
        !adminProfile.isSuperAdmin &&
        !allowedHostelNames.has(s.hostel)
      )
        return false;
      if (splitFilterHostel !== "all" && s.hostel !== splitFilterHostel)
        return false;
      if (splitFilterMonth) {
        const [y, m] = splitFilterMonth.split("-").map(Number);
        if (s.createdAt.getFullYear() !== y || s.createdAt.getMonth() + 1 !== m)
          return false;
      } else {
        if (splitFilterFrom) {
          const from = new Date(splitFilterFrom);
          from.setHours(0, 0, 0, 0);
          if (s.createdAt < from) return false;
        }
        if (splitFilterTo) {
          const to = new Date(splitFilterTo);
          to.setHours(23, 59, 59, 999);
          if (s.createdAt > to) return false;
        }
      }
      return true;
    });
  }, [
    splitRecords,
    splitFilterHostel,
    splitFilterFrom,
    splitFilterTo,
    splitFilterMonth,
    adminProfile,
    allowedHostelNames,
  ]);

  // Grouped once per data refresh so `getSplitTransactions` below never scans
  // the full ledger on every call — the Splits History table calls it 2-3x
  // per row, which would otherwise mean O(splits × ledger) work on every
  // re-render, including ones that have nothing to do with the data (e.g.
  // toggling a row open). Built from `allTransactions` (the complete
  // ledger), not `transactions` (the Transactions tab's own capped/filtered
  // view) — a split's revenue must reflect its actual hostel/period
  // regardless of whatever filter happens to be set on a different tab.
  const transactionsByHostel = useMemo(() => {
    const map = new Map<string, TransactionRow[]>();
    for (const t of allTransactions) {
      const key = t.hostel ?? "Unknown";
      const bucket = map.get(key);
      if (bucket) bucket.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [allTransactions]);

  const getSplitTransactions = useCallback(
    (s: SplitRecord, monthFilter?: string): TransactionRow[] => {
      const from = new Date(s.dateFrom);
      from.setHours(0, 0, 0, 0);
      const to = s.dateTo ? new Date(s.dateTo) : new Date();
      to.setHours(23, 59, 59, 999);
      let txns = (transactionsByHostel.get(s.hostel) ?? []).filter(
        (t) => t.purchasedAt >= from && t.purchasedAt <= to,
      );
      if (monthFilter) {
        const [y, m] = monthFilter.split("-").map(Number);
        txns = txns.filter(
          (t) =>
            t.purchasedAt.getFullYear() === y &&
            t.purchasedAt.getMonth() + 1 === m,
        );
      }
      return txns.sort(
        (a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime(),
      );
    },
    [transactionsByHostel],
  );

  // Was an inline IIFE in the render body — recomputed on every render of the
  // Splits tab (e.g. just toggling a row's expand state), each pass doing a
  // `.reduce()` over every visible split. Memoized so it only reruns when the
  // inputs it actually depends on change.
  const splitsTotals = useMemo(() => {
    return filteredSplits.reduce(
      (acc, s) => {
        const txns = splitFilterMonth ? getSplitTransactions(s, splitFilterMonth) : getSplitTransactions(s);
        const gr = txns.reduce((a, t) => a + t.price, 0);
        const mPct = s.maintenancePct ?? maintenancePct;
        const splittable = Math.max(0, gr - Math.round((gr * mPct) / 100) - Math.round((gr * paystackPct) / 100));
        return {
          revenue: acc.revenue + gr,
          admin: acc.admin + Math.round((splittable * s.adminPercent) / 100),
          partner: acc.partner + Math.round((splittable * s.partnerPercent) / 100),
        };
      },
      { revenue: 0, admin: 0, partner: 0 },
    );
  }, [filteredSplits, splitFilterMonth, maintenancePct, paystackPct, getSplitTransactions]);

  const exportSplitLog = (
    s: SplitRecord,
    txns: TransactionRow[],
    periodLabel?: string,
  ) => {
    if (txns.length === 0) return;
    const mPct = s.maintenancePct ?? maintenancePct;
    const splittablePctExport = 100 - mPct - paystackPct;
    const grossRev = txns.reduce((a, t) => a + t.price, 0);
    const mainDed = Math.round((grossRev * mPct) / 100);
    const paystackDed = Math.round((grossRev * paystackPct) / 100);
    const splittableRev = grossRev - mainDed - paystackDed;
    const rows = txns.map((t) => ({
      Date: t.purchasedAt.toLocaleString(),
      "Plan Name": t.planName,
      "Plan Type": PLAN_TYPE_LABELS[t.planType] ?? t.planType,
      Hostel: t.hostel ?? "Unknown",
      "Customer Email": t.customerEmail ?? "N/A",
      "Payment Ref": t.paymentRef ?? "N/A",
      "Gross Price (₦)": t.price,
      [`Your Share ${s.adminPercent}% (₦)`]: Math.round(
        (t.price * s.adminPercent) / 100,
      ),
      [`Partner Share ${s.partnerPercent}% (₦)`]: Math.round(
        (t.price * s.partnerPercent) / 100,
      ),
    }));
    const period = s.isOpen
      ? `From ${s.dateFrom} (Ongoing)`
      : `${s.dateFrom} → ${s.dateTo}`;
    const summaryRows = [
      { Label: "Hostel", Value: s.hostel },
      { Label: "Period", Value: periodLabel ?? period },
      { Label: "Split", Value: `${s.adminPercent}% / ${s.partnerPercent}%` },
      { Label: "Total Transactions", Value: txns.length },
      { Label: "Gross Revenue (₦)", Value: grossRev },
      { Label: `Maintenance Deduction ${mPct}% (₦)`, Value: mainDed },
      { Label: `Paystack Deduction ${paystackPct}% (₦)`, Value: paystackDed },
      {
        Label: `Splittable Revenue ${splittablePctExport.toFixed(1)}% (₦)`,
        Value: splittableRev,
      },
      {
        Label: `Your Total ${s.adminPercent}% (₦)`,
        Value: Math.round((splittableRev * s.adminPercent) / 100),
      },
      {
        Label: `Partner Total ${s.partnerPercent}% (₦)`,
        Value: Math.round((splittableRev * s.partnerPercent) / 100),
      },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows),
      "Transactions",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "Summary",
    );
    const slug = periodLabel
      ? periodLabel.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : `${s.dateFrom}-to-${s.dateTo || "now"}`;
    XLSX.writeFile(wb, `split-log-${s.hostel}-${slug}.xlsx`);
  };

  const exportSplitsToExcel = () => {
    if (filteredSplits.length === 0) return;
    const rows = filteredSplits.map((s) => ({
      "Created At": s.createdAt.toLocaleString(),
      Hostel: s.hostel,
      "Period From": s.dateFrom,
      "Period To": s.dateTo,
      Transactions: s.transactionCount,
      "Total Revenue (₦)": s.totalRevenue,
      "Your % (Admin)": s.adminPercent,
      "Your Share (₦)": s.adminShare,
      "Partner %": s.partnerPercent,
      "Partner Share (₦)": s.partnerShare,
      Notes: s.notes ?? "",
    }));
    const totals = filteredSplits.reduce(
      (acc, s) => ({
        revenue: acc.revenue + s.totalRevenue,
        admin: acc.admin + s.adminShare,
        partner: acc.partner + s.partnerShare,
        count: acc.count + s.transactionCount,
      }),
      { revenue: 0, admin: 0, partner: 0, count: 0 },
    );
    const summaryRows = [
      { Label: "Total Splits Exported", Value: filteredSplits.length },
      { Label: "Total Transactions", Value: totals.count },
      { Label: "Total Revenue (₦)", Value: totals.revenue },
      { Label: "Your Total Earnings (₦)", Value: totals.admin },
      { Label: "Partner Total Earnings (₦)", Value: totals.partner },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Splits");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "Summary",
    );
    XLSX.writeFile(wb, `splits-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ProtectedRoute module='transactions'>
      <div className="min-h-screen analytics-shell">
        <header className="glass-header">
          <div className="flex items-center gap-3">
            <Logo variant="dark" />
            <div>
              <p className="eyebrow">TRANSACTIONS &amp; PAYOUTS</p>
              <h1 className="text-xl font-semibold sm:text-2xl">Transaction audit</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchAll();
                if (!isPartner) void fetchAllTransactions();
              }}
              disabled={loading}
              title="Refresh transactions"
              className="glass-button">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={handleLogout} className="glass-button hidden sm:inline-flex">
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

          {/* Tabs */}
          <div className="overflow-x-auto">
            <div className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/70 p-1 backdrop-blur-xl min-w-max">
              <button
                onClick={() => setActiveTab("transactions")}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:px-6 ${
                  activeTab === "transactions" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}>
                <BarChart3 size={16} />
                {isPartner ? "My Transactions" : "Transactions"}
              </button>
              {!isPartner && (
                <>
                  <button
                    onClick={() => setActiveTab("payouts")}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:px-6 ${
                      activeTab === "payouts" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                    }`}>
                    <Wallet size={16} />
                    Partner Payouts
                    {partners.length > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                          activeTab === "payouts" ? "bg-white/20 text-white" : "slate-chip"
                        }`}>
                        {partners.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("splits")}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:px-6 ${
                      activeTab === "splits" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                    }`}>
                    <Scissors size={16} />
                    Split Counter
                    {splitRecords.length > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                          activeTab === "splits" ? "bg-white/20 text-white" : "slate-chip"
                        }`}>
                        {splitRecords.length}
                      </span>
                    )}
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => setActiveTab("bot")}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:px-6 ${
                        activeTab === "bot" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                      }`}>
                      <Bot size={16} />
                      Bot Transactions
                      {botTxns.length > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                            activeTab === "bot" ? "bg-white/20 text-white" : "slate-chip"
                          }`}>
                          {botTxns.length}
                        </span>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── TRANSACTIONS TAB ─────────────────────────────────────────── */}
          {activeTab === "transactions" && (
            <>
              {/* Summary cards */}
              <div className="kpi-grid lg:grid-cols-4">
                {isPartner ? (
                  <>
                    <Kpi label="Transactions" tone="slate" value={loading ? "—" : totalTransactionsCount.toLocaleString()} />
                    <Kpi
                      label="Profit"
                      tone="purple"
                      value={loading ? "—" : `₦${totalPartnerShare.toLocaleString()}`}
                    />
                  </>
                ) : (
                  <>
                    <Kpi label="Total Transactions" tone="slate" value={loading ? "—" : totalTransactionsCount.toLocaleString()} />
                    <Kpi label="Total Revenue" tone="green" value={loading ? "—" : `₦${totalRevenue.toLocaleString()}`} />
                    <Kpi
                      label="Device Plans"
                      tone="blue"
                      value={loading ? "—" : filtered.filter((t) => t.planType === "device").length.toLocaleString()}
                    />
                    <Kpi
                      label="TV Plans"
                      tone="violet"
                      value={loading ? "—" : filtered.filter((t) => t.planType === "tv").length.toLocaleString()}
                    />
                  </>
                )}
              </div>

              {/* Per-controller breakdown — server-computed, unaffected by the
                  filters below (it reflects the whole ledger, not `filtered`).
                  Shown before Revenue by Hostel — the controller rollup is
                  the primary view. Collapsed by default: the grid below is
                  only rendered once expanded, not just hidden, so a long
                  controller list costs nothing until someone opens it. */}
              {!isPartner && !loading && byController.length > 0 && (
                <section className="glass-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">TRANSACTIONS</p>
                      <h3 className="flex items-center gap-2">
                        <Router size={18} className="text-blue-500" />
                        Revenue by controller
                      </h3>
                      {!showControllerRevenue && (
                        <p className="mt-1 text-xs text-slate-500">
                          ₦{byController.reduce((sum, row) => sum + row.revenue, 0).toLocaleString()} across {byController.length}{" "}
                          controller{byController.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowControllerRevenue((v) => !v)}
                      className="glass-icon !h-9 !w-9"
                      aria-expanded={showControllerRevenue}
                      title={showControllerRevenue ? "Collapse" : "Expand"}>
                      {showControllerRevenue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {showControllerRevenue && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {byController.map((row) => (
                        <div key={row.controllerId} className="glass-controller">
                          <p className="truncate text-sm font-medium text-slate-700">{row.controllerName}</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">₦{row.revenue.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">
                            {row.transactions} transaction{row.transactions !== 1 ? "s" : ""} ·{" "}
                            {row.hostelCount} hostel{row.hostelCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Per-hostel breakdown — same collapse-by-default treatment. */}
              {!isPartner && !loading && byHostel.length > 0 && (
                <section className="glass-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">TRANSACTIONS</p>
                      <h3 className="flex items-center gap-2">
                        <Building2 size={18} className="text-blue-500" />
                        Revenue by hostel
                      </h3>
                      {!showHostelRevenue && (
                        <p className="mt-1 text-xs text-slate-500">
                          ₦{totalRevenue.toLocaleString()} across {byHostel.length} hostel{byHostel.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowHostelRevenue((v) => !v)}
                      className="glass-icon !h-9 !w-9"
                      aria-expanded={showHostelRevenue}
                      title={showHostelRevenue ? "Collapse" : "Expand"}>
                      {showHostelRevenue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {showHostelRevenue && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {byHostel.map((row) => (
                        <div key={row.hostel} className="glass-controller">
                          <p className="truncate text-sm font-medium text-slate-700">{row.hostel}</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">₦{row.revenue.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">
                            {row.count} transaction{row.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Filters + Export */}
              <section className="glass-panel">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <div className="relative">
                      <Search className={GLASS_INPUT_ICON} />
                      <input
                        type="text"
                        placeholder="Search email, plan, ref…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`${GLASS_INPUT} pl-11`}
                      />
                    </div>
                    <select value={filterHostel} onChange={(e) => setFilterHostel(e.target.value)} className={GLASS_INPUT}>
                      <option value="all">All Hostels</option>
                      {knownHostels.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    {!isPartner && (
                      <select value={controllerFilter} onChange={(e) => setControllerFilter(e.target.value)} className={GLASS_INPUT}>
                        <option value="all">All Controllers</option>
                        {byController.map((row) => (
                          <option key={row.controllerId} value={row.controllerId}>
                            {row.controllerName}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      value={filterPlanType}
                      onChange={(e) => setFilterPlanType(e.target.value as typeof filterPlanType)}
                      className={GLASS_INPUT}>
                      <option value="all">All Plan Types</option>
                      <option value="device">Device Plan</option>
                      <option value="tv">TV Plan</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                    <select
                      value={filterPaymentSource}
                      onChange={(e) => setFilterPaymentSource(e.target.value as typeof filterPaymentSource)}
                      className={GLASS_INPUT}>
                      <option value="all">All Sources</option>
                      <option value="bot">Paid with Bot</option>
                      <option value="site">Paid on Site</option>
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        className={`${GLASS_INPUT} flex-1`}
                        title="Date from"
                      />
                      <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        className={`${GLASS_INPUT} flex-1`}
                        title="Date to"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                      {isPartner
                        ? `${totalTransactionsCount.toLocaleString()} transaction${totalTransactionsCount !== 1 ? "s" : ""} • ₦${totalPartnerShare.toLocaleString()} your share`
                        : `${totalTransactionsCount.toLocaleString()} transaction${totalTransactionsCount !== 1 ? "s" : ""} • ₦${totalRevenue.toLocaleString()} total`}
                      {hasMoreTransactions && (
                        <span className="ml-1 text-slate-400">
                          — showing the most recent {filtered.length.toLocaleString()} below
                        </span>
                      )}
                    </p>
                    <button
                      onClick={() => void exportToExcel()}
                      disabled={filtered.length === 0 || exporting}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                      <Download size={16} />
                      {exporting ? "Exporting…" : "Export Excel"}
                    </button>
                  </div>
                </div>
              </section>

              {/* Transactions table */}
              <section className="glass-panel !p-0">
                {loading ? (
                  <div className="py-16 text-center text-sm text-slate-400">Loading transactions…</div>
                ) : filtered.length === 0 ? (
                  <div className="py-16 text-center text-sm text-slate-400">No transactions match your filters.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/70">
                          <Th>Date</Th>
                          <Th>Plan</Th>
                          <Th>Type</Th>
                          <Th>Hostel</Th>
                          {!isPartner && (
                            <>
                              <Th>Source</Th>
                              <Th>Email</Th>
                              <Th>Ref</Th>
                            </>
                          )}
                          <Th align="right">{isPartner ? "Your Share" : "Amount"}</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/60">
                        {filtered.map((t) => (
                          <tr key={t.id} className="transition hover:bg-white/70">
                            <Td className="whitespace-nowrap">
                              {t.purchasedAt.toLocaleDateString("en-NG", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                              <br />
                              <span className="text-xs text-slate-400">
                                {t.purchasedAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </Td>
                            <Td className="font-medium text-slate-900">{t.planName}</Td>
                            <Td>
                              <PlanTypeBadge type={t.planType} />
                            </Td>
                            <Td>{t.hostel ?? <span className="text-slate-400">Unknown</span>}</Td>
                            {!isPartner && (
                              <>
                                <Td>
                                  {"paymentSource" in t && (t as DataPurchaseRow).paymentSource === "bot" ? (
                                    <span className="status-chip inline-flex items-center gap-1">
                                      <Smartphone size={12} />
                                      Bot
                                    </span>
                                  ) : (
                                    <span className="slate-chip">Site</span>
                                  )}
                                </Td>
                                <Td className="max-w-[180px] truncate">
                                  {t.customerEmail ?? <span className="text-slate-400">N/A</span>}
                                </Td>
                                <Td className="font-mono text-xs text-slate-500">
                                  {t.paymentRef ? (
                                    <span title={t.paymentRef}>
                                      {t.paymentRef.length > 14 ? t.paymentRef.slice(0, 14) + "…" : t.paymentRef}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </Td>
                              </>
                            )}
                            <Td align="right" className="whitespace-nowrap font-semibold text-slate-900">
                              ₦{(isPartner ? partnerShareFor(t) : t.price).toLocaleString()}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ── PARTNER PAYOUTS TAB (admin-only) ─────────────────────────── */}
          {!isPartner && activeTab === "payouts" && (
            <>
              {/* Period control */}
              <div className="flex flex-wrap items-center gap-3">
                <SegToggle
                  value={payoutMode}
                  onChange={setPayoutMode}
                  options={[
                    { value: "all", label: "All time" },
                    { value: "month", label: "By month" },
                  ]}
                />
                {payoutMode === "month" && (
                  <input
                    type="month"
                    value={payoutMonth}
                    onChange={(e) => setPayoutMonth(e.target.value)}
                    className={`${GLASS_INPUT} w-auto`}
                    aria-label="Payout month"
                  />
                )}
              </div>

              {/* Grand totals */}
              <div className="kpi-grid lg:grid-cols-4">
                <Kpi
                  label="Total to pay partners"
                  tone="purple"
                  value={loading ? "—" : `₦${payoutTotals.partnerTotal.toLocaleString()}`}
                  note={payoutMode === "all" ? "All time" : payoutMonth}
                />
                <Kpi
                  label="Your share from partnered hostels"
                  tone="slate"
                  value={loading ? "—" : `₦${payoutTotals.adminTotal.toLocaleString()}`}
                />
              </div>

              {/* Per-partner breakdown */}
              {partners.length === 0 ? (
                <section className="glass-panel text-center text-sm text-slate-500">
                  No partner accounts yet. Mark an admin as a partner (in Admin Management) to see their payouts here.
                </section>
              ) : (
                <div className="space-y-4">
                  {partnerPayouts.map((p) => (
                    <section key={p.id} className="glass-panel !p-0">
                      <div className="flex items-center justify-between gap-4 border-b border-white/70 p-5">
                        <div className="flex items-center gap-3">
                          <div className="controller-icon shrink-0 !bg-purple-100 !text-purple-600">
                            <Wallet size={18} />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{p.username}</p>
                            <p className="text-xs text-slate-500">
                              {p.mode === "perHostel" ? "Per-hostel split" : "Same split for all hostels"}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-slate-500">You pay</p>
                          <p className="text-xl font-bold text-purple-600">₦{p.totalCut.toLocaleString()}</p>
                        </div>
                      </div>

                      {p.rows.length === 0 ? (
                        <div className="p-5 text-sm text-slate-500">No revenue in this period.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/70">
                                <Th>Hostel</Th>
                                <Th align="right">Revenue</Th>
                                <Th align="right">Split</Th>
                                <Th align="right">Partner cut</Th>
                                <Th align="right">Your share</Th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/60">
                              {p.rows.map((r) => (
                                <tr key={r.hostelId}>
                                  <Td className="text-slate-900">{r.name}</Td>
                                  <Td align="right">₦{r.gross.toLocaleString()}</Td>
                                  <Td align="right" className="text-slate-500">
                                    {r.pct}%
                                  </Td>
                                  <Td align="right" className="font-semibold text-purple-600">
                                    ₦{r.cut.toLocaleString()}
                                  </Td>
                                  <Td align="right">₦{r.adminGain.toLocaleString()}</Td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/70 font-semibold text-slate-900">
                                <Td>Total</Td>
                                <Td align="right">₦{p.totalGross.toLocaleString()}</Td>
                                <Td>{""}</Td>
                                <Td align="right" className="text-purple-600">
                                  ₦{p.totalCut.toLocaleString()}
                                </Td>
                                <Td align="right">₦{p.adminGain.toLocaleString()}</Td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── BOT TRANSACTIONS TAB ─────────────────────────────────────── */}
          {isSuperAdmin && activeTab === "bot" && (
            <>
              {/* Filters: period + hostel */}
              <div className="flex flex-wrap items-center gap-3">
                <SegToggle
                  value={botPeriodMode}
                  onChange={setBotPeriodMode}
                  options={(["all", "day", "month", "year"] as const).map((m) => ({
                    value: m,
                    label: m === "all" ? "All time" : m[0].toUpperCase() + m.slice(1),
                  }))}
                />
                {botPeriodMode === "day" && (
                  <input
                    type="date"
                    value={botDay}
                    onChange={(e) => setBotDay(e.target.value)}
                    className={`${GLASS_INPUT} w-auto`}
                    aria-label="Day"
                  />
                )}
                {botPeriodMode === "month" && (
                  <input
                    type="month"
                    value={botMonth}
                    onChange={(e) => setBotMonth(e.target.value)}
                    className={`${GLASS_INPUT} w-auto`}
                    aria-label="Month"
                  />
                )}
                {botPeriodMode === "year" && (
                  <input
                    type="number"
                    value={botYear}
                    onChange={(e) => setBotYear(e.target.value)}
                    min="2020"
                    max="2100"
                    className={`${GLASS_INPUT} w-28`}
                    aria-label="Year"
                  />
                )}
                <select value={botHostel} onChange={(e) => setBotHostel(e.target.value)} className={`${GLASS_INPUT} w-auto`} aria-label="Hostel">
                  <option value="all">All hostels</option>
                  {knownHostels.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Headline cards */}
              <div className="kpi-grid lg:grid-cols-4">
                <Kpi label="Live 5% total" tone="green" value={loading ? "—" : `₦${botTotals.fee.toLocaleString()}`} note={botPeriodLabel} />
                <Kpi label="Gross collected" tone="slate" value={loading ? "—" : `₦${botTotals.gross.toLocaleString()}`} />
                <Kpi label="Transactions" tone="blue" value={loading ? "—" : botTotals.count.toLocaleString()} />
              </div>

              <section className="glass-panel !p-0">
                <div className="border-b border-white/70 px-5 py-3">
                  <h3 className="font-semibold text-slate-900">Payment scenarios</h3>
                  <p className="mt-1 text-xs text-slate-500">Partial payments, cancelled checkouts, and DVA/card fallback cases.</p>
                </div>
                {botScenarios.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">No unresolved bot payment scenarios recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/70">
                          <Th>Plan / Hostel</Th>
                          <Th>Status</Th>
                          <Th align="right">Paid / Required</Th>
                          <Th>Reason</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/60">
                        {botScenarios.slice(0, 100).map((s) => (
                          <tr key={s.id}>
                            <Td className="text-slate-900">
                              {s.planName}
                              <span className="block text-xs text-slate-500">{s.hostel}</span>
                            </Td>
                            <Td>
                              <span className="warning-chip">{s.status}</span>
                            </Td>
                            <Td align="right">
                              ₦{s.amountPaid.toLocaleString()} / ₦{s.amount.toLocaleString()}
                            </Td>
                            <Td>{s.fallbackReason || (s.amountRemaining ? `Remaining ₦${s.amountRemaining.toLocaleString()}` : "—")}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {botFiltered.length === 0 ? (
                <section className="glass-panel text-center text-sm text-slate-500">
                  No completed bot transactions for this filter yet.
                </section>
              ) : (
                <>
                  {/* Summaries: by hostel + by month */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <section className="glass-panel !p-0">
                      <div className="border-b border-white/70 px-5 py-3 font-semibold text-slate-900">By hostel</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/70">
                              <Th>Hostel</Th>
                              <Th align="right">Txns</Th>
                              <Th align="right">Gross</Th>
                              <Th align="right">5% total</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/60">
                            {botByHostel.map(([name, v]) => (
                              <tr key={name}>
                                <Td className="text-slate-900">{name}</Td>
                                <Td align="right">{v.count}</Td>
                                <Td align="right">₦{v.gross.toLocaleString()}</Td>
                                <Td align="right" className="font-semibold text-green-600">
                                  ₦{v.fee.toLocaleString()}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-white/70 font-semibold text-slate-900">
                              <Td>Total</Td>
                              <Td align="right">{botTotals.count}</Td>
                              <Td align="right">₦{botTotals.gross.toLocaleString()}</Td>
                              <Td align="right" className="text-green-600">
                                ₦{botTotals.fee.toLocaleString()}
                              </Td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </section>

                    <section className="glass-panel !p-0">
                      <div className="border-b border-white/70 px-5 py-3 font-semibold text-slate-900">By month</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/70">
                              <Th>Month</Th>
                              <Th align="right">Txns</Th>
                              <Th align="right">Gross</Th>
                              <Th align="right">5% total</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/60">
                            {botByMonth.map(([month, v]) => (
                              <tr key={month}>
                                <Td className="text-slate-900">{month}</Td>
                                <Td align="right">{v.count}</Td>
                                <Td align="right">₦{v.gross.toLocaleString()}</Td>
                                <Td align="right" className="font-semibold text-green-600">
                                  ₦{v.fee.toLocaleString()}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>

                  {/* Transaction list */}
                  <section className="glass-panel !p-0">
                    <div className="border-b border-white/70 px-5 py-3 font-semibold text-slate-900">Transactions</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/70">
                            <Th>Date</Th>
                            <Th>Plan</Th>
                            <Th>Hostel</Th>
                            <Th>Method</Th>
                            <Th align="right">Gross</Th>
                            <Th align="right">5% charge</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/60">
                          {botFiltered.map((t) => (
                            <tr key={t.id}>
                              <Td className="whitespace-nowrap">{t.completedAt ? new Date(t.completedAt).toLocaleString() : "—"}</Td>
                              <Td className="text-slate-900">{t.planName}</Td>
                              <Td>{t.hostel || "—"}</Td>
                              <Td className="text-xs uppercase text-slate-500">{t.paymentMethod || "—"}</Td>
                              <Td align="right">₦{t.gross.toLocaleString()}</Td>
                              <Td align="right" className="font-semibold text-green-600">
                                ₦{t.fee.toLocaleString()}
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {/* ── SPLITS TAB ───────────────────────────────────────────────── */}
          {activeTab === "splits" && (
            <>
              {splitsError && (
                <div className="glass-alert">
                  <AlertTriangle size={18} />
                  {splitsError}
                </div>
              )}
              {splitSuccess && (
                <div className="glass-alert border-emerald-200 bg-emerald-50/90 text-emerald-800">
                  <AlertTriangle size={18} />
                  {splitSuccess}
                </div>
              )}

              {/* Create Split form */}
              {canEdit && !isPartner && (
                <section className="glass-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">SPLITS</p>
                      <h3 className="flex items-center gap-2">
                        <Plus size={18} className="text-blue-500" />
                        Create new split
                      </h3>
                    </div>
                  </div>
                  {/* Deductions info banner — maintenance % editable. .glass-alert
                      is already amber/orange by default, a direct fit here. */}
                  <div className="glass-alert mb-5 flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      🔧 Maintenance:
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={splitMaintenancePct}
                        onChange={(e) => setSplitMaintenancePct(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-14 rounded-lg border border-amber-300/60 bg-white/70 px-1.5 py-0.5 text-center font-bold text-amber-900 backdrop-blur-xl focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                      %
                    </span>
                    <span className="opacity-40">|</span>
                    <span>
                      💳 Paystack: <span className="font-bold">{paystackPct}%</span>
                    </span>
                    <span className="opacity-40">|</span>
                    <span className="text-emerald-700">
                      ✓ Available:{" "}
                      <span className="font-bold">
                        {typeof splitMaintenancePct === "number" ? (100 - splitMaintenancePct - paystackPct).toFixed(1) : "—"}%
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hostel</label>
                      <select value={splitHostel} onChange={(e) => setSplitHostel(e.target.value)} className={GLASS_INPUT}>
                        <option value="">Select hostel…</option>
                        {knownHostels.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Split Type</label>
                      <SegToggle
                        value={splitIsOpen ? "open" : "fixed"}
                        onChange={(v) => setSplitIsOpen(v === "open")}
                        options={[
                          { value: "fixed", label: "Fixed Period" },
                          { value: "open", label: "Ongoing ●" },
                        ]}
                        activeClass={splitIsOpen ? "bg-emerald-500 text-white shadow-sm" : "bg-blue-500 text-white shadow-sm"}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {splitIsOpen ? "Count From" : "Period From"}
                      </label>
                      <input
                        type="date"
                        value={splitDateFrom}
                        onChange={(e) => setSplitDateFrom(e.target.value)}
                        className={GLASS_INPUT}
                      />
                    </div>
                    {!splitIsOpen && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Period To</label>
                        <input
                          type="date"
                          value={splitDateTo}
                          onChange={(e) => setSplitDateTo(e.target.value)}
                          className={GLASS_INPUT}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Your Share (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={splitAdminPct}
                        onChange={(e) => {
                          const v = e.target.value === "" ? "" : Number(e.target.value);
                          setSplitAdminPct(v);
                          if (typeof v === "number" && v >= 0 && v <= 100) setSplitPartnerPct(100 - v);
                        }}
                        className={GLASS_INPUT}
                        placeholder="50"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Partner&apos;s Share (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={splitPartnerPct}
                        onChange={(e) => {
                          const v = e.target.value === "" ? "" : Number(e.target.value);
                          setSplitPartnerPct(v);
                          if (typeof v === "number" && v >= 0 && v <= 100) setSplitAdminPct(100 - v);
                        }}
                        className={GLASS_INPUT}
                        placeholder="50"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Notes (optional)</label>
                      <input
                        type="text"
                        value={splitNotes}
                        onChange={(e) => setSplitNotes(e.target.value)}
                        placeholder="e.g. March 2026 split"
                        className={GLASS_INPUT}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Your Email (reports)</label>
                      <input
                        type="email"
                        value={splitAdminEmail}
                        onChange={(e) => setSplitAdminEmail(e.target.value)}
                        placeholder="your@email.com"
                        className={GLASS_INPUT}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Partner Email (reports)</label>
                      <input
                        type="email"
                        value={splitPartnerEmail}
                        onChange={(e) => setSplitPartnerEmail(e.target.value)}
                        placeholder="partner@email.com"
                        className={GLASS_INPUT}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Monthly Report Email</label>
                      <label className={`flex cursor-pointer items-center gap-3 ${GLASS_INPUT} hover:bg-white/90`}>
                        <div className="relative shrink-0">
                          <input
                            type="checkbox"
                            checked={splitSendMonthlyEmail}
                            onChange={(e) => setSplitSendMonthlyEmail(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`h-6 w-10 rounded-full transition-colors ${splitSendMonthlyEmail ? "bg-blue-500" : "bg-slate-300"}`} />
                          <div
                            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${splitSendMonthlyEmail ? "left-5" : "left-1"}`}
                          />
                        </div>
                        <span className="text-sm text-slate-700">{splitSendMonthlyEmail ? "Enabled — send monthly" : "Disabled"}</span>
                      </label>
                    </div>
                  </div>

                  {/* Live preview */}
                  {splitPreview && (
                    <div className="mt-5 rounded-2xl bg-white/60 p-4">
                      {splitPreview.count === 0 ? (
                        <p className="py-2 text-center text-sm text-slate-500">No transactions found for this hostel and period.</p>
                      ) : (
                        <>
                          {/* Deduction pipeline chips */}
                          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                            <span className="glass-slate rounded-full px-2.5 py-1 font-semibold">
                              Gross ₦{splitPreview.totalRevenue.toLocaleString()}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="glass-red rounded-full px-2.5 py-1 font-semibold">
                              −₦{splitPreview.maintenanceDeduction.toLocaleString()} Maint.
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="glass-orange rounded-full px-2.5 py-1 font-semibold">
                              −₦{splitPreview.paystackDeduction.toLocaleString()} Paystack
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="glass-green rounded-full px-2.5 py-1 font-bold">
                              ✓ ₦{splitPreview.splittableRevenue.toLocaleString()} Splittable
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <div>
                              <p className="text-xs text-slate-500">Transactions</p>
                              <p className="text-2xl font-bold text-slate-900">{splitPreview.count}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Splittable Revenue</p>
                              <p className="text-2xl font-bold text-emerald-700">₦{splitPreview.splittableRevenue.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Your Share ({splitAdminPct}%)</p>
                              <p className="text-2xl font-bold text-blue-600">₦{splitPreview.adminShare.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Partner Share ({splitPartnerPct}%)</p>
                              <p className="text-2xl font-bold text-purple-600">₦{splitPreview.partnerShare.toLocaleString()}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex justify-end">
                    <button
                      onClick={handleCreateSplit}
                      disabled={creatingSplit || !splitHostel || !splitDateFrom || (!splitIsOpen && !splitDateTo)}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                      <Scissors size={16} />
                      {creatingSplit ? "Saving…" : "Save Split"}
                    </button>
                  </div>
                </section>
              )}

              {/* Splits history */}
              <section className="glass-panel">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <BarChart3 size={18} className="text-blue-500" />
                    Splits History
                    <span className="ml-1 text-sm font-normal text-slate-500">({filteredSplits.length})</span>
                  </h3>
                  <div className="flex flex-wrap gap-3 sm:ml-auto">
                    <select
                      value={splitFilterHostel}
                      onChange={(e) => setSplitFilterHostel(e.target.value)}
                      className={`${GLASS_INPUT} w-auto`}>
                      <option value="all">All Hostels</option>
                      {knownHostels.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={splitFilterMonth}
                      onChange={(e) => {
                        setSplitFilterMonth(e.target.value);
                        if (e.target.value) {
                          setSplitFilterFrom("");
                          setSplitFilterTo("");
                        }
                      }}
                      className={`${GLASS_INPUT} w-auto`}>
                      <option value="">All Months</option>
                      {Array.from({ length: 18 }, (_, i) => {
                        const d = new Date();
                        d.setDate(1);
                        d.setMonth(d.getMonth() - i);
                        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                        const label = d.toLocaleDateString("en-NG", { month: "long", year: "numeric" });
                        return (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    {!splitFilterMonth && (
                      <>
                        <input
                          type="date"
                          value={splitFilterFrom}
                          onChange={(e) => setSplitFilterFrom(e.target.value)}
                          title="Created from"
                          className={`${GLASS_INPUT} w-auto`}
                        />
                        <input
                          type="date"
                          value={splitFilterTo}
                          onChange={(e) => setSplitFilterTo(e.target.value)}
                          title="Created to"
                          className={`${GLASS_INPUT} w-auto`}
                        />
                      </>
                    )}
                    {!isPartner && (
                      <button
                        onClick={exportSplitsToExcel}
                        disabled={filteredSplits.length === 0}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                        <Download size={16} />
                        Export Excel
                      </button>
                    )}
                  </div>
                </div>

                {splitsLoading ? (
                  <div className="py-12 text-center text-sm text-slate-400">Loading splits…</div>
                ) : filteredSplits.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    {isPartner ? "No splits yet." : "No splits yet. Create one above."}
                  </div>
                ) : (
                  <>
                    {/* Totals summary */}
                    {(() => {
                      const activeMonthLabel = splitFilterMonth
                        ? new Date(splitFilterMonth + "-01").toLocaleDateString("en-NG", { month: "long", year: "numeric" })
                        : "";
                      return (
                        <div className={`mb-5 grid grid-cols-2 gap-3 ${isPartner ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
                          <div className="stat">
                            <p className="stat-label">Splits Shown</p>
                            <p className="stat-value">{filteredSplits.length}</p>
                          </div>
                          {!isPartner && (
                            <div className="stat">
                              <p className="stat-label">{splitFilterMonth ? `Revenue — ${activeMonthLabel}` : "Total Revenue"}</p>
                              <p className="stat-value">₦{splitsTotals.revenue.toLocaleString()}</p>
                            </div>
                          )}
                          {!isPartner && (
                            <div className="rounded-2xl bg-blue-50/70 px-3 py-3">
                              <p className="text-[11px] font-medium text-blue-600">
                                {splitFilterMonth ? `Your Share — ${activeMonthLabel}` : "Your Total"}
                              </p>
                              <p className="mt-1 text-lg font-semibold tracking-tight text-blue-700">₦{splitsTotals.admin.toLocaleString()}</p>
                            </div>
                          )}
                          <div className="rounded-2xl bg-purple-50/70 px-3 py-3">
                            <p className="text-[11px] font-medium text-purple-600">
                              {splitFilterMonth ? `Partner Share — ${activeMonthLabel}` : "Partner Total"}
                            </p>
                            <p className="mt-1 text-lg font-semibold tracking-tight text-purple-700">₦{splitsTotals.partner.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/70">
                            <Th>Created</Th>
                            <Th>Hostel</Th>
                            <Th>Period</Th>
                            <Th align="center">Txns</Th>
                            {!isPartner && (
                              <Th align="right">
                                Revenue
                                {splitFilterMonth && (
                                  <span className="ml-1 normal-case font-normal text-blue-500">
                                    ({new Date(splitFilterMonth + "-01").toLocaleDateString("en-NG", { month: "short", year: "numeric" })})
                                  </span>
                                )}
                              </Th>
                            )}
                            {!isPartner && <Th align="right">Your Share</Th>}
                            <Th align="right">Partner Share</Th>
                            <Th>Notes</Th>
                            <th className="px-5 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/60">
                          {filteredSplits.map((s) => {
                            const allSplitTxns = getSplitTransactions(s);
                            // Default expanded panel month to the active list filter month (unless manually overridden)
                            const activeMonth =
                              expandedSplitMonths[s.id] ??
                              (splitFilterMonth || "");
                            const displayTxns = activeMonth
                              ? allSplitTxns.filter((t) => {
                                  const [y, m] = activeMonth
                                    .split("-")
                                    .map(Number);
                                  return (
                                    t.purchasedAt.getFullYear() === y &&
                                    t.purchasedAt.getMonth() + 1 === m
                                  );
                                })
                              : allSplitTxns;
                            const sMaintPct =
                              s.maintenancePct ?? maintenancePct;
                            // Row revenue: use month-filtered transactions when list filter is active
                            const rowTxns = splitFilterMonth
                              ? getSplitTransactions(s, splitFilterMonth)
                              : allSplitTxns;
                            const grossRev = rowTxns.reduce(
                              (a, t) => a + t.price,
                              0,
                            );
                            const mainDed = Math.round(
                              (grossRev * sMaintPct) / 100,
                            );
                            const paystackDed = Math.round(
                              (grossRev * paystackPct) / 100,
                            );
                            const splittableRev =
                              grossRev - mainDed - paystackDed;
                            const splittablePctRow =
                              100 - sMaintPct - paystackPct;
                            const adminShr = Math.round(
                              (splittableRev * s.adminPercent) / 100,
                            );
                            const partnerShr = Math.round(
                              (splittableRev * s.partnerPercent) / 100,
                            );
                            const isExpanded = expandedSplitId === s.id;
                            const activeMonthLabel = activeMonth
                              ? new Date(
                                  activeMonth + "-01",
                                ).toLocaleDateString("en-NG", {
                                  month: "long",
                                  year: "numeric",
                                })
                              : "";
                            const periodLabel = s.isOpen
                              ? activeMonth
                                ? activeMonthLabel
                                : `From ${s.dateFrom} (Ongoing)`
                              : activeMonth
                                ? activeMonthLabel
                                : `${s.dateFrom} → ${s.dateTo}`;
                            return (
                              <React.Fragment key={s.id}>
                                <tr className={`transition-colors ${isExpanded ? "bg-blue-50/60 backdrop-blur-sm" : "hover:bg-white/70"}`}>
                                  <Td className="whitespace-nowrap">
                                    {s.createdAt.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                                  </Td>
                                  <Td className="font-medium text-slate-900">{s.hostel}</Td>
                                  <Td className="whitespace-nowrap text-xs">
                                    {s.isOpen ? (
                                      <span className="flex items-center gap-1.5">
                                        From {s.dateFrom}
                                        <span className="status-chip">● Live</span>
                                      </span>
                                    ) : (
                                      <>
                                        {s.dateFrom} → {s.dateTo}
                                      </>
                                    )}
                                  </Td>
                                  <Td align="center">{rowTxns.length}</Td>
                                  {!isPartner && (
                                    <Td align="right" className="whitespace-nowrap font-semibold text-slate-900">
                                      ₦{grossRev.toLocaleString()}
                                    </Td>
                                  )}
                                  {!isPartner && (
                                    <Td align="right" className="whitespace-nowrap">
                                      <span className="text-sm font-semibold text-blue-600">₦{adminShr.toLocaleString()}</span>
                                      <span className="ml-1 text-xs text-slate-400">({s.adminPercent}%)</span>
                                    </Td>
                                  )}
                                  <Td align="right" className="whitespace-nowrap">
                                    <span className="text-sm font-semibold text-purple-600">₦{partnerShr.toLocaleString()}</span>
                                    {!isPartner && <span className="ml-1 text-xs text-slate-400">({s.partnerPercent}%)</span>}
                                  </Td>
                                  <Td className="max-w-[140px] truncate">{s.notes || <span className="text-slate-300">—</span>}</Td>
                                  <Td>
                                    {!isPartner && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => setExpandedSplitId(isExpanded ? null : s.id)}
                                          className={`rounded-lg p-1.5 transition-colors ${
                                            isExpanded ? "bg-blue-100 text-blue-500" : "text-slate-400 hover:bg-blue-50 hover:text-blue-500"
                                          }`}
                                          title={isExpanded ? "Hide transaction log" : "View transaction log"}>
                                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        {canEdit && (
                                          <button
                                            onClick={() =>
                                              setConfirmModal({
                                                isOpen: true,
                                                title: "Delete this split?",
                                                message: `This permanently deletes the ${s.hostel} split (${periodLabel}). This can't be undone.`,
                                                onConfirm: () => handleDeleteSplit(s.id),
                                              })
                                            }
                                            disabled={deletingSplit === s.id}
                                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                            title="Delete split">
                                            <Trash2 size={16} />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </Td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={9} className="border-b border-blue-100 px-0 py-0">
                                      <div className="space-y-4 bg-blue-50/60 px-5 py-4 backdrop-blur-sm">
                                        {/* Deductions summary bar — same pipeline-chip idiom as the create-form preview */}
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                          <span className="glass-slate rounded-full px-2.5 py-1 font-semibold">
                                            Gross ₦{grossRev.toLocaleString()}
                                          </span>
                                          <span className="text-slate-400">→</span>
                                          <span className="glass-red rounded-full px-2.5 py-1 font-semibold">
                                            −₦{mainDed.toLocaleString()} Maint. {sMaintPct}%
                                          </span>
                                          <span className="text-slate-400">→</span>
                                          <span className="glass-orange rounded-full px-2.5 py-1 font-semibold">
                                            −₦{paystackDed.toLocaleString()} Paystack {paystackPct}%
                                          </span>
                                          <span className="text-slate-400">→</span>
                                          <span className="glass-green rounded-full px-2.5 py-1 font-bold">
                                            ✓ ₦{splittableRev.toLocaleString()} Splittable {splittablePctRow.toFixed(1)}%
                                          </span>
                                        </div>
                                        {/* Month filter + Export */}
                                        <div className="flex flex-wrap items-center gap-3">
                                          <select
                                            value={expandedSplitMonths[s.id] ?? ""}
                                            onChange={(e) => setExpandedSplitMonths((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                            className={`${GLASS_INPUT} w-auto`}>
                                            <option value="">All time ({allSplitTxns.length} txns)</option>
                                            {getMonthOptions(s).map((opt) => (
                                              <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                          <button
                                            onClick={() => exportSplitLog(s, displayTxns, activeMonth ? activeMonthLabel : undefined)}
                                            disabled={displayTxns.length === 0}
                                            className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition-colors hover:bg-white disabled:opacity-50">
                                            <Download size={14} />
                                            Export Log
                                          </button>
                                        </div>
                                        {/* Monthly revenue summary — shown only when a month is selected */}
                                        {activeMonth &&
                                          (() => {
                                            const mGross = displayTxns.reduce(
                                              (a, t) => a + t.price,
                                              0,
                                            );
                                            const mMainDed = Math.round(
                                              (mGross * sMaintPct) / 100,
                                            );
                                            const mPayDed = Math.round(
                                              (mGross * paystackPct) / 100,
                                            );
                                            const mSplittable = Math.max(
                                              0,
                                              mGross - mMainDed - mPayDed,
                                            );
                                            const mAdminShr = Math.round(
                                              (mSplittable * s.adminPercent) /
                                                100,
                                            );
                                            const mPartnerShr = Math.round(
                                              (mSplittable * s.partnerPercent) /
                                                100,
                                            );
                                            return (
                                              <div className="grid grid-cols-2 gap-3 px-1 sm:grid-cols-3 lg:grid-cols-6">
                                                <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-xl">
                                                  <p className="mb-0.5 text-xs text-slate-400">Transactions</p>
                                                  <p className="text-lg font-bold text-slate-900">{displayTxns.length}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-xl">
                                                  <p className="mb-0.5 text-xs text-slate-400">Gross Revenue</p>
                                                  <p className="text-lg font-bold text-slate-900">₦{mGross.toLocaleString()}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/70 bg-red-50/70 px-3 py-2.5 shadow-sm backdrop-blur-xl">
                                                  <p className="mb-0.5 text-xs text-red-400">−Maint. {sMaintPct}%</p>
                                                  <p className="text-lg font-bold text-red-600">−₦{mMainDed.toLocaleString()}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/70 bg-orange-50/70 px-3 py-2.5 shadow-sm backdrop-blur-xl">
                                                  <p className="mb-0.5 text-xs text-orange-400">−Paystack {paystackPct}%</p>
                                                  <p className="text-lg font-bold text-orange-600">−₦{mPayDed.toLocaleString()}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/70 bg-blue-50/70 px-3 py-2.5 shadow-sm backdrop-blur-xl">
                                                  <p className="mb-0.5 text-xs text-blue-500">Your Share ({s.adminPercent}%)</p>
                                                  <p className="text-lg font-bold text-blue-700">₦{mAdminShr.toLocaleString()}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/70 bg-purple-50/70 px-3 py-2.5 shadow-sm backdrop-blur-xl">
                                                  <p className="mb-0.5 text-xs text-purple-500">Partner Share ({s.partnerPercent}%)</p>
                                                  <p className="text-lg font-bold text-purple-700">₦{mPartnerShr.toLocaleString()}</p>
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        {/* Email section — write permission required */}
                                        {canEdit && (
                                          <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl">
                                            {/* Quick-send buttons for stored emails */}
                                            {(s.adminEmail || s.partnerEmail) && (
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs font-semibold text-slate-500">Quick send:</span>
                                                {s.adminEmail && (
                                                  <button
                                                    onClick={() => handleSendSplitEmail(s, displayTxns, s.adminEmail!, periodLabel)}
                                                    disabled={sendingEmail}
                                                    className="glass-blue flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95 disabled:opacity-50">
                                                    <Mail size={12} />
                                                    To Me ({s.adminEmail.split("@")[0]})
                                                  </button>
                                                )}
                                                {s.partnerEmail && (
                                                  <button
                                                    onClick={() => handleSendSplitEmail(s, displayTxns, s.partnerEmail!, periodLabel)}
                                                    disabled={sendingEmail}
                                                    className="glass-purple flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95 disabled:opacity-50">
                                                    <Mail size={12} />
                                                    To Partner ({s.partnerEmail.split("@")[0]})
                                                  </button>
                                                )}
                                                {s.sendMonthlyEmail && <span className="status-chip">Monthly emails on</span>}
                                              </div>
                                            )}
                                            {/* Manual email input */}
                                            <div className="flex flex-wrap items-center gap-3">
                                              <Mail size={16} className="shrink-0 text-slate-400" />
                                              <input
                                                type="email"
                                                placeholder="Send to any email…"
                                                value={emailSplitId === s.id ? emailAddress : ""}
                                                onFocus={() => {
                                                  setEmailSplitId(s.id);
                                                  setEmailSuccess("");
                                                }}
                                                onChange={(e) => {
                                                  setEmailSplitId(s.id);
                                                  setEmailAddress(e.target.value);
                                                }}
                                                className={`${GLASS_INPUT} min-w-[200px] flex-1`}
                                              />
                                              <button
                                                onClick={() =>
                                                  handleSendSplitEmail(s, displayTxns, emailSplitId === s.id ? emailAddress : "", periodLabel)
                                                }
                                                disabled={sendingEmail || !(emailSplitId === s.id && emailAddress.trim())}
                                                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                                                <Mail size={14} />
                                                {sendingEmail && emailSplitId === s.id ? "Sending…" : "Send"}
                                              </button>
                                              {emailSuccess && emailSplitId === s.id && (
                                                <span className="text-xs font-semibold text-emerald-600">{emailSuccess}</span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {/* Transaction table header */}
                                        <p className="text-sm font-semibold text-slate-800">
                                          Transaction Log — <span className="text-blue-600">{s.hostel}</span>
                                          <span className="ml-2 text-xs font-normal text-slate-500">{periodLabel}</span>
                                          <span className="ml-2 text-xs font-normal text-slate-500">
                                            ({displayTxns.length} transaction{displayTxns.length !== 1 ? "s" : ""})
                                          </span>
                                        </p>
                                        {displayTxns.length === 0 ? (
                                          <p className="py-4 text-center text-sm text-slate-400">No transactions found for this period.</p>
                                        ) : (
                                          <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/70 shadow-sm backdrop-blur-xl">
                                            <table className="w-full">
                                              <thead>
                                                <tr className="border-b border-white/70">
                                                  <Th>Date</Th>
                                                  <Th>Plan</Th>
                                                  <Th>Type</Th>
                                                  <Th>Email</Th>
                                                  <Th>Ref</Th>
                                                  <Th align="right">Total</Th>
                                                  <Th align="right">Yours ({s.adminPercent}%)</Th>
                                                  <Th align="right">Partner ({s.partnerPercent}%)</Th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-white/60">
                                                {displayTxns.map((t) => (
                                                  <tr key={t.id} className="transition hover:bg-white/70">
                                                    <Td className="whitespace-nowrap text-xs">
                                                      {t.purchasedAt.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                                                      <br />
                                                      <span className="text-slate-400">
                                                        {t.purchasedAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                                                      </span>
                                                    </Td>
                                                    <Td className="text-xs font-medium text-slate-900">{t.planName}</Td>
                                                    <Td>
                                                      <PlanTypeBadge type={t.planType} />
                                                    </Td>
                                                    <Td className="max-w-[160px] truncate text-xs">
                                                      {t.customerEmail ?? <span className="text-slate-400">N/A</span>}
                                                    </Td>
                                                    <Td className="font-mono text-xs text-slate-500">
                                                      {t.paymentRef ? (
                                                        <span title={t.paymentRef}>
                                                          {t.paymentRef.length > 14 ? t.paymentRef.slice(0, 14) + "…" : t.paymentRef}
                                                        </span>
                                                      ) : (
                                                        <span className="text-slate-400">—</span>
                                                      )}
                                                    </Td>
                                                    <Td align="right" className="whitespace-nowrap text-xs font-semibold text-slate-900">
                                                      ₦{t.price.toLocaleString()}
                                                    </Td>
                                                    <Td align="right" className="whitespace-nowrap text-xs font-semibold text-blue-600">
                                                      ₦{Math.round((t.price * s.adminPercent) / 100).toLocaleString()}
                                                    </Td>
                                                    <Td align="right" className="whitespace-nowrap text-xs font-semibold text-purple-600">
                                                      ₦{Math.round((t.price * s.partnerPercent) / 100).toLocaleString()}
                                                    </Td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </main>

        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal((m) => ({ ...m, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText="Delete split"
          type="danger"
        />
      </div>
    </ProtectedRoute>
  );
}
