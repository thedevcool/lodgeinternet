"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt, Download, Search, LogOut, RefreshCw } from "lucide-react";
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
  const { logout, adminProfile } = useAuthStore();
  const router = useRouter();
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

  useEffect(() => {
    fetchPurchases();
    fetchHostels();
  }, []);

  const fetchHostels = async () => {
    try {
      const res = await apiFetch("/api/hostels");
      if (res.ok) {
        const data = await res.json();
        setHostels(data.hostels ?? []);
      }
    } catch {
      // non-critical
    }
  };

  const fetchPurchases = async () => {
    try {
      const res = await apiFetch("/api/admin/transactions");
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

  return (
    <ProtectedRoute module="purchase-logs">
      <div className="min-h-screen bg-apple-gray-50">
        <header className="bg-white shadow-sm border-b border-apple-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Logo variant="dark" />
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent">
                  Purchase Logs
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/dashboard"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
                <button
                  onClick={() => { setPurchases([]); setLoading(true); fetchPurchases(); }}
                  disabled={loading}
                  title="Refresh purchases"
                  className="p-2 text-apple-gray-500 hover:text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => {
                    logout();
                    router.push("/admin/login");
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Receipt className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-apple-gray-600">Total Purchases</p>
                  <p className="text-2xl font-bold text-apple-gray-900">
                    {visiblePurchases.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Receipt className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-apple-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-apple-gray-900">
                    ₦{totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Receipt className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-apple-gray-600">Unique Plans</p>
                  <p className="text-2xl font-bold text-apple-gray-900">
                    {uniquePlans.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex-1 w-full sm:w-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-apple-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by plan or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-apple-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto flex-wrap">
                <select
                  value={filterHostel}
                  onChange={(e) => setFilterHostel(e.target.value)}
                  className="px-4 py-2 border border-apple-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="px-4 py-2 border border-apple-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Purchases Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-apple-gray-500">
                  Loading purchases...
                </div>
              ) : filteredPurchases.length === 0 ? (
                <div className="p-8 text-center text-apple-gray-500">
                  {searchTerm || filterPlan !== "all"
                    ? "No purchases match your filters"
                    : "No purchases yet"}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-apple-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Hostel
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Users
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Customer
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-apple-gray-200">
                    {filteredPurchases.map((purchase) => (
                      <tr key={purchase.id} className="hover:bg-apple-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-apple-gray-900">
                          {purchase.purchasedAt.toLocaleDateString()}
                          <br />
                          <span className="text-xs text-apple-gray-400">
                            {purchase.purchasedAt.toLocaleTimeString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-apple-gray-600">
                          {purchase.hostel || (
                            <span className="text-apple-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-apple-gray-900">
                            {purchase.planName}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-apple-gray-900">
                          {purchase.usersCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-600">
                          ₦{purchase.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-apple-gray-900 max-w-[160px] truncate">
                          {purchase.customerEmail || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Summary */}
          {filteredPurchases.length > 0 && (
            <div className="mt-4 text-sm text-apple-gray-600 text-right">
              Showing {filteredPurchases.length} of {visiblePurchases.length} purchases
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
