"use client";
import { apiFetch } from "@/lib/apiClient";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import {
  ArrowLeft,
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

const MAINTENANCE_PCT = 10;
const PAYSTACK_PCT = 1.5;
const SPLITTABLE_PCT = 100 - MAINTENANCE_PCT - PAYSTACK_PCT; // 88.5

export default function AdminTransactionsPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const isPartner = adminProfile?.isPartner ?? false;
  const canEdit = canWrite("transactions");
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
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

  // Transaction filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHostel, setFilterHostel] = useState("all");
  const [filterPlanType, setFilterPlanType] = useState<
    "all" | "device" | "tv" | "unlimited"
  >("all");
  const [filterPaymentSource, setFilterPaymentSource] = useState<
    "all" | "bot" | "site"
  >("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

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
    MAINTENANCE_PCT,
  );
  const [splitAdminEmail, setSplitAdminEmail] = useState("");
  const [splitPartnerEmail, setSplitPartnerEmail] = useState("");
  const [splitSendMonthlyEmail, setSplitSendMonthlyEmail] = useState(false);

  useEffect(() => {
    fetchAll();
    if (!isPartner) {
      fetchSplits();
      fetchPartners();
      fetchBotTransactions();
    }
  }, []);

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

  const fetchTransactions = async () => {
    try {
      const res = await apiFetch("/api/admin/transactions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load transactions");

      const toDate = (iso: string | null): Date =>
        iso ? new Date(iso) : new Date(0);

      const dataPurchases: DataPurchaseRow[] = (data.dataPurchases ?? []).map(
        (d: any) => ({
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
        }),
      );

      const tvPurchases: TvPurchaseRow[] = (data.tvPurchases ?? []).map(
        (d: any) => ({
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
        }),
      );

      const all: TransactionRow[] = [...dataPurchases, ...tvPurchases].sort(
        (a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime(),
      );
      const VALID_PLAN_TYPES = new Set(["device", "tv", "unlimited"]);
      // Partner responses omit customerEmail (PII) by design, so only the admin
      // view requires it — otherwise every partner row is dropped here and the
      // ledger shows blank.
      const partnerView = data.partnerView === true;
      const valid = all.filter(
        (t) =>
          VALID_PLAN_TYPES.has(t.planType) &&
          (partnerView || !!t.customerEmail?.trim()),
      );
      setTransactions(valid);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError("Failed to load transactions. Please try again.");
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
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      // Enforce hostel-level access
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
    });
  }, [
    transactions,
    filterHostel,
    filterPlanType,
    filterPaymentSource,
    filterDateFrom,
    filterDateTo,
    searchTerm,
    adminProfile,
    allowedHostelNames,
  ]);

  const totalRevenue = filtered.reduce((s, t) => s + t.price, 0);

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
  const totalPartnerShare = filtered.reduce(
    (sum, transaction) => sum + partnerShareFor(transaction),
    0,
  );

  // ── Partner Payouts (admin-only) ──────────────────────────────────────────
  // For each partner, sum each of their hostels' FULL revenue over the selected
  // period, apply their split (whole or per-hostel), and show their cut plus the
  // admin's kept share (gross − cut). No split records are created.
  const payoutTransactions = useMemo(() => {
    if (payoutMode === "all") return transactions;
    return transactions.filter((t) => {
      if (!t.purchasedAt) return false;
      const d = new Date(t.purchasedAt);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return ym === payoutMonth;
    });
  }, [transactions, payoutMode, payoutMonth]);

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

  const byHostel = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const t of filtered) {
      const h = t.hostel ?? "Unknown";
      if (!map[h]) map[h] = { count: 0, revenue: 0 };
      map[h].count += 1;
      map[h].revenue += t.price;
    }
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filtered]);

  const knownHostels = useMemo(() => {
    const names = new Set<string>();
    // Only include allowed hostels from the API
    allowedHostels.forEach((h) => names.add(h.name));
    // Also include legacy hostel values from transactions that are within allowed set
    transactions.forEach((t) => {
      if (t.hostel && allowedHostelNames.has(t.hostel)) names.add(t.hostel);
    });
    return Array.from(names).sort();
  }, [transactions, allowedHostels, allowedHostelNames]);

  const exportToExcel = () => {
    const rows = filtered.map((t) =>
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
    const summaryRows = [
      { Label: "Total Transactions", Value: filtered.length },
      isPartner
        ? { Label: "Your Total Share (₦)", Value: totalPartnerShare }
        : { Label: "Total Revenue (₦)", Value: totalRevenue },
      ...(isPartner
        ? []
        : [
            { Label: "", Value: "" },
            { Label: "Hostel", Value: "Transactions", Revenue: "Revenue (₦)" },
            ...byHostel.map(([hostel, stats]) => ({
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
    const relevant = transactions.filter(
      (t) =>
        (t.hostel ?? "Unknown") === splitHostel &&
        t.purchasedAt >= from &&
        t.purchasedAt <= to,
    );
    const mPct =
      typeof splitMaintenancePct === "number"
        ? splitMaintenancePct
        : MAINTENANCE_PCT;
    const grossRev = relevant.reduce((s, t) => s + t.price, 0);
    const mainDed = Math.round((grossRev * mPct) / 100);
    const paystackDed = Math.round((grossRev * PAYSTACK_PCT) / 100);
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
    transactions,
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
              : MAINTENANCE_PCT,
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
      setSplitMaintenancePct(MAINTENANCE_PCT);
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
    const mPct = s.maintenancePct ?? MAINTENANCE_PCT;
    const grossRev = txns.reduce((a, t) => a + t.price, 0);
    const mainDed = Math.round((grossRev * mPct) / 100);
    const paystackDed = Math.round((grossRev * PAYSTACK_PCT) / 100);
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
      paystackPct: PAYSTACK_PCT,
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

  const getSplitTransactions = (
    s: SplitRecord,
    monthFilter?: string,
  ): TransactionRow[] => {
    const from = new Date(s.dateFrom);
    from.setHours(0, 0, 0, 0);
    const to = s.dateTo ? new Date(s.dateTo) : new Date();
    to.setHours(23, 59, 59, 999);
    let txns = transactions.filter(
      (t) =>
        (t.hostel ?? "Unknown") === s.hostel &&
        t.purchasedAt >= from &&
        t.purchasedAt <= to,
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
  };

  const exportSplitLog = (
    s: SplitRecord,
    txns: TransactionRow[],
    periodLabel?: string,
  ) => {
    if (txns.length === 0) return;
    const mPct = s.maintenancePct ?? MAINTENANCE_PCT;
    const splittablePctExport = 100 - mPct - PAYSTACK_PCT;
    const grossRev = txns.reduce((a, t) => a + t.price, 0);
    const mainDed = Math.round((grossRev * mPct) / 100);
    const paystackDed = Math.round((grossRev * PAYSTACK_PCT) / 100);
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
      { Label: `Paystack Deduction ${PAYSTACK_PCT}% (₦)`, Value: paystackDed },
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
      <div className='min-h-screen bg-apple-gray-50'>
        <header className='bg-white shadow-sm border-b border-apple-gray-200 sticky top-0 z-10'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <Logo variant='dark' />
                <h1 className='text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent'>
                  Transaction Audit
                </h1>
              </div>
              <div className='flex items-center gap-3'>
                <Link
                  href='/admin/dashboard'
                  className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                  <ArrowLeft className='w-4 h-4' />
                  <span className='hidden sm:inline'>Dashboard</span>
                </Link>
                <button
                  onClick={() => fetchAll()}
                  disabled={loading}
                  title='Refresh transactions'
                  className='p-2 text-apple-gray-500 hover:text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors disabled:opacity-40'>
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  onClick={handleLogout}
                  className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                  <LogOut className='w-4 h-4' />
                  <span className='hidden sm:inline'>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6'>
          {error && (
            <div className='px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm'>
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className='overflow-x-auto'>
            <div className='inline-flex items-center bg-apple-gray-100 rounded-2xl p-1.5 shadow-inner min-w-max'>
              <button
                onClick={() => setActiveTab("transactions")}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "transactions"
                    ? "bg-white text-apple-gray-900 shadow-sm"
                    : "text-apple-gray-600 hover:text-apple-gray-900"
                }`}>
                <BarChart3 className='w-4 h-4' />
                {isPartner ? "My Transactions" : "Transactions"}
              </button>
              {!isPartner && (
                <>
                  <button
                    onClick={() => setActiveTab("payouts")}
                    className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "payouts"
                        ? "bg-white text-apple-gray-900 shadow-sm"
                        : "text-apple-gray-600 hover:text-apple-gray-900"
                    }`}>
                    <Wallet className='w-4 h-4' />
                    Partner Payouts
                    {partners.length > 0 && (
                      <span className='ml-1 px-1.5 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700'>
                        {partners.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("splits")}
                    className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "splits"
                        ? "bg-white text-apple-gray-900 shadow-sm"
                        : "text-apple-gray-600 hover:text-apple-gray-900"
                    }`}>
                    <Scissors className='w-4 h-4' />
                    Split Counter
                    {splitRecords.length > 0 && (
                      <span className='ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700'>
                        {splitRecords.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("bot")}
                    className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "bot"
                        ? "bg-white text-apple-gray-900 shadow-sm"
                        : "text-apple-gray-600 hover:text-apple-gray-900"
                    }`}>
                    <Bot className='w-4 h-4' />
                    Bot Transactions
                    {botTxns.length > 0 && (
                      <span className='ml-1 px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700'>
                        {botTxns.length}
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── TRANSACTIONS TAB ─────────────────────────────────────────── */}
          {activeTab === "transactions" && (
            <>
              {/* Summary cards */}
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${isPartner ? "" : "lg:grid-cols-4"}`}>
                {isPartner ? (
                  <>
                    <div className='bg-white rounded-2xl shadow-sm p-5'>
                      <p className='text-sm text-apple-gray-500 mb-1'>
                        Transactions
                      </p>
                      <p className='text-3xl font-bold text-apple-gray-900'>
                        {loading ? "—" : filtered.length.toLocaleString()}
                      </p>
                    </div>
                    <div className='bg-white rounded-2xl shadow-sm p-5'>
                      <p className='text-sm text-apple-gray-500 mb-1'>Profit</p>
                      <p className='text-3xl font-bold text-purple-600'>
                        {loading
                          ? "—"
                          : `₦${totalPartnerShare.toLocaleString()}`}
                      </p>
                      {/* <p className="text-xs text-apple-gray-400 mt-1">
                        {partnerSplitPercent}% of revenue
                      </p> */}
                    </div>
                  </>
                ) : (
                  <>
                    <div className='bg-white rounded-2xl shadow-sm p-5'>
                      <p className='text-sm text-apple-gray-500 mb-1'>
                        Total Transactions
                      </p>
                      <p className='text-3xl font-bold text-apple-gray-900'>
                        {loading ? "—" : filtered.length.toLocaleString()}
                      </p>
                    </div>
                    <div className='bg-white rounded-2xl shadow-sm p-5'>
                      <p className='text-sm text-apple-gray-500 mb-1'>
                        Total Revenue
                      </p>
                      <p className='text-3xl font-bold text-green-600'>
                        {loading ? "—" : `₦${totalRevenue.toLocaleString()}`}
                      </p>
                    </div>
                    <div className='bg-white rounded-2xl shadow-sm p-5'>
                      <p className='text-sm text-apple-gray-500 mb-1'>
                        Device Plans
                      </p>
                      <p className='text-3xl font-bold text-blue-600'>
                        {loading
                          ? "—"
                          : filtered
                              .filter((t) => t.planType === "device")
                              .length.toLocaleString()}
                      </p>
                    </div>
                    <div className='bg-white rounded-2xl shadow-sm p-5'>
                      <p className='text-sm text-apple-gray-500 mb-1'>
                        TV Plans
                      </p>
                      <p className='text-3xl font-bold text-purple-600'>
                        {loading
                          ? "—"
                          : filtered
                              .filter((t) => t.planType === "tv")
                              .length.toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Per-hostel breakdown */}
              {!isPartner && !loading && byHostel.length > 0 && (
                <div className='bg-white rounded-3xl shadow-sm p-6'>
                  <h2 className='text-base font-semibold text-apple-gray-900 mb-4 flex items-center gap-2'>
                    <Building2 className='w-4 h-4 text-blue-500' />
                    Revenue by Hostel
                  </h2>
                  <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'>
                    {byHostel.map(([hostel, stats]) => (
                      <div
                        key={hostel}
                        className='bg-apple-gray-50 rounded-2xl px-4 py-3'>
                        <p className='text-sm font-medium text-apple-gray-700 truncate'>
                          {hostel}
                        </p>
                        <p className='text-lg font-bold text-apple-gray-900'>
                          ₦{stats.revenue.toLocaleString()}
                        </p>
                        <p className='text-xs text-apple-gray-500'>
                          {stats.count} transaction
                          {stats.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filters + Export */}
              <div className='bg-white rounded-3xl shadow-sm p-6'>
                <div className='flex flex-col gap-4'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'>
                    <div className='relative'>
                      <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400' />
                      <input
                        type='text'
                        placeholder='Search email, plan, ref…'
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className='w-full pl-10 pr-4 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300'
                      />
                    </div>
                    <select
                      value={filterHostel}
                      onChange={(e) => setFilterHostel(e.target.value)}
                      className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                      <option value='all'>All Hostels</option>
                      {knownHostels.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterPlanType}
                      onChange={(e) =>
                        setFilterPlanType(
                          e.target.value as typeof filterPlanType,
                        )
                      }
                      className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                      <option value='all'>All Plan Types</option>
                      <option value='device'>Device Plan</option>
                      <option value='tv'>TV Plan</option>
                      <option value='unlimited'>Unlimited</option>
                    </select>
                    <select
                      value={filterPaymentSource}
                      onChange={(e) =>
                        setFilterPaymentSource(
                          e.target.value as typeof filterPaymentSource,
                        )
                      }
                      className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                      <option value='all'>All Sources</option>
                      <option value='bot'>Paid with Bot</option>
                      <option value='site'>Paid on Site</option>
                    </select>
                    <div className='flex gap-2'>
                      <input
                        type='date'
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        className='flex-1 px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        title='Date from'
                      />
                      <input
                        type='date'
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        className='flex-1 px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        title='Date to'
                      />
                    </div>
                  </div>
                  <div className='flex items-center justify-between'>
                    <p className='text-sm text-apple-gray-500'>
                      {isPartner
                        ? `${filtered.length} transaction${filtered.length !== 1 ? "s" : ""} • ₦${totalPartnerShare.toLocaleString()} your share`
                        : `${filtered.length} transaction${filtered.length !== 1 ? "s" : ""} • ₦${totalRevenue.toLocaleString()} total`}
                    </p>
                    <button
                      onClick={exportToExcel}
                      disabled={filtered.length === 0}
                      className='flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all'>
                      <Download className='w-4 h-4' />
                      Export Excel
                    </button>
                  </div>
                </div>
              </div>

              {/* Transactions table */}
              <div className='bg-white rounded-3xl shadow-sm overflow-hidden'>
                {loading ? (
                  <div className='py-16 text-center text-apple-gray-400'>
                    Loading transactions…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className='py-16 text-center text-apple-gray-400'>
                    No transactions match your filters.
                  </div>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full'>
                      <thead>
                        <tr className='border-b border-apple-gray-100 bg-apple-gray-50'>
                          <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                            Date
                          </th>
                          <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                            Plan
                          </th>
                          <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                            Type
                          </th>
                          <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                            Hostel
                          </th>
                          {!isPartner && (
                            <>
                              <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                Source
                              </th>
                              <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                Email
                              </th>
                              <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                Ref
                              </th>
                            </>
                          )}
                          <th className='px-5 py-3 text-right text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                            {isPartner ? "Your Share" : "Amount"}
                          </th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-apple-gray-50'>
                        {filtered.map((t) => (
                          <tr
                            key={t.id}
                            className='hover:bg-apple-gray-50 transition-colors'>
                            <td className='px-5 py-3.5 text-sm text-apple-gray-600 whitespace-nowrap'>
                              {t.purchasedAt.toLocaleDateString("en-NG", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                              <br />
                              <span className='text-xs text-apple-gray-400'>
                                {t.purchasedAt.toLocaleTimeString("en-NG", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </td>
                            <td className='px-5 py-3.5 text-sm font-medium text-apple-gray-900'>
                              {t.planName}
                            </td>
                            <td className='px-5 py-3.5'>
                              <PlanTypeBadge type={t.planType} />
                            </td>
                            <td className='px-5 py-3.5 text-sm text-apple-gray-600'>
                              {t.hostel ?? (
                                <span className='text-apple-gray-400'>
                                  Unknown
                                </span>
                              )}
                            </td>
                            {!isPartner && (
                              <>
                                <td className='px-5 py-3.5'>
                                  {"paymentSource" in t && (t as DataPurchaseRow).paymentSource === "bot" ? (
                                    <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700'>
                                      <Smartphone className='w-3 h-3' />
                                      Bot
                                    </span>
                                  ) : (
                                    <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600'>
                                      Site
                                    </span>
                                  )}
                                </td>
                                <td className='px-5 py-3.5 text-sm text-apple-gray-600 max-w-[180px] truncate'>
                                  {t.customerEmail ?? (
                                    <span className='text-apple-gray-400'>
                                      N/A
                                    </span>
                                  )}
                                </td>
                                <td className='px-5 py-3.5 text-xs text-apple-gray-500 font-mono'>
                                  {t.paymentRef ? (
                                    <span title={t.paymentRef}>
                                      {t.paymentRef.length > 14
                                        ? t.paymentRef.slice(0, 14) + "…"
                                        : t.paymentRef}
                                    </span>
                                  ) : (
                                    <span className='text-apple-gray-400'>
                                      —
                                    </span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className='px-5 py-3.5 text-sm font-semibold text-apple-gray-900 text-right whitespace-nowrap'>
                              ₦
                              {(isPartner
                                ? partnerShareFor(t)
                                : t.price
                              ).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── PARTNER PAYOUTS TAB (admin-only) ─────────────────────────── */}
          {!isPartner && activeTab === "payouts" && (
            <>
              {/* Period control */}
              <div className='flex flex-wrap items-center gap-3'>
                <div className='inline-flex rounded-xl border border-apple-gray-200 bg-white p-0.5 text-sm font-semibold'>
                  <button
                    onClick={() => setPayoutMode("all")}
                    className={`px-4 py-1.5 rounded-lg transition-colors ${
                      payoutMode === "all"
                        ? "bg-apple-gray-900 text-white"
                        : "text-apple-gray-600 hover:text-apple-gray-900"
                    }`}>
                    All time
                  </button>
                  <button
                    onClick={() => setPayoutMode("month")}
                    className={`px-4 py-1.5 rounded-lg transition-colors ${
                      payoutMode === "month"
                        ? "bg-apple-gray-900 text-white"
                        : "text-apple-gray-600 hover:text-apple-gray-900"
                    }`}>
                    By month
                  </button>
                </div>
                {payoutMode === "month" && (
                  <input
                    type='month'
                    value={payoutMonth}
                    onChange={(e) => setPayoutMonth(e.target.value)}
                    className='px-3 py-2 rounded-xl border border-apple-gray-200 bg-white text-sm text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-apple-gray-300'
                    aria-label='Payout month'
                  />
                )}
              </div>

              {/* Grand totals */}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div className='bg-white rounded-2xl shadow-sm p-5'>
                  <p className='text-sm text-apple-gray-500 mb-1'>
                    Total to pay partners
                  </p>
                  <p className='text-3xl font-bold text-purple-600'>
                    {loading
                      ? "—"
                      : `₦${payoutTotals.partnerTotal.toLocaleString()}`}
                  </p>
                  <p className='text-xs text-apple-gray-400 mt-1'>
                    {payoutMode === "all" ? "All time" : payoutMonth}
                  </p>
                </div>
                <div className='bg-white rounded-2xl shadow-sm p-5'>
                  <p className='text-sm text-apple-gray-500 mb-1'>
                    Your share from partnered hostels
                  </p>
                  <p className='text-3xl font-bold text-apple-gray-900'>
                    {loading
                      ? "—"
                      : `₦${payoutTotals.adminTotal.toLocaleString()}`}
                  </p>
                </div>
              </div>

              {/* Per-partner breakdown */}
              {partners.length === 0 ? (
                <div className='bg-white rounded-2xl shadow-sm p-10 text-center text-apple-gray-500'>
                  No partner accounts yet. Mark an admin as a partner (in Admin
                  Management) to see their payouts here.
                </div>
              ) : (
                <div className='space-y-4'>
                  {partnerPayouts.map((p) => (
                    <div
                      key={p.id}
                      className='bg-white rounded-2xl shadow-sm overflow-hidden'>
                      <div className='flex items-center justify-between gap-4 p-5 border-b border-apple-gray-100'>
                        <div className='flex items-center gap-3'>
                          <div className='w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0'>
                            <Wallet className='w-5 h-5 text-purple-600' />
                          </div>
                          <div>
                            <p className='font-semibold text-apple-gray-900'>
                              {p.username}
                            </p>
                            <p className='text-xs text-apple-gray-500'>
                              {p.mode === "perHostel"
                                ? "Per-hostel split"
                                : "Same split for all hostels"}
                            </p>
                          </div>
                        </div>
                        <div className='text-right shrink-0'>
                          <p className='text-xs text-apple-gray-500'>You pay</p>
                          <p className='text-xl font-bold text-purple-600'>
                            ₦{p.totalCut.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {p.rows.length === 0 ? (
                        <div className='p-5 text-sm text-apple-gray-500'>
                          No revenue in this period.
                        </div>
                      ) : (
                        <div className='overflow-x-auto'>
                          <table className='w-full text-sm'>
                            <thead>
                              <tr className='text-left text-xs text-apple-gray-500 border-b border-apple-gray-100'>
                                <th className='px-5 py-2 font-medium'>Hostel</th>
                                <th className='px-5 py-2 font-medium text-right'>
                                  Revenue
                                </th>
                                <th className='px-5 py-2 font-medium text-right'>
                                  Split
                                </th>
                                <th className='px-5 py-2 font-medium text-right'>
                                  Partner cut
                                </th>
                                <th className='px-5 py-2 font-medium text-right'>
                                  Your share
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.rows.map((r) => (
                                <tr
                                  key={r.hostelId}
                                  className='border-b border-apple-gray-50 last:border-0'>
                                  <td className='px-5 py-2.5 text-apple-gray-900'>
                                    {r.name}
                                  </td>
                                  <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                    ₦{r.gross.toLocaleString()}
                                  </td>
                                  <td className='px-5 py-2.5 text-right text-apple-gray-500'>
                                    {r.pct}%
                                  </td>
                                  <td className='px-5 py-2.5 text-right font-semibold text-purple-600'>
                                    ₦{r.cut.toLocaleString()}
                                  </td>
                                  <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                    ₦{r.adminGain.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className='border-t border-apple-gray-100 font-semibold text-apple-gray-900'>
                                <td className='px-5 py-2.5'>Total</td>
                                <td className='px-5 py-2.5 text-right'>
                                  ₦{p.totalGross.toLocaleString()}
                                </td>
                                <td></td>
                                <td className='px-5 py-2.5 text-right text-purple-600'>
                                  ₦{p.totalCut.toLocaleString()}
                                </td>
                                <td className='px-5 py-2.5 text-right'>
                                  ₦{p.adminGain.toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── BOT TRANSACTIONS TAB ─────────────────────────────────────── */}
          {!isPartner && activeTab === "bot" && (
            <>
              {/* Filters: period + hostel */}
              <div className='flex flex-wrap items-center gap-3'>
                <div className='inline-flex rounded-xl border border-apple-gray-200 bg-white p-0.5 text-sm font-semibold'>
                  {(["all", "day", "month", "year"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setBotPeriodMode(m)}
                      className={`px-3.5 py-1.5 rounded-lg capitalize transition-colors ${
                        botPeriodMode === m
                          ? "bg-apple-gray-900 text-white"
                          : "text-apple-gray-600 hover:text-apple-gray-900"
                      }`}>
                      {m === "all" ? "All time" : m}
                    </button>
                  ))}
                </div>
                {botPeriodMode === "day" && (
                  <input
                    type='date'
                    value={botDay}
                    onChange={(e) => setBotDay(e.target.value)}
                    className='px-3 py-2 rounded-xl border border-apple-gray-200 bg-white text-sm text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-apple-gray-300'
                    aria-label='Day'
                  />
                )}
                {botPeriodMode === "month" && (
                  <input
                    type='month'
                    value={botMonth}
                    onChange={(e) => setBotMonth(e.target.value)}
                    className='px-3 py-2 rounded-xl border border-apple-gray-200 bg-white text-sm text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-apple-gray-300'
                    aria-label='Month'
                  />
                )}
                {botPeriodMode === "year" && (
                  <input
                    type='number'
                    value={botYear}
                    onChange={(e) => setBotYear(e.target.value)}
                    min='2020'
                    max='2100'
                    className='w-28 px-3 py-2 rounded-xl border border-apple-gray-200 bg-white text-sm text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-apple-gray-300'
                    aria-label='Year'
                  />
                )}
                <select
                  value={botHostel}
                  onChange={(e) => setBotHostel(e.target.value)}
                  className='px-3 py-2 rounded-xl border border-apple-gray-200 bg-white text-sm text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-apple-gray-300'
                  aria-label='Hostel'>
                  <option value='all'>All hostels</option>
                  {knownHostels.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Headline cards */}
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                <div className='bg-white rounded-2xl shadow-sm p-5'>
                  <p className='text-sm text-apple-gray-500 mb-1'>Live 5% total</p>
                  <p className='text-3xl font-bold text-green-600'>
                    {loading ? "—" : `₦${botTotals.fee.toLocaleString()}`}
                  </p>
                  <p className='text-xs text-apple-gray-400 mt-1'>
                    {botPeriodLabel}
                  </p>
                </div>
                <div className='bg-white rounded-2xl shadow-sm p-5'>
                  <p className='text-sm text-apple-gray-500 mb-1'>
                    Gross collected
                  </p>
                  <p className='text-3xl font-bold text-apple-gray-900'>
                    {loading ? "—" : `₦${botTotals.gross.toLocaleString()}`}
                  </p>
                </div>
                <div className='bg-white rounded-2xl shadow-sm p-5'>
                  <p className='text-sm text-apple-gray-500 mb-1'>Transactions</p>
                  <p className='text-3xl font-bold text-apple-gray-900'>
                    {loading ? "—" : botTotals.count.toLocaleString()}
                  </p>
                </div>
              </div>

              {botFiltered.length === 0 ? (
                <div className='bg-white rounded-2xl shadow-sm p-10 text-center text-apple-gray-500'>
                  No completed bot transactions for this filter yet.
                </div>
              ) : (
                <>
                  {/* Summaries: by hostel + by month */}
                  <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div className='bg-white rounded-2xl shadow-sm overflow-hidden'>
                      <div className='px-5 py-3 border-b border-apple-gray-100 font-semibold text-apple-gray-900'>
                        By hostel
                      </div>
                      <div className='overflow-x-auto'>
                        <table className='w-full text-sm'>
                          <thead>
                            <tr className='text-left text-xs text-apple-gray-500 border-b border-apple-gray-100'>
                              <th className='px-5 py-2 font-medium'>Hostel</th>
                              <th className='px-5 py-2 font-medium text-right'>
                                Txns
                              </th>
                              <th className='px-5 py-2 font-medium text-right'>
                                Gross
                              </th>
                              <th className='px-5 py-2 font-medium text-right'>
                                5% total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {botByHostel.map(([name, v]) => (
                              <tr
                                key={name}
                                className='border-b border-apple-gray-50 last:border-0'>
                                <td className='px-5 py-2.5 text-apple-gray-900'>
                                  {name}
                                </td>
                                <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                  {v.count}
                                </td>
                                <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                  ₦{v.gross.toLocaleString()}
                                </td>
                                <td className='px-5 py-2.5 text-right font-semibold text-green-600'>
                                  ₦{v.fee.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className='border-t border-apple-gray-100 font-semibold text-apple-gray-900'>
                              <td className='px-5 py-2.5'>Total</td>
                              <td className='px-5 py-2.5 text-right'>
                                {botTotals.count}
                              </td>
                              <td className='px-5 py-2.5 text-right'>
                                ₦{botTotals.gross.toLocaleString()}
                              </td>
                              <td className='px-5 py-2.5 text-right text-green-600'>
                                ₦{botTotals.fee.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    <div className='bg-white rounded-2xl shadow-sm overflow-hidden'>
                      <div className='px-5 py-3 border-b border-apple-gray-100 font-semibold text-apple-gray-900'>
                        By month
                      </div>
                      <div className='overflow-x-auto'>
                        <table className='w-full text-sm'>
                          <thead>
                            <tr className='text-left text-xs text-apple-gray-500 border-b border-apple-gray-100'>
                              <th className='px-5 py-2 font-medium'>Month</th>
                              <th className='px-5 py-2 font-medium text-right'>
                                Txns
                              </th>
                              <th className='px-5 py-2 font-medium text-right'>
                                Gross
                              </th>
                              <th className='px-5 py-2 font-medium text-right'>
                                5% total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {botByMonth.map(([month, v]) => (
                              <tr
                                key={month}
                                className='border-b border-apple-gray-50 last:border-0'>
                                <td className='px-5 py-2.5 text-apple-gray-900'>
                                  {month}
                                </td>
                                <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                  {v.count}
                                </td>
                                <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                  ₦{v.gross.toLocaleString()}
                                </td>
                                <td className='px-5 py-2.5 text-right font-semibold text-green-600'>
                                  ₦{v.fee.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Transaction list */}
                  <div className='bg-white rounded-2xl shadow-sm overflow-hidden'>
                    <div className='px-5 py-3 border-b border-apple-gray-100 font-semibold text-apple-gray-900'>
                      Transactions
                    </div>
                    <div className='overflow-x-auto'>
                      <table className='w-full text-sm'>
                        <thead>
                          <tr className='text-left text-xs text-apple-gray-500 border-b border-apple-gray-100'>
                            <th className='px-5 py-2 font-medium'>Date</th>
                            <th className='px-5 py-2 font-medium'>Plan</th>
                            <th className='px-5 py-2 font-medium'>Hostel</th>
                            <th className='px-5 py-2 font-medium'>Method</th>
                            <th className='px-5 py-2 font-medium text-right'>
                              Gross
                            </th>
                            <th className='px-5 py-2 font-medium text-right'>
                              5% charge
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {botFiltered.map((t) => (
                            <tr
                              key={t.id}
                              className='border-b border-apple-gray-50 last:border-0'>
                              <td className='px-5 py-2.5 text-apple-gray-700 whitespace-nowrap'>
                                {t.completedAt
                                  ? new Date(t.completedAt).toLocaleString()
                                  : "—"}
                              </td>
                              <td className='px-5 py-2.5 text-apple-gray-900'>
                                {t.planName}
                              </td>
                              <td className='px-5 py-2.5 text-apple-gray-700'>
                                {t.hostel || "—"}
                              </td>
                              <td className='px-5 py-2.5 text-apple-gray-500 uppercase text-xs'>
                                {t.paymentMethod || "—"}
                              </td>
                              <td className='px-5 py-2.5 text-right text-apple-gray-700'>
                                ₦{t.gross.toLocaleString()}
                              </td>
                              <td className='px-5 py-2.5 text-right font-semibold text-green-600'>
                                ₦{t.fee.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── SPLITS TAB ───────────────────────────────────────────────── */}
          {activeTab === "splits" && (
            <>
              {splitsError && (
                <div className='px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm'>
                  {splitsError}
                </div>
              )}
              {splitSuccess && (
                <div className='px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-2xl text-sm'>
                  {splitSuccess}
                </div>
              )}

              {/* Create Split form */}
              {canEdit && !isPartner && (
                <div className='bg-white rounded-3xl shadow-sm p-6'>
                  <h2 className='text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2'>
                    <Plus className='w-5 h-5 text-blue-500' />
                    Create New Split
                  </h2>
                  {/* Deductions info banner — maintenance % editable */}
                  <div className='flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-semibold text-amber-900'>
                    <span className='flex items-center gap-1.5'>
                      🔧 Maintenance:
                      <input
                        type='number'
                        min={0}
                        max={50}
                        value={splitMaintenancePct}
                        onChange={(e) =>
                          setSplitMaintenancePct(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        className='w-14 px-1.5 py-0.5 border border-amber-300 rounded-lg text-center bg-white text-amber-900 font-bold focus:outline-none focus:ring-1 focus:ring-amber-400'
                      />
                      %
                    </span>
                    <span className='text-amber-400'>|</span>
                    <span>
                      💳 Paystack:{" "}
                      <span className='font-bold'>{PAYSTACK_PCT}%</span>
                    </span>
                    <span className='text-amber-400'>|</span>
                    <span className='text-green-700'>
                      ✓ Available:{" "}
                      <span className='font-bold'>
                        {typeof splitMaintenancePct === "number"
                          ? (100 - splitMaintenancePct - PAYSTACK_PCT).toFixed(
                              1,
                            )
                          : "—"}
                        %
                      </span>
                    </span>
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Hostel
                      </label>
                      <select
                        value={splitHostel}
                        onChange={(e) => setSplitHostel(e.target.value)}
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                        <option value=''>Select hostel…</option>
                        {knownHostels.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Split Type
                      </label>
                      <div className='flex rounded-xl overflow-hidden border border-apple-gray-200'>
                        <button
                          type='button'
                          onClick={() => setSplitIsOpen(false)}
                          className={`flex-1 py-2.5 px-3 text-sm font-semibold transition-all ${
                            !splitIsOpen
                              ? "bg-blue-500 text-white"
                              : "bg-white text-apple-gray-600 hover:bg-apple-gray-50"
                          }`}>
                          Fixed Period
                        </button>
                        <button
                          type='button'
                          onClick={() => setSplitIsOpen(true)}
                          className={`flex-1 py-2.5 px-3 text-sm font-semibold transition-all ${
                            splitIsOpen
                              ? "bg-green-500 text-white"
                              : "bg-white text-apple-gray-600 hover:bg-apple-gray-50"
                          }`}>
                          Ongoing ●
                        </button>
                      </div>
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        {splitIsOpen ? "Count From" : "Period From"}
                      </label>
                      <input
                        type='date'
                        value={splitDateFrom}
                        onChange={(e) => setSplitDateFrom(e.target.value)}
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                      />
                    </div>
                    {!splitIsOpen && (
                      <div className='flex flex-col gap-1.5'>
                        <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                          Period To
                        </label>
                        <input
                          type='date'
                          value={splitDateTo}
                          onChange={(e) => setSplitDateTo(e.target.value)}
                          className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        />
                      </div>
                    )}
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Your Share (%)
                      </label>
                      <input
                        type='number'
                        min={0}
                        max={100}
                        value={splitAdminPct}
                        onChange={(e) => {
                          const v =
                            e.target.value === "" ? "" : Number(e.target.value);
                          setSplitAdminPct(v);
                          if (typeof v === "number" && v >= 0 && v <= 100)
                            setSplitPartnerPct(100 - v);
                        }}
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        placeholder='50'
                      />
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Partner&apos;s Share (%)
                      </label>
                      <input
                        type='number'
                        min={0}
                        max={100}
                        value={splitPartnerPct}
                        onChange={(e) => {
                          const v =
                            e.target.value === "" ? "" : Number(e.target.value);
                          setSplitPartnerPct(v);
                          if (typeof v === "number" && v >= 0 && v <= 100)
                            setSplitAdminPct(100 - v);
                        }}
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        placeholder='50'
                      />
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Notes (optional)
                      </label>
                      <input
                        type='text'
                        value={splitNotes}
                        onChange={(e) => setSplitNotes(e.target.value)}
                        placeholder='e.g. March 2026 split'
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-800'
                      />
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Your Email (reports)
                      </label>
                      <input
                        type='email'
                        value={splitAdminEmail}
                        onChange={(e) => setSplitAdminEmail(e.target.value)}
                        placeholder='your@email.com'
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-800'
                      />
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Partner Email (reports)
                      </label>
                      <input
                        type='email'
                        value={splitPartnerEmail}
                        onChange={(e) => setSplitPartnerEmail(e.target.value)}
                        placeholder='partner@email.com'
                        className='px-3 py-2.5 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-800'
                      />
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-semibold text-apple-gray-600 uppercase tracking-wide'>
                        Monthly Report Email
                      </label>
                      <label className='flex items-center gap-3 cursor-pointer px-3 py-2.5 border border-apple-gray-200 rounded-xl bg-white hover:bg-apple-gray-50 transition-colors'>
                        <div className='relative shrink-0'>
                          <input
                            type='checkbox'
                            checked={splitSendMonthlyEmail}
                            onChange={(e) =>
                              setSplitSendMonthlyEmail(e.target.checked)
                            }
                            className='sr-only'
                          />
                          <div
                            className={`w-10 h-6 rounded-full transition-colors ${splitSendMonthlyEmail ? "bg-blue-500" : "bg-apple-gray-300"}`}
                          />
                          <div
                            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${splitSendMonthlyEmail ? "left-5" : "left-1"}`}
                          />
                        </div>
                        <span className='text-sm text-apple-gray-700'>
                          {splitSendMonthlyEmail
                            ? "Enabled — send monthly"
                            : "Disabled"}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Live preview */}
                  {splitPreview && (
                    <div className='mt-5 p-4 bg-apple-gray-50 rounded-2xl'>
                      {splitPreview.count === 0 ? (
                        <p className='text-sm text-apple-gray-500 text-center py-2'>
                          No transactions found for this hostel and period.
                        </p>
                      ) : (
                        <>
                          {/* Deduction pipeline chips */}
                          <div className='flex flex-wrap items-center gap-2 mb-4 text-xs'>
                            <span className='px-2.5 py-1 rounded-full bg-apple-gray-200 text-apple-gray-700 font-semibold'>
                              Gross ₦
                              {splitPreview.totalRevenue.toLocaleString()}
                            </span>
                            <span className='text-apple-gray-400'>→</span>
                            <span className='px-2.5 py-1 rounded-full bg-red-100 text-red-600 font-semibold'>
                              −₦
                              {splitPreview.maintenanceDeduction.toLocaleString()}{" "}
                              Maint.
                            </span>
                            <span className='text-apple-gray-400'>→</span>
                            <span className='px-2.5 py-1 rounded-full bg-orange-100 text-orange-600 font-semibold'>
                              −₦
                              {splitPreview.paystackDeduction.toLocaleString()}{" "}
                              Paystack
                            </span>
                            <span className='text-apple-gray-400'>→</span>
                            <span className='px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-bold'>
                              ✓ ₦
                              {splitPreview.splittableRevenue.toLocaleString()}{" "}
                              Splittable
                            </span>
                          </div>
                          <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
                            <div>
                              <p className='text-xs text-apple-gray-500'>
                                Transactions
                              </p>
                              <p className='text-2xl font-bold text-apple-gray-900'>
                                {splitPreview.count}
                              </p>
                            </div>
                            <div>
                              <p className='text-xs text-apple-gray-500'>
                                Splittable Revenue
                              </p>
                              <p className='text-2xl font-bold text-green-700'>
                                ₦
                                {splitPreview.splittableRevenue.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className='text-xs text-apple-gray-500'>
                                Your Share ({splitAdminPct}%)
                              </p>
                              <p className='text-2xl font-bold text-blue-600'>
                                ₦{splitPreview.adminShare.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className='text-xs text-apple-gray-500'>
                                Partner Share ({splitPartnerPct}%)
                              </p>
                              <p className='text-2xl font-bold text-purple-600'>
                                ₦{splitPreview.partnerShare.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className='mt-5 flex justify-end'>
                    <button
                      onClick={handleCreateSplit}
                      disabled={
                        creatingSplit ||
                        !splitHostel ||
                        !splitDateFrom ||
                        (!splitIsOpen && !splitDateTo)
                      }
                      className='flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all'>
                      <Scissors className='w-4 h-4' />
                      {creatingSplit ? "Saving…" : "Save Split"}
                    </button>
                  </div>
                </div>
              )}

              {/* Splits history */}
              <div className='bg-white rounded-3xl shadow-sm p-6'>
                <div className='flex flex-col sm:flex-row sm:items-center gap-4 mb-5'>
                  <h2 className='text-lg font-semibold text-apple-gray-900 flex items-center gap-2'>
                    <BarChart3 className='w-5 h-5 text-blue-500' />
                    Splits History
                    <span className='ml-1 text-sm font-normal text-apple-gray-500'>
                      ({filteredSplits.length})
                    </span>
                  </h2>
                  <div className='flex flex-wrap gap-3 sm:ml-auto'>
                    <select
                      value={splitFilterHostel}
                      onChange={(e) => setSplitFilterHostel(e.target.value)}
                      className='px-3 py-2 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                      <option value='all'>All Hostels</option>
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
                      className='px-3 py-2 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                      <option value=''>All Months</option>
                      {Array.from({ length: 18 }, (_, i) => {
                        const d = new Date();
                        d.setDate(1);
                        d.setMonth(d.getMonth() - i);
                        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                        const label = d.toLocaleDateString("en-NG", {
                          month: "long",
                          year: "numeric",
                        });
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
                          type='date'
                          value={splitFilterFrom}
                          onChange={(e) => setSplitFilterFrom(e.target.value)}
                          title='Created from'
                          className='px-3 py-2 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        />
                        <input
                          type='date'
                          value={splitFilterTo}
                          onChange={(e) => setSplitFilterTo(e.target.value)}
                          title='Created to'
                          className='px-3 py-2 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'
                        />
                      </>
                    )}
                    {!isPartner && (
                      <button
                        onClick={exportSplitsToExcel}
                        disabled={filteredSplits.length === 0}
                        className='flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all'>
                        <Download className='w-4 h-4' />
                        Export Excel
                      </button>
                    )}
                  </div>
                </div>

                {splitsLoading ? (
                  <div className='py-12 text-center text-apple-gray-400'>
                    Loading splits…
                  </div>
                ) : filteredSplits.length === 0 ? (
                  <div className='py-12 text-center text-apple-gray-400'>
                    {isPartner
                      ? "No splits yet."
                      : "No splits yet. Create one above."}
                  </div>
                ) : (
                  <>
                    {/* Totals summary */}
                    {(() => {
                      const activeMonthLabel = splitFilterMonth
                        ? new Date(splitFilterMonth + "-01").toLocaleDateString(
                            "en-NG",
                            { month: "long", year: "numeric" },
                          )
                        : "";
                      const totals = filteredSplits.reduce(
                        (acc, s) => {
                          const txns = splitFilterMonth
                            ? getSplitTransactions(s, splitFilterMonth)
                            : getSplitTransactions(s);
                          const gr = txns.reduce((a, t) => a + t.price, 0);
                          const mPct = s.maintenancePct ?? MAINTENANCE_PCT;
                          const splittable = Math.max(
                            0,
                            gr -
                              Math.round((gr * mPct) / 100) -
                              Math.round((gr * PAYSTACK_PCT) / 100),
                          );
                          return {
                            revenue: acc.revenue + gr,
                            admin:
                              acc.admin +
                              Math.round((splittable * s.adminPercent) / 100),
                            partner:
                              acc.partner +
                              Math.round((splittable * s.partnerPercent) / 100),
                          };
                        },
                        { revenue: 0, admin: 0, partner: 0 },
                      );
                      return (
                        <div
                          className={`grid grid-cols-2 gap-3 mb-5 ${isPartner ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
                          <div className='bg-apple-gray-50 rounded-2xl px-4 py-3'>
                            <p className='text-xs text-apple-gray-500'>
                              Splits Shown
                            </p>
                            <p className='text-xl font-bold text-apple-gray-900'>
                              {filteredSplits.length}
                            </p>
                          </div>
                          {!isPartner && (
                            <div className='bg-apple-gray-50 rounded-2xl px-4 py-3'>
                              <p className='text-xs text-apple-gray-500'>
                                {splitFilterMonth
                                  ? `Revenue — ${activeMonthLabel}`
                                  : "Total Revenue"}
                              </p>
                              <p className='text-xl font-bold text-apple-gray-900'>
                                ₦{totals.revenue.toLocaleString()}
                              </p>
                            </div>
                          )}
                          {!isPartner && (
                            <div className='bg-blue-50 rounded-2xl px-4 py-3'>
                              <p className='text-xs text-blue-600'>
                                {splitFilterMonth
                                  ? `Your Share — ${activeMonthLabel}`
                                  : "Your Total"}
                              </p>
                              <p className='text-xl font-bold text-blue-700'>
                                ₦{totals.admin.toLocaleString()}
                              </p>
                            </div>
                          )}
                          <div className='bg-purple-50 rounded-2xl px-4 py-3'>
                            <p className='text-xs text-purple-600'>
                              {splitFilterMonth
                                ? `Partner Share — ${activeMonthLabel}`
                                : "Partner Total"}
                            </p>
                            <p className='text-xl font-bold text-purple-700'>
                              ₦{totals.partner.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className='overflow-x-auto'>
                      <table className='w-full'>
                        <thead>
                          <tr className='border-b border-apple-gray-100 bg-apple-gray-50'>
                            <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                              Created
                            </th>
                            <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                              Hostel
                            </th>
                            <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                              Period
                            </th>
                            <th className='px-5 py-3 text-center text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                              Txns
                            </th>
                            {!isPartner && (
                              <th className='px-5 py-3 text-right text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                Revenue
                                {splitFilterMonth && (
                                  <span className='ml-1 normal-case font-normal text-blue-500'>
                                    (
                                    {new Date(
                                      splitFilterMonth + "-01",
                                    ).toLocaleDateString("en-NG", {
                                      month: "short",
                                      year: "numeric",
                                    })}
                                    )
                                  </span>
                                )}
                              </th>
                            )}
                            {!isPartner && (
                              <th className='px-5 py-3 text-right text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                Your Share
                              </th>
                            )}
                            <th className='px-5 py-3 text-right text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                              Partner Share
                            </th>
                            <th className='px-5 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                              Notes
                            </th>
                            <th className='px-5 py-3' />
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-apple-gray-50'>
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
                              s.maintenancePct ?? MAINTENANCE_PCT;
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
                              (grossRev * PAYSTACK_PCT) / 100,
                            );
                            const splittableRev =
                              grossRev - mainDed - paystackDed;
                            const splittablePctRow =
                              100 - sMaintPct - PAYSTACK_PCT;
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
                                <tr
                                  className={`transition-colors ${isExpanded ? "bg-blue-50" : "hover:bg-apple-gray-50"}`}>
                                  <td className='px-5 py-3.5 text-sm text-apple-gray-600 whitespace-nowrap'>
                                    {s.createdAt.toLocaleDateString("en-NG", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </td>
                                  <td className='px-5 py-3.5 text-sm font-medium text-apple-gray-900'>
                                    {s.hostel}
                                  </td>
                                  <td className='px-5 py-3.5 text-xs text-apple-gray-500 whitespace-nowrap'>
                                    {s.isOpen ? (
                                      <span className='flex items-center gap-1.5'>
                                        From {s.dateFrom}
                                        <span className='px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold'>
                                          ● Live
                                        </span>
                                      </span>
                                    ) : (
                                      <>
                                        {s.dateFrom} → {s.dateTo}
                                      </>
                                    )}
                                  </td>
                                  <td className='px-5 py-3.5 text-sm text-apple-gray-700 text-center'>
                                    {rowTxns.length}
                                  </td>
                                  {!isPartner && (
                                    <td className='px-5 py-3.5 text-sm font-semibold text-apple-gray-900 text-right whitespace-nowrap'>
                                      ₦{grossRev.toLocaleString()}
                                    </td>
                                  )}
                                  {!isPartner && (
                                    <td className='px-5 py-3.5 text-right whitespace-nowrap'>
                                      <span className='text-sm font-semibold text-blue-600'>
                                        ₦{adminShr.toLocaleString()}
                                      </span>
                                      <span className='text-xs text-apple-gray-400 ml-1'>
                                        ({s.adminPercent}%)
                                      </span>
                                    </td>
                                  )}
                                  <td className='px-5 py-3.5 text-right whitespace-nowrap'>
                                    <span className='text-sm font-semibold text-purple-600'>
                                      ₦{partnerShr.toLocaleString()}
                                    </span>
                                    {!isPartner && (
                                      <span className='text-xs text-apple-gray-400 ml-1'>
                                        ({s.partnerPercent}%)
                                      </span>
                                    )}
                                  </td>
                                  <td className='px-5 py-3.5 text-sm text-apple-gray-500 max-w-[140px] truncate'>
                                    {s.notes || (
                                      <span className='text-apple-gray-300'>
                                        —
                                      </span>
                                    )}
                                  </td>
                                  <td className='px-5 py-3.5'>
                                    {!isPartner && (
                                      <div className='flex items-center gap-1'>
                                        <button
                                          onClick={() =>
                                            setExpandedSplitId(
                                              isExpanded ? null : s.id,
                                            )
                                          }
                                          className={`p-1.5 rounded-lg transition-colors ${
                                            isExpanded
                                              ? "text-blue-500 bg-blue-100"
                                              : "text-apple-gray-400 hover:text-blue-500 hover:bg-blue-50"
                                          }`}
                                          title={
                                            isExpanded
                                              ? "Hide transaction log"
                                              : "View transaction log"
                                          }>
                                          {isExpanded ? (
                                            <ChevronUp className='w-4 h-4' />
                                          ) : (
                                            <ChevronDown className='w-4 h-4' />
                                          )}
                                        </button>
                                        {canEdit && (
                                          <button
                                            onClick={() =>
                                              handleDeleteSplit(s.id)
                                            }
                                            disabled={deletingSplit === s.id}
                                            className='p-1.5 rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors'
                                            title='Delete split'>
                                            <Trash2 className='w-4 h-4' />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td
                                      colSpan={9}
                                      className='px-0 py-0 border-b border-blue-100'>
                                      <div className='bg-blue-50 px-5 py-4 space-y-4'>
                                        {/* Deductions summary bar */}
                                        <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs px-4 py-3 bg-white rounded-2xl border border-apple-gray-200 shadow-sm'>
                                          <span className='font-semibold text-apple-gray-600'>
                                            Gross: ₦{grossRev.toLocaleString()}
                                          </span>
                                          <span className='text-apple-gray-400'>
                                            |
                                          </span>
                                          <span className='font-semibold text-red-500'>
                                            −Maint. {sMaintPct}%: −₦
                                            {mainDed.toLocaleString()}
                                          </span>
                                          <span className='text-apple-gray-400'>
                                            |
                                          </span>
                                          <span className='font-semibold text-orange-500'>
                                            −Paystack {PAYSTACK_PCT}%: −₦
                                            {paystackDed.toLocaleString()}
                                          </span>
                                          <span className='text-apple-gray-400'>
                                            |
                                          </span>
                                          <span className='font-bold text-green-700'>
                                            =Splittable{" "}
                                            {splittablePctRow.toFixed(1)}%: ₦
                                            {splittableRev.toLocaleString()}
                                          </span>
                                        </div>
                                        {/* Month filter + Export */}
                                        <div className='flex flex-wrap items-center gap-3'>
                                          <select
                                            value={
                                              expandedSplitMonths[s.id] ?? ""
                                            }
                                            onChange={(e) =>
                                              setExpandedSplitMonths(
                                                (prev) => ({
                                                  ...prev,
                                                  [s.id]: e.target.value,
                                                }),
                                              )
                                            }
                                            className='px-3 py-2 bg-white border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-700'>
                                            <option value=''>
                                              All time ({allSplitTxns.length}{" "}
                                              txns)
                                            </option>
                                            {getMonthOptions(s).map((opt) => (
                                              <option
                                                key={opt.value}
                                                value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                          <button
                                            onClick={() =>
                                              exportSplitLog(
                                                s,
                                                displayTxns,
                                                activeMonth
                                                  ? activeMonthLabel
                                                  : undefined,
                                              )
                                            }
                                            disabled={displayTxns.length === 0}
                                            className='flex items-center gap-1.5 px-3 py-2 bg-white border border-apple-gray-200 text-apple-gray-700 text-xs font-semibold rounded-xl hover:bg-apple-gray-50 disabled:opacity-50 transition-colors shadow-sm'>
                                            <Download className='w-3.5 h-3.5' />
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
                                              (mGross * PAYSTACK_PCT) / 100,
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
                                              <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-1'>
                                                <div className='bg-white rounded-2xl px-3 py-2.5 border border-apple-gray-200 shadow-sm'>
                                                  <p className='text-xs text-apple-gray-400 mb-0.5'>
                                                    Transactions
                                                  </p>
                                                  <p className='text-lg font-bold text-apple-gray-900'>
                                                    {displayTxns.length}
                                                  </p>
                                                </div>
                                                <div className='bg-white rounded-2xl px-3 py-2.5 border border-apple-gray-200 shadow-sm'>
                                                  <p className='text-xs text-apple-gray-400 mb-0.5'>
                                                    Gross Revenue
                                                  </p>
                                                  <p className='text-lg font-bold text-apple-gray-900'>
                                                    ₦{mGross.toLocaleString()}
                                                  </p>
                                                </div>
                                                <div className='bg-red-50 rounded-2xl px-3 py-2.5 border border-red-100 shadow-sm'>
                                                  <p className='text-xs text-red-400 mb-0.5'>
                                                    −Maint. {sMaintPct}%
                                                  </p>
                                                  <p className='text-lg font-bold text-red-600'>
                                                    −₦
                                                    {mMainDed.toLocaleString()}
                                                  </p>
                                                </div>
                                                <div className='bg-orange-50 rounded-2xl px-3 py-2.5 border border-orange-100 shadow-sm'>
                                                  <p className='text-xs text-orange-400 mb-0.5'>
                                                    −Paystack {PAYSTACK_PCT}%
                                                  </p>
                                                  <p className='text-lg font-bold text-orange-600'>
                                                    −₦{mPayDed.toLocaleString()}
                                                  </p>
                                                </div>
                                                <div className='bg-blue-50 rounded-2xl px-3 py-2.5 border border-blue-200 shadow-sm'>
                                                  <p className='text-xs text-blue-500 mb-0.5'>
                                                    Your Share ({s.adminPercent}
                                                    %)
                                                  </p>
                                                  <p className='text-lg font-bold text-blue-700'>
                                                    ₦
                                                    {mAdminShr.toLocaleString()}
                                                  </p>
                                                </div>
                                                <div className='bg-purple-50 rounded-2xl px-3 py-2.5 border border-purple-200 shadow-sm'>
                                                  <p className='text-xs text-purple-500 mb-0.5'>
                                                    Partner Share (
                                                    {s.partnerPercent}%)
                                                  </p>
                                                  <p className='text-lg font-bold text-purple-700'>
                                                    ₦
                                                    {mPartnerShr.toLocaleString()}
                                                  </p>
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        {/* Email section — write permission required */}
                                        {canEdit && (
                                          <div className='flex flex-col gap-3 px-4 py-3 bg-white rounded-2xl border border-apple-gray-200 shadow-sm'>
                                            {/* Quick-send buttons for stored emails */}
                                            {(s.adminEmail ||
                                              s.partnerEmail) && (
                                              <div className='flex flex-wrap items-center gap-2'>
                                                <span className='text-xs font-semibold text-apple-gray-500'>
                                                  Quick send:
                                                </span>
                                                {s.adminEmail && (
                                                  <button
                                                    onClick={() =>
                                                      handleSendSplitEmail(
                                                        s,
                                                        displayTxns,
                                                        s.adminEmail!,
                                                        periodLabel,
                                                      )
                                                    }
                                                    disabled={sendingEmail}
                                                    className='flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors'>
                                                    <Mail className='w-3 h-3' />
                                                    To Me (
                                                    {s.adminEmail.split("@")[0]}
                                                    )
                                                  </button>
                                                )}
                                                {s.partnerEmail && (
                                                  <button
                                                    onClick={() =>
                                                      handleSendSplitEmail(
                                                        s,
                                                        displayTxns,
                                                        s.partnerEmail!,
                                                        periodLabel,
                                                      )
                                                    }
                                                    disabled={sendingEmail}
                                                    className='flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors'>
                                                    <Mail className='w-3 h-3' />
                                                    To Partner (
                                                    {
                                                      s.partnerEmail.split(
                                                        "@",
                                                      )[0]
                                                    }
                                                    )
                                                  </button>
                                                )}
                                                {s.sendMonthlyEmail && (
                                                  <span className='flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-lg'>
                                                    <span className='w-1.5 h-1.5 rounded-full bg-green-500 inline-block' />
                                                    Monthly emails on
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                            {/* Manual email input */}
                                            <div className='flex flex-wrap items-center gap-3'>
                                              <Mail className='w-4 h-4 text-apple-gray-400 shrink-0' />
                                              <input
                                                type='email'
                                                placeholder='Send to any email…'
                                                value={
                                                  emailSplitId === s.id
                                                    ? emailAddress
                                                    : ""
                                                }
                                                onFocus={() => {
                                                  setEmailSplitId(s.id);
                                                  setEmailSuccess("");
                                                }}
                                                onChange={(e) => {
                                                  setEmailSplitId(s.id);
                                                  setEmailAddress(
                                                    e.target.value,
                                                  );
                                                }}
                                                className='flex-1 min-w-[200px] px-3 py-2 border border-apple-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-800'
                                              />
                                              <button
                                                onClick={() =>
                                                  handleSendSplitEmail(
                                                    s,
                                                    displayTxns,
                                                    emailSplitId === s.id
                                                      ? emailAddress
                                                      : "",
                                                    periodLabel,
                                                  )
                                                }
                                                disabled={
                                                  sendingEmail ||
                                                  !(
                                                    emailSplitId === s.id &&
                                                    emailAddress.trim()
                                                  )
                                                }
                                                className='flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all'>
                                                <Mail className='w-3.5 h-3.5' />
                                                {sendingEmail &&
                                                emailSplitId === s.id
                                                  ? "Sending…"
                                                  : "Send"}
                                              </button>
                                              {emailSuccess &&
                                                emailSplitId === s.id && (
                                                  <span className='text-xs font-semibold text-green-600'>
                                                    {emailSuccess}
                                                  </span>
                                                )}
                                            </div>
                                          </div>
                                        )}
                                        {/* Transaction table header */}
                                        <p className='text-sm font-semibold text-apple-gray-800'>
                                          Transaction Log —{" "}
                                          <span className='text-blue-600'>
                                            {s.hostel}
                                          </span>
                                          <span className='font-normal text-apple-gray-500 ml-2 text-xs'>
                                            {periodLabel}
                                          </span>
                                          <span className='ml-2 text-xs font-normal text-apple-gray-500'>
                                            ({displayTxns.length} transaction
                                            {displayTxns.length !== 1
                                              ? "s"
                                              : ""}
                                            )
                                          </span>
                                        </p>
                                        {displayTxns.length === 0 ? (
                                          <p className='text-sm text-apple-gray-400 py-4 text-center'>
                                            No transactions found for this
                                            period.
                                          </p>
                                        ) : (
                                          <div className='overflow-x-auto rounded-2xl shadow-sm'>
                                            <table className='w-full bg-white rounded-2xl overflow-hidden'>
                                              <thead>
                                                <tr className='border-b border-apple-gray-100 bg-apple-gray-50'>
                                                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                                    Date
                                                  </th>
                                                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                                    Plan
                                                  </th>
                                                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                                    Type
                                                  </th>
                                                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                                    Email
                                                  </th>
                                                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                                    Ref
                                                  </th>
                                                  <th className='px-4 py-2.5 text-right text-xs font-semibold text-apple-gray-500 uppercase tracking-wide'>
                                                    Total
                                                  </th>
                                                  <th className='px-4 py-2.5 text-right text-xs font-semibold text-blue-500 uppercase tracking-wide'>
                                                    Yours ({s.adminPercent}%)
                                                  </th>
                                                  <th className='px-4 py-2.5 text-right text-xs font-semibold text-purple-500 uppercase tracking-wide'>
                                                    Partner ({s.partnerPercent}
                                                    %)
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody className='divide-y divide-apple-gray-50'>
                                                {displayTxns.map((t) => (
                                                  <tr
                                                    key={t.id}
                                                    className='hover:bg-apple-gray-50 transition-colors'>
                                                    <td className='px-4 py-3 text-xs text-apple-gray-600 whitespace-nowrap'>
                                                      {t.purchasedAt.toLocaleDateString(
                                                        "en-NG",
                                                        {
                                                          day: "2-digit",
                                                          month: "short",
                                                          year: "numeric",
                                                        },
                                                      )}
                                                      <br />
                                                      <span className='text-apple-gray-400'>
                                                        {t.purchasedAt.toLocaleTimeString(
                                                          "en-NG",
                                                          {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                          },
                                                        )}
                                                      </span>
                                                    </td>
                                                    <td className='px-4 py-3 text-xs font-medium text-apple-gray-900'>
                                                      {t.planName}
                                                    </td>
                                                    <td className='px-4 py-3'>
                                                      <PlanTypeBadge
                                                        type={t.planType}
                                                      />
                                                    </td>
                                                    <td className='px-4 py-3 text-xs text-apple-gray-600 max-w-[160px] truncate'>
                                                      {t.customerEmail ?? (
                                                        <span className='text-apple-gray-400'>
                                                          N/A
                                                        </span>
                                                      )}
                                                    </td>
                                                    <td className='px-4 py-3 text-xs text-apple-gray-500 font-mono'>
                                                      {t.paymentRef ? (
                                                        <span
                                                          title={t.paymentRef}>
                                                          {t.paymentRef.length >
                                                          14
                                                            ? t.paymentRef.slice(
                                                                0,
                                                                14,
                                                              ) + "…"
                                                            : t.paymentRef}
                                                        </span>
                                                      ) : (
                                                        <span className='text-apple-gray-400'>
                                                          —
                                                        </span>
                                                      )}
                                                    </td>
                                                    <td className='px-4 py-3 text-xs font-semibold text-apple-gray-900 text-right whitespace-nowrap'>
                                                      ₦
                                                      {t.price.toLocaleString()}
                                                    </td>
                                                    <td className='px-4 py-3 text-xs font-semibold text-blue-600 text-right whitespace-nowrap'>
                                                      ₦
                                                      {Math.round(
                                                        (t.price *
                                                          s.adminPercent) /
                                                          100,
                                                      ).toLocaleString()}
                                                    </td>
                                                    <td className='px-4 py-3 text-xs font-semibold text-purple-600 text-right whitespace-nowrap'>
                                                      ₦
                                                      {Math.round(
                                                        (t.price *
                                                          s.partnerPercent) /
                                                          100,
                                                      ).toLocaleString()}
                                                    </td>
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
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
