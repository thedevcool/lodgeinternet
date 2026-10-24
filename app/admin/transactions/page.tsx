"use client";
import { adminFetch } from "@/lib/apiClient";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import ConfirmationModal from "@/components/ConfirmationModal";
import SiteSubaccountCheck from "@/components/admin/SiteSubaccountCheck";
import {
  AdminPage,
  GLASS_INPUT,
  GLASS_INPUT_ICON,
  IconButton,
  Kpi,
  MobileCard,
  Modal,
  Panel,
  ResponsiveTable,
  SegToggle,
  TabBar,
  Td,
  Th,
  type Column,
} from "@/components/admin/ui";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Landmark,
  LockKeyhole,
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
// The Excel library is loaded only when something is exported (`loadXlsx`),
// not with the page: it is large and most visits never export.
const loadXlsx = () => import("xlsx");
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

interface ReserveAllocation {
  id: string;
  source: string;
  transactionId: string;
  planName: string;
  hostel: string;
  grossNaira: number;
  reserveKobo: number;
  occurredAt: string | null;
}

interface WithdrawalRecord {
  id: string;
  amountKobo: number;
  provider: string;
  status: string;
  reference: string;
  createdAt: string;
  error?: string;
}

interface Bank {
  name: string;
  code: string;
}

interface ReserveState {
  reservePercent: number;
  allocations: ReserveAllocation[];
  totalAllocatedKobo: number;
  totalWithdrawnKobo: number;
  availableKobo: number;
  withdrawableKobo: number;
  bank: { accountName: string; bankName: string; bankCode: string; accountNumberMasked: string } | null;
  provider: string;
  pinConfigured: boolean;
  withdrawals: WithdrawalRecord[];
  /** The Paystack subaccount bot payments split the reserve to. "admin" when
      created from this tab; "env" when set by PAYSTACK_BOT_RESERVE_SUBACCOUNT_CODE. */
  reserveSubaccount: {
    code: string;
    source: "admin" | "env";
    bankName?: string;
    accountName?: string;
    accountNumberMasked?: string;
    percentageCharge?: number;
    createdAt?: string;
    matchesSavedBank: boolean | null;
  } | null;
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

// ── Page-only presentation helpers. The shared glass pieces (Kpi, Th, Td,
// SegToggle, GLASS_INPUT, …) come from components/admin/ui. ──

function formatDay(d: Date) {
  return d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

function isBotRow(t: TransactionRow) {
  return "paymentSource" in t && (t as DataPurchaseRow).paymentSource === "bot";
}

function SourceChip({ t }: { t: TransactionRow }) {
  return isBotRow(t) ? (
    <span className="status-chip inline-flex items-center gap-1">
      <Smartphone size={12} />
      Bot
    </span>
  ) : (
    <span className="slate-chip">Site</span>
  );
}

/**
 * A payment reference you can tap to copy. The full value used to live only
 * in a hover `title`, which a phone can't reach; `full` prints it whole (for
 * cards), otherwise it's shortened to 14 characters as the table always was.
 */
function CopyRef({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const shown = full ? value : value.length > 14 ? value.slice(0, 14) + "…" : value;
  return (
    <button
      type="button"
      title={value}
      aria-label={`Copy payment reference ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      className="inline-flex min-h-[40px] max-w-full items-center gap-1.5 text-left font-mono text-xs text-slate-500 transition hover:text-slate-800">
      <span className={full ? "min-w-0 break-all" : "whitespace-nowrap"}>{shown}</span>
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-600" />
      ) : (
        <Copy size={12} className="shrink-0 opacity-60" />
      )}
    </button>
  );
}

/** A full-width labelled line inside a MobileCard (for long values). */
function CardLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <div className="min-w-0 break-words text-slate-700">{children}</div>
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
        const res = await adminFetch("/api/admin/split-config");
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.maintenancePct === "number") setMaintenancePct(data.maintenancePct);
        if (typeof data.paystackPct === "number") setPaystackPct(data.paystackPct);
      } catch {
        /* the shipped fallbacks stand in; the backend still computes the real split */
      }
    })();
  }, []);

  const { canWrite, adminProfile } = useAuthStore();
  const isPartner = adminProfile?.isPartner ?? false;
  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;
  const canEdit = canWrite("transactions");
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
  const isHostelRestricted =
    !!adminProfile?.hostels?.length && !adminProfile.isSuperAdmin;
  /**
   * Whether a row's hostel is one this admin may see.
   *
   * The backend has already scoped every response — `list_transactions`
   * narrows the Firestore query itself to `admin.hostels`, and that is the
   * check that actually enforces anything, since nothing in the browser can
   * be trusted to. What follows is a second, belt-and-braces pass.
   *
   * It must therefore never be the reason the page looks empty. The names it
   * compares against come from `/api/hostels`, which loads separately and is
   * allowed to fail quietly — and an empty set used as a filter hides every
   * single row. A superadmin never saw that, because the check is skipped
   * for them; a hostel-restricted subadmin saw an empty ledger. So: when we
   * do not yet know the allowed names, defer to the server rather than hide
   * everything.
   */
  const withinHostelScope = useCallback(
    (name: string) =>
      !isHostelRestricted ||
      allowedHostelNames.size === 0 ||
      allowedHostelNames.has(name),
    [isHostelRestricted, allowedHostelNames],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "transactions" | "splits" | "payouts" | "reserve"
  >("transactions");

  const [reserveState, setReserveState] = useState<ReserveState | null>(null);
  const [reservePeriod, setReservePeriod] = useState<"all" | "day" | "month" | "year">("month");
  // Which month "month" means, when it isn't the current one — lets an admin
  // browse the reserve as it stood in a past month, same control as Payouts.
  const [reserveMonth, setReserveMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveError, setReserveError] = useState("");
  const [pin, setPin] = useState("");
  const [bankForm, setBankForm] = useState({ accountName: "", accountNumber: "", bankName: "", bankCode: "" });
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  // Account name comes from Paystack's own records, not the keyboard: "idle"
  // before a bank + 10-digit number are both in, "checking"/"resolved" while
  // and after that lookup runs, "failed" only if Paystack couldn't verify it,
  // in which case the name field opens up for manual entry as a last resort.
  const [resolveStatus, setResolveStatus] = useState<"idle" | "checking" | "resolved" | "failed">("idle");
  const [resolveError, setResolveError] = useState("");
  const [manualName, setManualName] = useState(false);
  const [subaccountPin, setSubaccountPin] = useState("");
  // "Forgot PIN?": a new PIN, confirmed with the superadmin's sign-in password.
  const [pinResetOpen, setPinResetOpen] = useState(false);
  const [pinResetPassword, setPinResetPassword] = useState("");
  const [pinResetPin, setPinResetPin] = useState("");
  const [pinResetError, setPinResetError] = useState("");
  const [pinResetSaving, setPinResetSaving] = useState(false);
  const [pinResetDone, setPinResetDone] = useState(false);
  const [reserveActionLoading, setReserveActionLoading] = useState(false);

  // ── Partner Payouts view (admin-only) ──────────────────────────────────────
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  // Period scope for the payouts totals: all-time, or a specific YYYY-MM month.
  // Partner payout cards open on demand: the list stays scannable, one
  // header per partner, and the hostel table shows when you expand it.
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const togglePartner = (id: string) =>
    setExpandedPartners((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [payoutMode, setPayoutMode] = useState<"all" | "month">("all");
  const [payoutMonth, setPayoutMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

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
  // Null means there is nothing after what is on screen.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
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
      // (loaded lazily — see the Payouts/Splits effect below)
    }
  }, []);

  // Payouts and Splits are the only tabs that need the complete, unfiltered
  // ledger — by far the most expensive request in the admin. Fetch it the
  // first time one of those tabs is opened rather than on every page load.
  const allTransactionsLoaded = useRef(false);
  useEffect(() => {
    if (isPartner) return;
    if (activeTab !== "payouts" && activeTab !== "splits") return;
    if (allTransactionsLoaded.current) return;
    allTransactionsLoaded.current = true;
    void fetchAllTransactions();
  }, [activeTab, isPartner]);

  useEffect(() => {
    if (activeTab === "reserve" && isSuperAdmin) void fetchReserve(reservePeriod);
  }, [activeTab, isSuperAdmin, reservePeriod, reserveMonth]);

  // The bank list is loaded once per visit to the tab — it changes about as
  // often as new banks join Nigeria's clearing system.
  useEffect(() => {
    if (activeTab !== "reserve" || !isSuperAdmin || banks.length > 0) return;
    setBanksLoading(true);
    adminFetch("/api/admin/reserve/banks")
      .then((res) => res.json())
      .then((data) => setBanks(data.banks ?? []))
      .catch(() => {})
      .finally(() => setBanksLoading(false));
  }, [activeTab, isSuperAdmin, banks.length]);

  // Resolves the account name from Paystack as soon as a bank is chosen and
  // the account number looks like a complete NUBAN — debounced so it fires
  // once typing settles, not on every keystroke.
  useEffect(() => {
    if (manualName) return;
    if (!bankForm.bankCode || !/^\d{10}$/.test(bankForm.accountNumber)) {
      setResolveStatus("idle");
      return;
    }
    setResolveStatus("checking");
    setResolveError("");
    const accountNumber = bankForm.accountNumber;
    const bankCode = bankForm.bankCode;
    const timer = setTimeout(() => {
      adminFetch(`/api/admin/reserve/resolve-account?accountNumber=${accountNumber}&bankCode=${bankCode}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not verify that account number.");
          setBankForm((f) => (f.accountNumber === accountNumber && f.bankCode === bankCode ? { ...f, accountName: data.accountName } : f));
          setResolveStatus("resolved");
        })
        .catch((err) => {
          setResolveStatus("failed");
          setResolveError(err instanceof Error ? err.message : "Could not verify that account number.");
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [bankForm.bankCode, bankForm.accountNumber, manualName]);

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
    // A filter change starts a new walk; the old cursor described the old set.
    setNextCursor(null);
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
      const res = await adminFetch("/api/hostels");
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

  const fetchReserve = async (period = reservePeriod) => {
    setReserveLoading(true);
    setReserveError("");
    try {
      const monthParam = period === "month" ? `&month=${reserveMonth}` : "";
      const res = await adminFetch(`/api/admin/reserve?period=${period}${monthParam}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reserve");
      setReserveState(data);
      if (data.bank) setBankForm({ accountName: data.bank.accountName, accountNumber: "", bankName: data.bank.bankName, bankCode: data.bank.bankCode });
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Failed to load reserve");
    } finally {
      setReserveLoading(false);
    }
  };

  // Enabled once the account name is either verified by Paystack or (when
  // verification itself failed) typed in by hand.
  const canSaveBank = Boolean(bankForm.bankCode && /^\d{10}$/.test(bankForm.accountNumber) && bankForm.accountName && (resolveStatus === "resolved" || manualName));

  const saveReserveBank = async () => {
    setReserveActionLoading(true);
    try {
      const res = await adminFetch("/api/admin/reserve/bank", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bankForm) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save bank details");
      setManualName(false);
      setResolveStatus("idle");
      await fetchReserve();
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Could not save bank details");
    } finally {
      setReserveActionLoading(false);
    }
  };

  const setReservePin = async () => {
    setReserveActionLoading(true);
    try {
      const res = await adminFetch("/api/admin/reserve/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not set PIN");
      setPin("");
      await fetchReserve();
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Could not set PIN");
    } finally {
      setReserveActionLoading(false);
    }
  };

  // Creates the Paystack subaccount the reserve is split to on bot payments,
  // for the saved bank account — or moves the existing one onto it. The
  // backend does the Paystack work with its own key and keeps the code, so
  // nothing needs setting by hand. PIN-confirmed: it decides where money goes.
  const saveReserveSubaccount = async () => {
    setReserveActionLoading(true);
    setReserveError("");
    try {
      const res = await adminFetch("/api/admin/reserve/subaccount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: subaccountPin }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the reserve subaccount");
      setSubaccountPin("");
      await fetchReserve();
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Could not create the reserve subaccount");
    } finally {
      setReserveActionLoading(false);
    }
  };

  const closePinReset = () => {
    setPinResetOpen(false);
    setPinResetPassword("");
    setPinResetPin("");
    setPinResetError("");
  };

  // Replaces a forgotten reserve PIN. The sign-in password stands in for the
  // old PIN, so an open admin session alone still can't change it.
  const resetReservePin = async () => {
    setPinResetSaving(true);
    setPinResetError("");
    try {
      const res = await adminFetch("/api/admin/reserve/pin/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pinResetPassword, pin: pinResetPin }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset the PIN");
      closePinReset();
      setPinResetDone(true);
      await fetchReserve();
    } catch (err) {
      setPinResetError(err instanceof Error ? err.message : "Could not reset the PIN");
    } finally {
      setPinResetSaving(false);
    }
  };

  // Partner accounts drive the admin-only payouts view. Non-critical: on any
  // failure the view just stays empty.
  const fetchPartners = async () => {
    try {
      const res = await adminFetch("/api/admin/admins");
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
  const buildTransactionsQuery = (opts: { unbounded?: boolean; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    if (filterHostel !== "all") params.set("hostel", filterHostel);
    if (controllerFilter !== "all") params.set("controllerId", controllerFilter);
    if (filterPlanType !== "all") params.set("planType", filterPlanType);
    if (filterPaymentSource !== "all") params.set("paymentSource", filterPaymentSource);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    if (!opts.unbounded) params.set("limit", String(TRANSACTIONS_PAGE_SIZE));
    // Opaque: whatever the last response handed back, echoed verbatim. The
    // browser never builds one, so its shape stays the server's business.
    if (opts.cursor) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const loadMoreTransactions = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchTransactions({ cursor: nextCursor });
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchTransactions = async (opts: { cursor?: string } = {}) => {
    const appending = Boolean(opts.cursor);
    try {
      // The backend does the filtering now (hostel/controller/plan type/
      // payment source/date), so it only ever has to stream what's actually
      // relevant — and `limit` caps the row list at the Firestore query
      // level, which is what keeps this fast even against a growing ledger.
      const res = await adminFetch(
        `/api/admin/transactions${buildTransactionsQuery({ cursor: opts.cursor })}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load transactions");
      const parsed = parseTransactionsResponse(data);
      // Appending, not replacing — and de-duplicated by id, so a row that
      // straddles a page boundary cannot be listed twice.
      setTransactions((prev) => {
        if (!appending) return parsed.valid;
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...parsed.valid.filter((t) => !seen.has(t.id))];
      });
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
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
      const res = await adminFetch("/api/admin/transactions");
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
      const res = await adminFetch("/api/admin/splits");
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
      if (!withinHostelScope(t.hostel ?? "")) return false;
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
      withinHostelScope,
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
      const res = await adminFetch(`/api/admin/transactions${buildTransactionsQuery({ unbounded: true })}`);
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
    const XLSX = await loadXlsx();
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
      const res = await adminFetch("/api/admin/splits", {
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
      const res = await adminFetch(
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
    try {
      // Only the record id goes up. The figures and the transaction list are
      // rebuilt on the server from the stored split record — the browser used
      // to recompute them from its own copy of the ledger and post them back,
      // which meant a partner's statement could carry numbers that were never
      // the ones written into the payout record.
      const res = await adminFetch("/api/admin/send-split-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail.trim(),
          splitId: s.id,
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
      if (!withinHostelScope(s.hostel)) return false;
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
    withinHostelScope,
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

  const exportSplitLog = async (
    s: SplitRecord,
    txns: TransactionRow[],
    periodLabel?: string,
  ) => {
    if (txns.length === 0) return;
    const XLSX = await loadXlsx();
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

  const exportSplitsToExcel = async () => {
    if (filteredSplits.length === 0) return;
    const XLSX = await loadXlsx();
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

  // ── Render helpers (presentation only) ─────────────────────────────────────
  // Transactions table: the same columns as before, shown as a table from `md`
  // up and as cards below it.
  const transactionColumns: Column<TransactionRow>[] = [
    {
      key: "date",
      header: "Date",
      className: "whitespace-nowrap",
      cell: (t) => (
        <>
          {formatDay(t.purchasedAt)}
          <br />
          <span className="text-xs text-slate-400">{formatTime(t.purchasedAt)}</span>
        </>
      ),
    },
    { key: "plan", header: "Plan", className: "font-medium text-slate-900", cell: (t) => t.planName },
    { key: "type", header: "Type", cell: (t) => <PlanTypeBadge type={t.planType} /> },
    { key: "hostel", header: "Hostel", cell: (t) => t.hostel ?? <span className="text-slate-400">Unknown</span> },
    ...(isPartner
      ? []
      : ([
          { key: "source", header: "Source", cell: (t) => <SourceChip t={t} /> },
          {
            key: "email",
            header: "Email",
            className: "max-w-[180px] truncate",
            cell: (t) => t.customerEmail ?? <span className="text-slate-400">N/A</span>,
          },
          {
            key: "ref",
            header: "Ref",
            cell: (t) => (t.paymentRef ? <CopyRef value={t.paymentRef} /> : <span className="text-slate-400">—</span>),
          },
        ] as Column<TransactionRow>[])),
    {
      key: "amount",
      header: isPartner ? "Your Share" : "Amount",
      align: "right",
      className: "whitespace-nowrap font-semibold text-slate-900",
      cell: (t) => `₦${(isPartner ? partnerShareFor(t) : t.price).toLocaleString()}`,
    },
  ];

  const renderTransactionCard = (t: TransactionRow) => (
    <MobileCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words">{t.planName}</span>
          <PlanTypeBadge type={t.planType} />
        </span>
      }
      aside={`₦${(isPartner ? partnerShareFor(t) : t.price).toLocaleString()}`}
      subtitle={`${formatDay(t.purchasedAt)} · ${formatTime(t.purchasedAt)}`}
      badges={isPartner ? undefined : <SourceChip t={t} />}
      lines={[
        { label: "Hostel", value: t.hostel ?? <span className="text-slate-400">Unknown</span> },
        ...(isPartner
          ? []
          : [
              <CardLine key="email" label="Email">
                {t.customerEmail ? <span className="break-all">{t.customerEmail}</span> : <span className="text-slate-400">N/A</span>}
              </CardLine>,
              <CardLine key="ref" label="Payment ref">
                {t.paymentRef ? <CopyRef value={t.paymentRef} full /> : <span className="text-slate-400">—</span>}
              </CardLine>,
            ]),
      ]}
    />
  );

  // Splits history: each row's figures, computed exactly as the table body
  // used to compute them inline, so the table, its card and its expanded
  // detail all read from one place.
  const buildSplitRow = (s: SplitRecord) => {
    const allSplitTxns = getSplitTransactions(s);
    // Default expanded panel month to the active list filter month (unless manually overridden)
    const activeMonth = expandedSplitMonths[s.id] ?? (splitFilterMonth || "");
    const displayTxns = activeMonth
      ? allSplitTxns.filter((t) => {
          const [y, m] = activeMonth.split("-").map(Number);
          return t.purchasedAt.getFullYear() === y && t.purchasedAt.getMonth() + 1 === m;
        })
      : allSplitTxns;
    const sMaintPct = s.maintenancePct ?? maintenancePct;
    // Row revenue: use month-filtered transactions when list filter is active
    const rowTxns = splitFilterMonth ? getSplitTransactions(s, splitFilterMonth) : allSplitTxns;
    const grossRev = rowTxns.reduce((a, t) => a + t.price, 0);
    const mainDed = Math.round((grossRev * sMaintPct) / 100);
    const paystackDed = Math.round((grossRev * paystackPct) / 100);
    const splittableRev = grossRev - mainDed - paystackDed;
    const splittablePctRow = 100 - sMaintPct - paystackPct;
    const adminShr = Math.round((splittableRev * s.adminPercent) / 100);
    const partnerShr = Math.round((splittableRev * s.partnerPercent) / 100);
    const isExpanded = expandedSplitId === s.id;
    const activeMonthLabel = activeMonth
      ? new Date(activeMonth + "-01").toLocaleDateString("en-NG", { month: "long", year: "numeric" })
      : "";
    const periodLabel = s.isOpen
      ? activeMonth
        ? activeMonthLabel
        : `From ${s.dateFrom} (Ongoing)`
      : activeMonth
        ? activeMonthLabel
        : `${s.dateFrom} → ${s.dateTo}`;
    return {
      s,
      allSplitTxns,
      activeMonth,
      displayTxns,
      sMaintPct,
      rowTxns,
      grossRev,
      mainDed,
      paystackDed,
      splittableRev,
      splittablePctRow,
      adminShr,
      partnerShr,
      isExpanded,
      activeMonthLabel,
      periodLabel,
    };
  };
  type SplitRow = ReturnType<typeof buildSplitRow>;

  const splitPeriod = (s: SplitRecord) =>
    s.isOpen ? (
      <span className="flex flex-wrap items-center gap-1.5">
        From {s.dateFrom}
        <span className="status-chip">● Live</span>
      </span>
    ) : (
      <>
        {s.dateFrom} → {s.dateTo}
      </>
    );

  const splitActions = ({ s, isExpanded, periodLabel }: SplitRow) =>
    !isPartner && (
      <div className="flex items-center gap-1.5">
        <IconButton
          label={isExpanded ? "Hide transaction log" : "View transaction log"}
          onClick={() => setExpandedSplitId(isExpanded ? null : s.id)}
          tone="primary"
          className={isExpanded ? "!bg-blue-100" : ""}>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
        {/* A payout record is evidence of what a partner was owed: superadmins only. */}
        {canEdit && isSuperAdmin && (
          <IconButton
            label="Delete split"
            tone="danger"
            onClick={() =>
              setConfirmModal({
                isOpen: true,
                title: "Delete this split?",
                message: `This permanently deletes the ${s.hostel} split (${periodLabel}). This can't be undone.`,
                onConfirm: () => handleDeleteSplit(s.id),
              })
            }
            disabled={deletingSplit === s.id}>
            <Trash2 size={16} />
          </IconButton>
        )}
      </div>
    );

  const splitColumns: Column<SplitRow>[] = [
    { key: "created", header: "Created", className: "whitespace-nowrap", cell: ({ s }) => formatDay(s.createdAt) },
    { key: "hostel", header: "Hostel", className: "font-medium text-slate-900", cell: ({ s }) => s.hostel },
    { key: "period", header: "Period", className: "whitespace-nowrap text-xs", cell: ({ s }) => splitPeriod(s) },
    { key: "txns", header: "Txns", align: "center", cell: ({ rowTxns }) => rowTxns.length },
    ...(isPartner
      ? []
      : ([
          {
            key: "revenue",
            header: (
              <>
                Revenue
                {splitFilterMonth && (
                  <span className="ml-1 normal-case font-normal text-blue-500">
                    ({new Date(splitFilterMonth + "-01").toLocaleDateString("en-NG", { month: "short", year: "numeric" })})
                  </span>
                )}
              </>
            ),
            align: "right",
            className: "whitespace-nowrap font-semibold text-slate-900",
            cell: ({ grossRev }) => `₦${grossRev.toLocaleString()}`,
          },
          {
            key: "yours",
            header: "Your Share",
            align: "right",
            className: "whitespace-nowrap",
            cell: ({ s, adminShr }) => (
              <>
                <span className="text-sm font-semibold text-blue-600">₦{adminShr.toLocaleString()}</span>
                <span className="ml-1 text-xs text-slate-400">({s.adminPercent}%)</span>
              </>
            ),
          },
        ] as Column<SplitRow>[])),
    {
      key: "partner",
      header: "Partner Share",
      align: "right",
      className: "whitespace-nowrap",
      cell: ({ s, partnerShr }) => (
        <>
          <span className="text-sm font-semibold text-purple-600">₦{partnerShr.toLocaleString()}</span>
          {!isPartner && <span className="ml-1 text-xs text-slate-400">({s.partnerPercent}%)</span>}
        </>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      className: "max-w-[140px] truncate",
      cell: ({ s }) => s.notes || <span className="text-slate-300">—</span>,
    },
    { key: "actions", header: "", cell: (row) => splitActions(row) },
  ];

  const renderSplitCard = (row: SplitRow) => {
    const { s, rowTxns, grossRev, adminShr, partnerShr } = row;
    return (
      <MobileCard
        title={s.hostel}
        subtitle={`Created ${formatDay(s.createdAt)}`}
        aside={isPartner ? undefined : `₦${grossRev.toLocaleString()}`}
        badges={
          s.isOpen ? (
            <span className="status-chip">● Live</span>
          ) : undefined
        }
        lines={[
          <CardLine key="period" label="Period">
            {s.isOpen ? `From ${s.dateFrom}` : `${s.dateFrom} → ${s.dateTo}`}
          </CardLine>,
          { label: "Txns", value: rowTxns.length },
          ...(isPartner
            ? []
            : [
                {
                  label: "Your share",
                  value: (
                    <>
                      <span className="font-semibold text-blue-600">₦{adminShr.toLocaleString()}</span>
                      <span className="ml-1 text-xs text-slate-400">({s.adminPercent}%)</span>
                    </>
                  ),
                },
              ]),
          {
            label: "Partner share",
            value: (
              <>
                <span className="font-semibold text-purple-600">₦{partnerShr.toLocaleString()}</span>
                {!isPartner && <span className="ml-1 text-xs text-slate-400">({s.partnerPercent}%)</span>}
              </>
            ),
          },
          ...(s.notes
            ? [
                <CardLine key="notes" label="Notes">
                  {s.notes}
                </CardLine>,
              ]
            : []),
        ]}
        actions={isPartner ? undefined : splitActions(row)}
      />
    );
  };

  const renderSplitDetail = (row: SplitRow) => {
    const {
      s,
      allSplitTxns,
      activeMonth,
      displayTxns,
      sMaintPct,
      grossRev,
      mainDed,
      paystackDed,
      splittableRev,
      splittablePctRow,
      activeMonthLabel,
      periodLabel,
    } = row;
    const logColumns: Column<TransactionRow>[] = [
      {
        key: "date",
        header: "Date",
        className: "whitespace-nowrap text-xs",
        cell: (t) => (
          <>
            {formatDay(t.purchasedAt)}
            <br />
            <span className="text-slate-400">{formatTime(t.purchasedAt)}</span>
          </>
        ),
      },
      { key: "plan", header: "Plan", className: "text-xs font-medium text-slate-900", cell: (t) => t.planName },
      { key: "type", header: "Type", cell: (t) => <PlanTypeBadge type={t.planType} /> },
      {
        key: "email",
        header: "Email",
        className: "max-w-[160px] truncate text-xs",
        cell: (t) => t.customerEmail ?? <span className="text-slate-400">N/A</span>,
      },
      {
        key: "ref",
        header: "Ref",
        cell: (t) => (t.paymentRef ? <CopyRef value={t.paymentRef} /> : <span className="text-slate-400">—</span>),
      },
      {
        key: "total",
        header: "Total",
        align: "right",
        className: "whitespace-nowrap text-xs font-semibold text-slate-900",
        cell: (t) => `₦${t.price.toLocaleString()}`,
      },
      {
        key: "yours",
        header: `Yours (${s.adminPercent}%)`,
        align: "right",
        className: "whitespace-nowrap text-xs font-semibold text-blue-600",
        cell: (t) => `₦${Math.round((t.price * s.adminPercent) / 100).toLocaleString()}`,
      },
      {
        key: "partner",
        header: `Partner (${s.partnerPercent}%)`,
        align: "right",
        className: "whitespace-nowrap text-xs font-semibold text-purple-600",
        cell: (t) => `₦${Math.round((t.price * s.partnerPercent) / 100).toLocaleString()}`,
      },
    ];
    return (
      <div className="space-y-4 rounded-2xl bg-blue-50/60 p-3 backdrop-blur-sm sm:p-4">
        {/* Deductions summary bar — same pipeline-chip idiom as the create-form preview */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="glass-slate rounded-full px-2.5 py-1 font-semibold">Gross ₦{grossRev.toLocaleString()}</span>
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
            className={`${GLASS_INPUT} sm:w-auto`}>
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
            className="glass-button">
            <Download size={14} />
            Export Log
          </button>
        </div>
        {/* Monthly revenue summary — shown only when a month is selected */}
        {activeMonth &&
          (() => {
            const mGross = displayTxns.reduce((a, t) => a + t.price, 0);
            const mMainDed = Math.round((mGross * sMaintPct) / 100);
            const mPayDed = Math.round((mGross * paystackPct) / 100);
            const mSplittable = Math.max(0, mGross - mMainDed - mPayDed);
            const mAdminShr = Math.round((mSplittable * s.adminPercent) / 100);
            const mPartnerShr = Math.round((mSplittable * s.partnerPercent) / 100);
            const tile = "min-w-0 rounded-2xl border border-white/70 px-3 py-2.5 shadow-sm backdrop-blur-xl";
            const figure = "text-base font-bold [overflow-wrap:anywhere] sm:text-lg";
            return (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className={`${tile} bg-white/70`}>
                  <p className="mb-0.5 text-xs text-slate-400">Transactions</p>
                  <p className={`${figure} text-slate-900`}>{displayTxns.length}</p>
                </div>
                <div className={`${tile} bg-white/70`}>
                  <p className="mb-0.5 text-xs text-slate-400">Gross Revenue</p>
                  <p className={`${figure} text-slate-900`}>₦{mGross.toLocaleString()}</p>
                </div>
                <div className={`${tile} bg-red-50/70`}>
                  <p className="mb-0.5 text-xs text-red-400">−Maint. {sMaintPct}%</p>
                  <p className={`${figure} text-red-600`}>−₦{mMainDed.toLocaleString()}</p>
                </div>
                <div className={`${tile} bg-orange-50/70`}>
                  <p className="mb-0.5 text-xs text-orange-400">−Paystack {paystackPct}%</p>
                  <p className={`${figure} text-orange-600`}>−₦{mPayDed.toLocaleString()}</p>
                </div>
                <div className={`${tile} bg-blue-50/70`}>
                  <p className="mb-0.5 text-xs text-blue-500">Your Share ({s.adminPercent}%)</p>
                  <p className={`${figure} text-blue-700`}>₦{mAdminShr.toLocaleString()}</p>
                </div>
                <div className={`${tile} bg-purple-50/70`}>
                  <p className="mb-0.5 text-xs text-purple-500">Partner Share ({s.partnerPercent}%)</p>
                  <p className={`${figure} text-purple-700`}>₦{mPartnerShr.toLocaleString()}</p>
                </div>
              </div>
            );
          })()}
        {/* Email section — write permission required */}
        {canEdit && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-3 shadow-sm backdrop-blur-xl sm:px-4">
            {/* Quick-send buttons for stored emails */}
            {(s.adminEmail || s.partnerEmail) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Quick send:</span>
                {s.adminEmail && (
                  <button
                    onClick={() => handleSendSplitEmail(s, displayTxns, s.adminEmail!, periodLabel)}
                    disabled={sendingEmail}
                    className="glass-blue flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95 disabled:opacity-50">
                    <Mail size={12} className="shrink-0" />
                    <span className="truncate">To Me ({s.adminEmail.split("@")[0]})</span>
                  </button>
                )}
                {s.partnerEmail && (
                  <button
                    onClick={() => handleSendSplitEmail(s, displayTxns, s.partnerEmail!, periodLabel)}
                    disabled={sendingEmail}
                    className="glass-purple flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95 disabled:opacity-50">
                    <Mail size={12} className="shrink-0" />
                    <span className="truncate">To Partner ({s.partnerEmail.split("@")[0]})</span>
                  </button>
                )}
                {s.sendMonthlyEmail && <span className="status-chip text-xs">Monthly emails on</span>}
              </div>
            )}
            {/* Manual email input — stacks on a phone */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <Mail size={16} className="hidden shrink-0 text-slate-400 sm:block" />
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
                className={`${GLASS_INPUT} sm:min-w-[200px] sm:flex-1`}
              />
              <button
                onClick={() => handleSendSplitEmail(s, displayTxns, emailSplitId === s.id ? emailAddress : "", periodLabel)}
                disabled={sendingEmail || !(emailSplitId === s.id && emailAddress.trim())}
                className="glass-primary">
                <Mail size={14} />
                {sendingEmail && emailSplitId === s.id ? "Sending…" : "Send"}
              </button>
              {emailSuccess && emailSplitId === s.id && (
                <span className="text-xs font-semibold text-emerald-600">{emailSuccess}</span>
              )}
            </div>
          </div>
        )}
        {/* Transaction log header */}
        <p className="break-words text-sm font-semibold text-slate-800">
          Transaction Log — <span className="text-blue-600">{s.hostel}</span>
          <span className="ml-2 text-xs font-normal text-slate-500">{periodLabel}</span>
          <span className="ml-2 text-xs font-normal text-slate-500">
            ({displayTxns.length} transaction{displayTxns.length !== 1 ? "s" : ""})
          </span>
        </p>
        {displayTxns.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No transactions found for this period.</p>
        ) : (
          // Cards below `md` (the card list brings its own padding, so this
          // cancels the detail's); the bordered 8-column table from `md` up.
          <div className="-mx-3 sm:-mx-4 md:mx-0 md:overflow-hidden md:rounded-2xl md:border md:border-white/70 md:bg-white/70 md:shadow-sm md:backdrop-blur-xl">
            <ResponsiveTable
              rows={displayTxns}
              columns={logColumns}
              rowKey={(t) => t.id}
              renderCard={(t) => (
                <MobileCard
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words">{t.planName}</span>
                      <PlanTypeBadge type={t.planType} />
                    </span>
                  }
                  aside={`₦${t.price.toLocaleString()}`}
                  subtitle={`${formatDay(t.purchasedAt)} · ${formatTime(t.purchasedAt)}`}
                  lines={[
                    {
                      label: `Yours (${s.adminPercent}%)`,
                      value: (
                        <span className="font-semibold text-blue-600">
                          ₦{Math.round((t.price * s.adminPercent) / 100).toLocaleString()}
                        </span>
                      ),
                    },
                    {
                      label: `Partner (${s.partnerPercent}%)`,
                      value: (
                        <span className="font-semibold text-purple-600">
                          ₦{Math.round((t.price * s.partnerPercent) / 100).toLocaleString()}
                        </span>
                      ),
                    },
                    <CardLine key="email" label="Email">
                      {t.customerEmail ? <span className="break-all">{t.customerEmail}</span> : <span className="text-slate-400">N/A</span>}
                    </CardLine>,
                    <CardLine key="ref" label="Payment ref">
                      {t.paymentRef ? <CopyRef value={t.paymentRef} full /> : <span className="text-slate-400">—</span>}
                    </CardLine>,
                  ]}
                />
              )}
            />
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ProtectedRoute module='transactions'>
      <AdminPage
        eyebrow="TRANSACTIONS & PAYOUTS"
        title="Transaction audit"
        actions={
          <button
            onClick={() => {
              fetchAll();
              if (!isPartner) void fetchAllTransactions();
            }}
            disabled={loading}
            title="Refresh transactions"
            aria-label="Refresh transactions"
            className="glass-button">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }>
        {error && (
          <div className="glass-alert">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {/* Tabs */}
        <TabBar
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            {
              value: "transactions",
              label: isPartner ? "My Transactions" : "Transactions",
              icon: <BarChart3 size={16} />,
            },
            {
              value: "payouts",
              label: "Partner Payouts",
              icon: <Wallet size={16} />,
              count: partners.length,
              hidden: isPartner,
            },
            {
              value: "splits",
              label: "Split Counter",
              icon: <Scissors size={16} />,
              count: splitRecords.length,
              hidden: isPartner,
            },
            {
              value: "reserve",
              label: "Platform Reserve",
              icon: <Landmark size={16} />,
              hidden: isPartner || !isSuperAdmin,
            },
          ]}
        />

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
                <div className="panel-heading flex-nowrap">
                  <div className="min-w-0">
                    <p className="eyebrow">TRANSACTIONS</p>
                    <h3 className="flex items-center gap-2">
                      <Router size={18} className="shrink-0 text-blue-500" />
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
                    className="glass-icon shrink-0"
                    aria-expanded={showControllerRevenue}
                    aria-label={showControllerRevenue ? "Collapse" : "Expand"}
                    title={showControllerRevenue ? "Collapse" : "Expand"}>
                    {showControllerRevenue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                {showControllerRevenue && (
                  <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                    {byController.map((row) => (
                      <div key={row.controllerId} className="glass-controller min-w-0">
                        <p className="break-words text-sm font-medium text-slate-700">{row.controllerName}</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">₦{row.revenue.toLocaleString()}</p>
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
                <div className="panel-heading flex-nowrap">
                  <div className="min-w-0">
                    <p className="eyebrow">TRANSACTIONS</p>
                    <h3 className="flex items-center gap-2">
                      <Building2 size={18} className="shrink-0 text-blue-500" />
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
                    className="glass-icon shrink-0"
                    aria-expanded={showHostelRevenue}
                    aria-label={showHostelRevenue ? "Collapse" : "Expand"}
                    title={showHostelRevenue ? "Collapse" : "Expand"}>
                    {showHostelRevenue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                {showHostelRevenue && (
                  <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                    {byHostel.map((row) => (
                      <div key={row.hostel} className="glass-controller min-w-0">
                        <p className="break-words text-sm font-medium text-slate-700">{row.hostel}</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">₦{row.revenue.toLocaleString()}</p>
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
                  {/* From/to stack on a phone, sit side by side from `sm`. */}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className={`${GLASS_INPUT} min-w-0 sm:flex-1`}
                      title="Date from"
                      aria-label="Date from"
                    />
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className={`${GLASS_INPUT} min-w-0 sm:flex-1`}
                      title="Date to"
                      aria-label="Date to"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <p className="min-w-0 break-words text-sm text-slate-500">
                    {isPartner
                      ? `${totalTransactionsCount.toLocaleString()} transaction${totalTransactionsCount !== 1 ? "s" : ""} • ₦${totalPartnerShare.toLocaleString()} your share`
                      : `${totalTransactionsCount.toLocaleString()} transaction${totalTransactionsCount !== 1 ? "s" : ""} • ₦${totalRevenue.toLocaleString()} total`}
                    {hasMoreTransactions && (
                      <span className="ml-1 text-slate-400">
                        — showing {filtered.length.toLocaleString()} below
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Until now this count sat beside no control at all: the
                        only ways past the newest page were narrowing the date
                        filter or exporting the whole ledger. */}
                    {nextCursor && (
                      <button
                        onClick={() => void loadMoreTransactions()}
                        disabled={loadingMore}
                        className="glass-button flex-1 sm:flex-none">
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    )}
                    <button
                      onClick={() => void exportToExcel()}
                      disabled={filtered.length === 0 || exporting}
                      className="glass-primary flex-1 sm:flex-none">
                      <Download size={16} />
                      {exporting ? "Exporting…" : "Export Excel"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Transactions table — cards below `md` */}
            <Panel flush>
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading transactions…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">No transactions match your filters.</div>
              ) : (
                <ResponsiveTable
                  rows={filtered}
                  columns={transactionColumns}
                  rowKey={(t) => t.id}
                  renderCard={renderTransactionCard}
                />
              )}
            </Panel>
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
                  className={`${GLASS_INPUT} sm:w-auto`}
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
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="glass-button text-sm"
                    onClick={() => setExpandedPartners(new Set(partnerPayouts.map((p) => p.id)))}
                  >
                    Expand all
                  </button>
                  <button type="button" className="glass-button text-sm" onClick={() => setExpandedPartners(new Set())}>
                    Collapse all
                  </button>
                </div>
                {partnerPayouts.map((p) => {
                  const open = expandedPartners.has(p.id);
                  return (
                  <section key={p.id} className="glass-panel !p-0">
                    <button
                      type="button"
                      onClick={() => togglePartner(p.id)}
                      aria-expanded={open}
                      aria-controls={`partner-${p.id}`}
                      className={`flex w-full items-center gap-3 p-4 text-left sm:p-5 ${open ? "border-b border-white/70" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="controller-icon shrink-0 !bg-purple-100 !text-purple-600">
                          <Wallet size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-slate-900">{p.username}</p>
                          <p className="text-xs text-slate-500">
                            {p.mode === "perHostel" ? "Per-hostel split" : "Same split for all hostels"}
                            {" · "}
                            {p.rows.length === 1 ? "1 hostel" : `${p.rows.length} hostels`}
                          </p>
                          {/* Phone: the amount is a line of its own, never squeezed beside the name. */}
                          <p className="mt-1 text-base font-bold text-purple-600 sm:hidden">
                            You pay ₦{p.totalCut.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        <div className="hidden text-right sm:block">
                          <p className="text-xs text-slate-500">You pay</p>
                          <p className="text-xl font-bold text-purple-600">₦{p.totalCut.toLocaleString()}</p>
                        </div>
                        <ChevronDown
                          size={18}
                          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </div>
                    </button>

                    {!open ? null : p.rows.length === 0 ? (
                      <div className="p-5 text-sm text-slate-500">No revenue in this period.</div>
                    ) : (
                      <ResponsiveTable
                        rows={p.rows}
                        rowKey={(r) => r.hostelId}
                        columns={[
                          { key: "hostel", header: "Hostel", className: "text-slate-900", cell: (r) => r.name },
                          { key: "revenue", header: "Revenue", align: "right", cell: (r) => `₦${r.gross.toLocaleString()}` },
                          { key: "split", header: "Split", align: "right", className: "text-slate-500", cell: (r) => `${r.pct}%` },
                          {
                            key: "cut",
                            header: "Partner cut",
                            align: "right",
                            className: "font-semibold text-purple-600",
                            cell: (r) => `₦${r.cut.toLocaleString()}`,
                          },
                          { key: "yours", header: "Your share", align: "right", cell: (r) => `₦${r.adminGain.toLocaleString()}` },
                        ]}
                        renderCard={(r) => (
                          // Phone: one compact row per hostel instead of a tall card.
                          <div className="px-4 py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="min-w-0 truncate font-medium text-slate-900">{r.name}</p>
                              <p className="shrink-0 font-semibold text-purple-600">₦{r.cut.toLocaleString()}</p>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Revenue ₦{r.gross.toLocaleString()} · {r.pct}% · yours ₦{r.adminGain.toLocaleString()}
                            </p>
                          </div>
                        )}
                        footer={{
                          cells: (
                            <tr className="font-semibold text-slate-900">
                              <Td className="font-semibold text-slate-900">Total</Td>
                              <Td align="right" className="font-semibold text-slate-900">
                                ₦{p.totalGross.toLocaleString()}
                              </Td>
                              <Td>{""}</Td>
                              <Td align="right" className="font-semibold text-purple-600">
                                ₦{p.totalCut.toLocaleString()}
                              </Td>
                              <Td align="right" className="font-semibold text-slate-900">
                                ₦{p.adminGain.toLocaleString()}
                              </Td>
                            </tr>
                          ),
                          card: (
                            <div className="border-t border-slate-200/70 bg-white/40 px-4 py-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="font-semibold text-slate-900">Total</p>
                                <p className="font-bold text-purple-600">₦{p.totalCut.toLocaleString()}</p>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Revenue ₦{p.totalGross.toLocaleString()} · yours ₦{p.adminGain.toLocaleString()}
                              </p>
                            </div>
                          ),
                        }}
                      />
                    )}
                  </section>
                  );
                })}
              </div>
            )}
          </>
        )}

        {isSuperAdmin && activeTab === "reserve" && (
          <section className="space-y-5">
            {reserveError && (
              <div className="glass-alert">
                <AlertTriangle size={18} className="shrink-0" />
                <span className="min-w-0 break-words">{reserveError}</span>
              </div>
            )}
            {reserveLoading || !reserveState ? (
              <div className="glass-panel p-8 text-center text-sm text-slate-500">Loading platform reserve…</div>
            ) : (
              <>
                <div className="kpi-grid lg:grid-cols-4">
                  <Kpi label="Reserve rate" value={`${reserveState.reservePercent}%`} tone="blue" />
                  <Kpi label="Total allocated" value={`₦${(reserveState.totalAllocatedKobo / 100).toLocaleString()}`} tone="green" />
                  <Kpi label="Withdrawn" value={`₦${(reserveState.totalWithdrawnKobo / 100).toLocaleString()}`} tone="violet" />
                  <Kpi label="Available in period" value={`₦${(reserveState.availableKobo / 100).toLocaleString()}`} tone="teal" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">RESERVE PERIOD</p>
                    <p className="text-sm text-slate-500">2.5% of every sale, split to the reserve account at payment.</p>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                    {reservePeriod === "month" && (
                      <input
                        type="month"
                        value={reserveMonth}
                        onChange={(e) => setReserveMonth(e.target.value)}
                        className={`${GLASS_INPUT} sm:w-auto`}
                        aria-label="Reserve month"
                      />
                    )}
                    <SegToggle
                      value={reservePeriod}
                      onChange={setReservePeriod}
                      options={[{ value: "day", label: "Day" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }, { value: "all", label: "All time" }]}
                    />
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                  <div className="glass-panel min-w-0 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="eyebrow">RESERVE ACCOUNT</p>
                        <h2 className="text-lg font-bold text-slate-900">Superadmin bank details</h2>
                      </div>
                      <Landmark className="shrink-0 text-blue-500" size={20} />
                    </div>
                    {reserveState.bank && <p className="mb-4 break-words rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{reserveState.bank.accountName} · {reserveState.bank.bankName} · {reserveState.bank.accountNumberMasked}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        className={GLASS_INPUT}
                        value={bankForm.bankCode}
                        onChange={(e) => {
                          const bank = banks.find((b) => b.code === e.target.value);
                          setBankForm({ ...bankForm, bankCode: e.target.value, bankName: bank?.name ?? "", accountName: "" });
                          setManualName(false);
                        }}
                      >
                        <option value="">{banksLoading ? "Loading banks…" : "Select bank"}</option>
                        {banks.map((b) => (
                          <option key={b.code} value={b.code}>{b.name}</option>
                        ))}
                      </select>
                      <input
                        className={GLASS_INPUT}
                        placeholder="Account number"
                        inputMode="numeric"
                        maxLength={10}
                        value={bankForm.accountNumber}
                        onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value.replace(/\D/g, ""), accountName: manualName ? bankForm.accountName : "" })}
                      />
                    </div>
                    <div className="mt-3">
                      {resolveStatus === "checking" && <p className="text-sm text-slate-500">Verifying account name…</p>}
                      {resolveStatus === "resolved" && (
                        <p className="break-words rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{bankForm.accountName}</p>
                      )}
                      {resolveStatus === "failed" && !manualName && (
                        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          <p className="break-words">{resolveError}</p>
                          <button type="button" className="inline-flex min-h-[40px] items-center font-semibold underline" onClick={() => setManualName(true)}>
                            Enter the account name myself
                          </button>
                        </div>
                      )}
                      {manualName && (
                        <input
                          className={GLASS_INPUT}
                          placeholder="Account name"
                          value={bankForm.accountName}
                          onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                        />
                      )}
                    </div>
                    <button onClick={saveReserveBank} disabled={reserveActionLoading || !canSaveBank} className="glass-button mt-4 w-full sm:w-auto">Save bank details</button>
                  </div>

                  <div className="glass-panel min-w-0 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="eyebrow">PAYSTACK SUBACCOUNT · BOT PAYMENTS</p>
                        <h2 className="text-lg font-bold text-slate-900">Reserve subaccount</h2>
                      </div>
                      <LockKeyhole className="shrink-0 text-amber-500" size={20} />
                    </div>
                    {reserveState.reserveSubaccount && (
                      <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        <p className="break-all font-semibold">{reserveState.reserveSubaccount.code}</p>
                        {reserveState.reserveSubaccount.source === "admin" ? (
                          <p className="break-words">{reserveState.reserveSubaccount.accountName} · {reserveState.reserveSubaccount.bankName} · {reserveState.reserveSubaccount.accountNumberMasked}</p>
                        ) : (
                          <p>Set from the server&apos;s environment. Create one here to manage it from this page.</p>
                        )}
                        <p className="mt-1 text-xs">Card payments send exactly 2.5% of the plan price; bank transfers send 2.3% of the amount paid (the same reserve, measured on the larger total).</p>
                      </div>
                    )}
                    {!reserveState.pinConfigured ? (
                      <div className="rounded-2xl bg-amber-50 p-4">
                        <p className="mb-3 text-sm text-amber-900">Set your reserve PIN once. It confirms changes to where the reserve is paid, is hashed, and is never returned to the browser.</p>
                        <div className="flex flex-col gap-2 min-[400px]:flex-row">
                          <input className={`${GLASS_INPUT} min-w-0`} type="password" inputMode="numeric" placeholder="4–6 digit PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
                          <button onClick={setReservePin} disabled={reserveActionLoading} className="glass-button whitespace-nowrap">Set PIN</button>
                        </div>
                      </div>
                    ) : reserveState.reserveSubaccount?.source === "admin" && reserveState.reserveSubaccount.matchesSavedBank ? (
                      <p className="text-sm text-slate-500">Bot payments split the reserve to this account. To change it, save different bank details, then confirm with your PIN here.</p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600">
                          {reserveState.reserveSubaccount?.source === "admin"
                            ? "The saved bank details differ from the subaccount's. Confirm to move the subaccount onto them."
                            : "Creates the Paystack subaccount for the saved bank details. Bot payments start splitting the reserve to it straight away."}
                        </p>
                        <input className={GLASS_INPUT} type="password" inputMode="numeric" placeholder="Reserve PIN" value={subaccountPin} onChange={(e) => setSubaccountPin(e.target.value)} />
                        <button onClick={saveReserveSubaccount} disabled={reserveActionLoading || !reserveState.bank || !subaccountPin} className="glass-primary w-full">
                          {reserveState.reserveSubaccount?.source === "admin" ? "Move subaccount to saved bank" : "Create reserve subaccount"}
                        </button>
                        {!reserveState.bank && <p className="text-xs text-amber-700">Save bank details first.</p>}
                      </div>
                    )}
                    {reserveState.pinConfigured && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button type="button" onClick={() => { setPinResetDone(false); setPinResetOpen(true); }} className="inline-flex min-h-[40px] items-center text-sm font-semibold text-blue-600 hover:text-blue-800">
                          Forgot PIN?
                        </button>
                        {pinResetDone && <span className="text-sm text-emerald-700">New PIN saved.</span>}
                      </div>
                    )}
                  </div>
                </div>

                <Modal
                  open={pinResetOpen}
                  onClose={closePinReset}
                  dismissible={!pinResetSaving}
                  size="sm"
                  title="Reset reserve PIN"
                  footer={
                    <>
                      <button type="button" onClick={closePinReset} disabled={pinResetSaving} className="glass-button">Cancel</button>
                      <button type="button" onClick={resetReservePin} disabled={pinResetSaving || !pinResetPassword || !pinResetPin} className="glass-primary">
                        {pinResetSaving ? "Saving…" : "Save new PIN"}
                      </button>
                    </>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">Confirm it&apos;s you with the password you sign in with, then choose a new 4–6 digit PIN.</p>
                    <input className={GLASS_INPUT} type="password" autoComplete="current-password" placeholder="Sign-in password" value={pinResetPassword} onChange={(e) => setPinResetPassword(e.target.value)} />
                    <input className={GLASS_INPUT} type="password" inputMode="numeric" autoComplete="new-password" placeholder="New 4–6 digit PIN" value={pinResetPin} onChange={(e) => setPinResetPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                    {pinResetError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{pinResetError}</p>}
                  </div>
                </Modal>

                <SiteSubaccountCheck />

                <Panel flush eyebrow="AUDIT TRAIL" title="Reserve allocations">
                  <ResponsiveTable
                    rows={reserveState.allocations.slice(0, 200)}
                    rowKey={(row) => row.id}
                    columns={[
                      {
                        key: "txn",
                        header: "Transaction",
                        cell: (row) => `${row.source.toUpperCase()} · ${row.transactionId.slice(0, 10)}`,
                      },
                      { key: "plan", header: "Plan", cell: (row) => row.planName },
                      { key: "hostel", header: "Hostel", cell: (row) => row.hostel || "—" },
                      { key: "gross", header: "Gross", align: "right", cell: (row) => `₦${row.grossNaira.toLocaleString()}` },
                      {
                        key: "reserve",
                        header: "2.5% reserve",
                        align: "right",
                        className: "font-semibold text-emerald-700",
                        cell: (row) => `₦${(row.reserveKobo / 100).toLocaleString()}`,
                      },
                      {
                        key: "date",
                        header: "Date",
                        cell: (row) => (row.occurredAt ? new Date(row.occurredAt).toLocaleDateString() : "—"),
                      },
                    ]}
                    renderCard={(row) => (
                      <MobileCard
                        title={row.planName}
                        subtitle={row.hostel || "—"}
                        aside={<span className="text-emerald-700">₦{(row.reserveKobo / 100).toLocaleString()}</span>}
                        lines={[
                          { label: "Gross", value: `₦${row.grossNaira.toLocaleString()}` },
                          { label: "Date", value: row.occurredAt ? new Date(row.occurredAt).toLocaleDateString() : "—" },
                          <span key="txn" className="break-all font-mono text-xs text-slate-500">
                            {row.source.toUpperCase()} · {row.transactionId.slice(0, 10)}
                          </span>,
                        ]}
                      />
                    )}
                  />
                </Panel>

                {/* Five short columns — stays a table, scrolling sideways on a phone. */}
                {reserveState.withdrawals.length > 0 && (
                  <Panel flush eyebrow="WITHDRAWALS" title="Withdrawal history">
                    <div className="overflow-x-auto pb-2">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200/70">
                            <Th>Reference</Th>
                            <Th>Provider</Th>
                            <Th>Status</Th>
                            <Th align="right">Amount</Th>
                            <Th>Date</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {reserveState.withdrawals
                            .slice()
                            .reverse()
                            .map((row) => (
                              <tr key={row.id} className="border-t border-slate-100 transition hover:bg-white/50">
                                <Td className="whitespace-nowrap font-mono text-xs">{row.reference}</Td>
                                <Td className="whitespace-nowrap">{row.provider}</Td>
                                <Td className="whitespace-nowrap">{row.status}</Td>
                                <Td align="right" className="whitespace-nowrap font-semibold text-slate-900">
                                  ₦{(row.amountKobo / 100).toLocaleString()}
                                </Td>
                                <Td className="whitespace-nowrap">{new Date(row.createdAt).toLocaleDateString()}</Td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                )}
              </>
            )}
          </section>
        )}

        {/* ── SPLITS TAB ───────────────────────────────────────────────── */}
        {activeTab === "splits" && (
          <>
            {splitsError && (
              <div className="glass-alert">
                <AlertTriangle size={18} className="shrink-0" />
                <span className="min-w-0 break-words">{splitsError}</span>
              </div>
            )}
            {splitSuccess && (
              <div className="glass-alert border-emerald-200 bg-emerald-50/90 text-emerald-800">
                <AlertTriangle size={18} className="shrink-0" />
                {splitSuccess}
              </div>
            )}

            {/* Create Split form */}
            {canEdit && !isPartner && (
              <section className="glass-panel">
                <div className="panel-heading">
                  <div className="min-w-0">
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
                      className="min-h-[36px] w-16 rounded-lg border border-amber-300/60 bg-white/70 px-1.5 py-0.5 text-center font-bold text-amber-900 backdrop-blur-xl focus:outline-none focus:ring-1 focus:ring-amber-400"
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
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Period To</label>
                      <input
                        type="date"
                        value={splitDateTo}
                        onChange={(e) => setSplitDateTo(e.target.value)}
                        className={GLASS_INPUT}
                      />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Notes (optional)</label>
                    <input
                      type="text"
                      value={splitNotes}
                      onChange={(e) => setSplitNotes(e.target.value)}
                      placeholder="e.g. March 2026 split"
                      className={GLASS_INPUT}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Your Email (reports)</label>
                    <input
                      type="email"
                      value={splitAdminEmail}
                      onChange={(e) => setSplitAdminEmail(e.target.value)}
                      placeholder="your@email.com"
                      className={GLASS_INPUT}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Partner Email (reports)</label>
                    <input
                      type="email"
                      value={splitPartnerEmail}
                      onChange={(e) => setSplitPartnerEmail(e.target.value)}
                      placeholder="partner@email.com"
                      className={GLASS_INPUT}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                      <span className="min-w-0 text-sm text-slate-700">{splitSendMonthlyEmail ? "Enabled — send monthly" : "Disabled"}</span>
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
                        {/* One column on a narrow phone, so a long naira
                            figure never runs past the card. */}
                        <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 sm:grid-cols-4">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">Transactions</p>
                            <p className="text-xl font-bold text-slate-900 [overflow-wrap:anywhere] sm:text-2xl">{splitPreview.count}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">Splittable Revenue</p>
                            <p className="text-xl font-bold text-emerald-700 [overflow-wrap:anywhere] sm:text-2xl">₦{splitPreview.splittableRevenue.toLocaleString()}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">Your Share ({splitAdminPct}%)</p>
                            <p className="text-xl font-bold text-blue-600 [overflow-wrap:anywhere] sm:text-2xl">₦{splitPreview.adminShare.toLocaleString()}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">Partner Share ({splitPartnerPct}%)</p>
                            <p className="text-xl font-bold text-purple-600 [overflow-wrap:anywhere] sm:text-2xl">₦{splitPreview.partnerShare.toLocaleString()}</p>
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
                    className="glass-primary w-full sm:w-auto">
                    <Scissors size={16} />
                    {creatingSplit ? "Saving…" : "Save Split"}
                  </button>
                </div>
              </section>
            )}

            {/* Splits history */}
            <section className="glass-panel">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center">
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
                  <BarChart3 size={18} className="text-blue-500" />
                  Splits History
                  <span className="ml-1 text-sm font-normal text-slate-500">({filteredSplits.length})</span>
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap lg:ml-auto">
                  <select
                    value={splitFilterHostel}
                    onChange={(e) => setSplitFilterHostel(e.target.value)}
                    className={`${GLASS_INPUT} sm:w-auto`}
                    aria-label="Filter splits by hostel">
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
                    className={`${GLASS_INPUT} sm:w-auto`}
                    aria-label="Filter splits by month">
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
                        aria-label="Created from"
                        className={`${GLASS_INPUT} sm:w-auto`}
                      />
                      <input
                        type="date"
                        value={splitFilterTo}
                        onChange={(e) => setSplitFilterTo(e.target.value)}
                        title="Created to"
                        aria-label="Created to"
                        className={`${GLASS_INPUT} sm:w-auto`}
                      />
                    </>
                  )}
                  {!isPartner && (
                    <button
                      onClick={exportSplitsToExcel}
                      disabled={filteredSplits.length === 0}
                      className="glass-primary">
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
                        <div className="stat min-w-0">
                          <p className="stat-label">Splits Shown</p>
                          <p className="stat-value [overflow-wrap:anywhere]">{filteredSplits.length}</p>
                        </div>
                        {!isPartner && (
                          <div className="stat min-w-0">
                            <p className="stat-label">{splitFilterMonth ? `Revenue — ${activeMonthLabel}` : "Total Revenue"}</p>
                            <p className="stat-value [overflow-wrap:anywhere]">₦{splitsTotals.revenue.toLocaleString()}</p>
                          </div>
                        )}
                        {!isPartner && (
                          <div className="min-w-0 rounded-2xl bg-blue-50/70 px-3 py-3">
                            <p className="text-[11px] font-medium text-blue-600">
                              {splitFilterMonth ? `Your Share — ${activeMonthLabel}` : "Your Total"}
                            </p>
                            <p className="mt-1 text-lg font-semibold tracking-tight text-blue-700 [overflow-wrap:anywhere]">₦{splitsTotals.admin.toLocaleString()}</p>
                          </div>
                        )}
                        <div className="min-w-0 rounded-2xl bg-purple-50/70 px-3 py-3">
                          <p className="text-[11px] font-medium text-purple-600">
                            {splitFilterMonth ? `Partner Share — ${activeMonthLabel}` : "Partner Total"}
                          </p>
                          <p className="mt-1 text-lg font-semibold tracking-tight text-purple-700 [overflow-wrap:anywhere]">₦{splitsTotals.partner.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Cards below `md`, with each split's log opening under its
                      card; the table from `md` up. The card list brings its
                      own padding, so it cancels the panel's on a phone. */}
                  <div className="-mx-4 sm:-mx-7 md:mx-0">
                    <ResponsiveTable
                      rows={filteredSplits.map(buildSplitRow)}
                      columns={splitColumns}
                      rowKey={(row) => row.s.id}
                      renderCard={renderSplitCard}
                      isExpanded={(row) => row.isExpanded}
                      renderExpanded={renderSplitDetail}
                      rowClassName={(row) => (row.isExpanded ? "!bg-blue-50/60" : "")}
                    />
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </AdminPage>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((m) => ({ ...m, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Delete split"
        type="danger"
      />
    </ProtectedRoute>
  );
}
