"use client";
import { adminFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { Receipt, Download, Search, RefreshCw } from "lucide-react";
import {
  AdminPage,
  Panel,
  Kpi,
  GLASS_INPUT,
  GLASS_INPUT_ICON,
  IconButton,
  ResponsiveTable,
  MobileCard,
  EmptyState,
  type Column,
} from "@/components/admin/ui";
import type { Hostel } from "@/types";

interface DataPurchase {
  id: string;
  planId: string;
  planName: string;
  usersCount: number;
  price: number;
  codeId: string;
  purchasedAt: Date;
  customerEmail?: string;
  hostel?: string;
}

export default function PurchaseLogsPage() {
  const { adminProfile } = useAuthStore();
  const [purchases, setPurchases] = useState<DataPurchase[]>([]);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterHostel, setFilterHostel] = useState<string>("all");

  // `hasMore` tells us the server had more rows than the page we asked for.
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchHostels();
  }, []);

  // Re-ask the server when the hostel filter changes, instead of downloading
  // the whole ledger once and filtering it in the browser.
  useEffect(() => {
    void fetchPurchases();
  }, [filterHostel]);

  const fetchHostels = async () => {
    try {
      const res = await adminFetch("/api/hostels");
      if (res.ok) {
        const data = await res.json();
        setHostels(data.hostels ?? []);
      }
    } catch {
      // non-critical
    }
  };

  const PAGE_SIZE = 300;

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (filterHostel !== "all") params.set("hostel", filterHostel);
      const res = await adminFetch(`/api/admin/transactions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load purchases");

      const purchases: DataPurchase[] = (data.dataPurchases ?? []).map(
        (d: any) => ({
          id: d.id,
          planId: d.planId,
          planName: d.planName,
          usersCount: d.usersCount ?? 0,
          price: d.price ?? 0,
          codeId: d.codeId ?? "",
          customerEmail: d.customerEmail,
          hostel: d.hostel ?? "",
          purchasedAt: d.purchasedAt ? new Date(d.purchasedAt) : new Date(0),
        }),
      );
      setPurchases(purchases);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error("Error fetching purchases:", err);
    } finally {
      setLoading(false);
    }
  };

  // Restrict visible purchases to admin's allowed hostels
  const visiblePurchases = useMemo(() => {
    if (!adminProfile?.hostels?.length || adminProfile?.isSuperAdmin)
      return purchases;
    return purchases.filter((p) => allowedHostelNames.has(p.hostel ?? ""));
  }, [purchases, allowedHostelNames, adminProfile]);

  // Merge allowed hostels (from API) with any legacy hostel values found in visible purchases
  const allHostelNames = useMemo(
    () =>
      Array.from(
        new Set([
          ...allowedHostels.map((h) => h.name),
          ...visiblePurchases
            .map((p) => p.hostel)
            .filter((n): n is string => !!n && allowedHostelNames.has(n)),
        ]),
      ).sort(),
    [allowedHostels, allowedHostelNames, visiblePurchases],
  );

  const filteredPurchases = visiblePurchases.filter((purchase) => {
    const matchesSearch =
      searchTerm === "" ||
      purchase.planName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan =
      filterPlan === "all" || purchase.planName === filterPlan;
    const matchesHostel =
      filterHostel === "all" || (purchase.hostel || "") === filterHostel;
    return matchesSearch && matchesPlan && matchesHostel;
  });

  const totalRevenue = filteredPurchases.reduce(
    (sum, purchase) => sum + purchase.price,
    0,
  );
  const uniquePlans = Array.from(
    new Set(filteredPurchases.map((p) => p.planName)),
  );

  const exportToCSV = () => {
    const headers = ["Date", "Hostel", "Plan Name", "Users", "Price", "Customer Email"];
    const rows = filteredPurchases.map((p) => [
      p.purchasedAt.toLocaleDateString(),
      p.hostel || "N/A",
      p.planName,
      p.usersCount,
      `₦${p.price.toFixed(2)}`,
      p.customerEmail || "N/A",
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const columns: Column<DataPurchase>[] = [
    {
      key: "date",
      header: "Date",
      className: "whitespace-nowrap",
      cell: (purchase) => (
        <>
          <span className="text-slate-900">{purchase.purchasedAt.toLocaleDateString()}</span>
          <br />
          <span className="text-xs text-slate-400">{purchase.purchasedAt.toLocaleTimeString()}</span>
        </>
      ),
    },
    {
      key: "hostel",
      header: "Hostel",
      className: "whitespace-nowrap",
      cell: (purchase) => purchase.hostel || <span className="text-slate-400">—</span>,
    },
    {
      key: "plan",
      header: "Plan",
      className: "whitespace-nowrap",
      cell: (purchase) => <span className="font-medium text-slate-900">{purchase.planName}</span>,
    },
    { key: "users", header: "Users", className: "whitespace-nowrap", cell: (purchase) => purchase.usersCount },
    {
      key: "price",
      header: "Price",
      className: "whitespace-nowrap",
      cell: (purchase) => <span className="font-medium text-emerald-600">₦{purchase.price.toFixed(2)}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      className: "max-w-[220px] truncate",
      cell: (purchase) => purchase.customerEmail || "N/A",
    },
  ];

  return (
    <ProtectedRoute module="transactions">
      <AdminPage
        eyebrow="TRANSACTIONS"
        title="Purchase Logs"
        actions={
          <IconButton
            label="Refresh purchases"
            onClick={() => { setPurchases([]); setLoading(true); fetchPurchases(); }}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </IconButton>
        }
      >
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Total Purchases" value={visiblePurchases.length} tone="blue" icon={<Receipt className="w-4 h-4" />} />
          <Kpi label="Total Revenue" value={`₦${totalRevenue.toFixed(2)}`} tone="green" icon={<Receipt className="w-4 h-4" />} />
          <Kpi label="Unique Plans" value={uniquePlans.length} tone="purple" icon={<Receipt className="w-4 h-4" />} />
        </div>

        {/* Filters */}
        <Panel>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className={GLASS_INPUT_ICON} />
              <input
                type="text"
                placeholder="Search by plan or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${GLASS_INPUT} pl-11`}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
              <select
                value={filterHostel}
                onChange={(e) => setFilterHostel(e.target.value)}
                className={`${GLASS_INPUT} sm:w-48`}
              >
                <option value="all">All Hostels</option>
                {allHostelNames.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className={`${GLASS_INPUT} sm:w-48`}
              >
                <option value="all">All Plans</option>
                {uniquePlans.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
              <button
                onClick={exportToCSV}
                disabled={filteredPurchases.length === 0}
                className="glass-primary w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </Panel>

        {/* Purchases Table */}
        <Panel flush>
          {loading ? (
            <EmptyState title="Loading purchases..." />
          ) : filteredPurchases.length === 0 ? (
            <EmptyState
              title={
                searchTerm || filterPlan !== "all"
                  ? "No purchases match your filters"
                  : "No purchases yet"
              }
            />
          ) : (
            <ResponsiveTable
              rows={filteredPurchases}
              columns={columns}
              rowKey={(purchase) => purchase.id}
              renderCard={(purchase) => (
                <MobileCard
                  title={purchase.planName}
                  aside={<span className="text-emerald-600">₦{purchase.price.toFixed(2)}</span>}
                  subtitle={`${purchase.hostel || "—"} · ${purchase.usersCount} users`}
                  lines={[
                    <span key="email" className="block truncate">{purchase.customerEmail || "N/A"}</span>,
                    <span key="date" className="text-xs text-slate-500">
                      {purchase.purchasedAt.toLocaleDateString()} {purchase.purchasedAt.toLocaleTimeString()}
                    </span>,
                  ]}
                />
              )}
            />
          )}
        </Panel>

        {/* Summary */}
        {filteredPurchases.length > 0 && (
          <p className="text-sm text-slate-500 sm:text-right">
            Showing {filteredPurchases.length} of {visiblePurchases.length} purchases
            {hasMore && ` — latest ${PAGE_SIZE}; pick a hostel to narrow the search`}
          </p>
        )}
      </AdminPage>
    </ProtectedRoute>
  );
}
