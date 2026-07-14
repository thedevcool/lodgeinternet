"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Tv,
  CheckCircle,
  Clock,
  XCircle,
  Trash2,
  Edit2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import ConfirmationModal from "@/components/ConfirmationModal";
import type { TVSubscription } from "@/types";
import type { Hostel } from "@/types";

interface TVPlanOption {
  id: string;
  name: string;
  duration: number;
  price: number;
}

export default function AdminTVUsersPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("tv-users");
  const router = useRouter();
  const { addToast } = useToast();

  const [subscriptions, setSubscriptions] = useState<TVSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "active" | "expired">(
    "pending",
  );
  const [activating, setActivating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [checkingExpiry, setCheckingExpiry] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState("");

  // Plan update
  const [tvPlans, setTvPlans] = useState<TVPlanOption[]>([]);
  const [planModal, setPlanModal] = useState<{
    subId: string;
    subName: string;
    currentPlanId: string;
  } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [updatingPlan, setUpdatingPlan] = useState(false);

  // Hostel filter
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
  const [filterHostel, setFilterHostel] = useState("all");

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: "delete" | "migrate";
    subscriptionId?: string;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    type: "delete",
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchSubscriptions();
    fetchTVPlans();
    fetchHostels();
  }, []);

  const fetchHostels = async () => {
    try {
      const res = await apiFetch("/api/hostels");
      if (res.ok) {
        const data = await res.json();
        const all = data.hostels ?? [];
        setHostels(all);
        // Auto-select filter if restricted to exactly one hostel
        const allowed =
          !adminProfile?.hostels?.length || adminProfile?.isSuperAdmin
            ? all
            : all.filter(
                (h: { id: string }) =>
                  adminProfile?.hostels?.includes(h.id) ?? false,
              );
        if (allowed.length === 1) {
          setFilterHostel(allowed[0].name);
        }
      }
    } catch {
      // non-critical
    }
  };

  const fetchTVPlans = async () => {
    try {
      const res = await apiFetch("/api/tv/plans");
      if (res.ok) {
        const data = await res.json();
        setTvPlans(data.plans ?? []);
      }
    } catch {
      // non-critical
    }
  };

  const handleUpdatePlan = async () => {
    if (!planModal || !selectedPlanId) return;
    setUpdatingPlan(true);
    try {
      const res = await apiFetch("/api/tv/update-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: planModal.subId,
          planId: selectedPlanId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update plan");
      await fetchSubscriptions();
      addToast({
        type: "success",
        title: "Plan Updated",
        message: `Plan changed to ${data.planName}`,
      });
      setPlanModal(null);
      setSelectedPlanId("");
    } catch (err: any) {
      addToast({ type: "error", title: "Update Failed", message: err.message });
    } finally {
      setUpdatingPlan(false);
    }
  };

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(`/api/tv/subscriptions?isAdmin=true`);

      if (!response.ok) {
        throw new Error("Failed to fetch subscriptions");
      }

      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
    } catch (err: any) {
      console.error("Error fetching subscriptions:", err);
      setError(err.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (subscriptionId: string) => {
    setActivating(subscriptionId);
    setError("");

    try {
      const response = await apiFetch("/api/tv/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscriptionId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to activate subscription");
      }

      // Refresh subscriptions
      await fetchSubscriptions();
      addToast({
        type: "success",
        title: "Subscription Activated",
        message: "Subscription activated successfully!",
      });
    } catch (err: any) {
      console.error("Error activating subscription:", err);
      setError(err.message || "Failed to activate subscription");
    } finally {
      setActivating(null);
    }
  };

  const handleCheckExpiry = async () => {
    setCheckingExpiry(true);
    setError("");

    try {
      const response = await apiFetch("/api/tv/check-expiry", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to check expiry");
      }

      // Refresh subscriptions to show updated statuses
      await fetchSubscriptions();

      const { expiringSoonNotifications, expiredNotifications } =
        result.results;
      addToast({
        type: "success",
        title: "Expiry Check Complete",
        message: `Expiry check completed!\n- Expiring soon notifications: ${expiringSoonNotifications}\n- Expired notifications: ${expiredNotifications}`,
      });
    } catch (err: any) {
      console.error("Error checking expiry:", err);
      setError(err.message || "Failed to check expiry");
    } finally {
      setCheckingExpiry(false);
    }
  };

  const handleDelete = async (subscriptionId: string) => {
    setConfirmModal({
      isOpen: true,
      type: "delete",
      subscriptionId,
      title: "Delete Subscription",
      message:
        "Are you sure you want to permanently delete this subscription? This action cannot be undone.",
      onConfirm: () => confirmDelete(subscriptionId),
    });
  };

  const confirmDelete = async (subscriptionId: string) => {
    setDeleting(subscriptionId);
    setError("");

    try {
      const response = await apiFetch(`/api/tv/delete?id=${subscriptionId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete subscription");
      }

      // Refresh subscriptions
      await fetchSubscriptions();
      addToast({
        type: "success",
        title: "Subscription Deleted",
        message: "Subscription deleted successfully!",
      });
    } catch (err: any) {
      console.error("Error deleting subscription:", err);
      addToast({
        type: "error",
        title: "Delete Failed",
        message: err.message || "Failed to delete subscription",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleMigrateMacAddresses = async () => {
    setConfirmModal({
      isOpen: true,
      type: "migrate",
      title: "Migrate MAC Addresses",
      message:
        "This will migrate MAC addresses from old hash format to encrypted format. This is safe to run multiple times. Continue?",
      onConfirm: () => confirmMigration(),
    });
  };

  const confirmMigration = async () => {
    setMigrating(true);
    setError("");

    try {
      const response = await apiFetch("/api/admin/migrate-mac-addresses", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to migrate MAC addresses");
      }

      // Refresh subscriptions to show updated statuses
      await fetchSubscriptions();

      addToast({
        type: "success",
        title: "Migration Complete",
        message: `MAC address migration completed!\n- Updated ${result.updatedCount} subscription(s)\n- Please refresh the page to see changes`,
      });
    } catch (err: any) {
      console.error("Error migrating MAC addresses:", err);
      setError(err.message || "Failed to migrate MAC addresses");
    } finally {
      setMigrating(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  const filteredSubscriptions = subscriptions.filter((s) => {
    // Enforce hostel-level access — hide subscriptions from non-allowed hostels
    if (
      adminProfile?.hostels?.length &&
      !adminProfile.isSuperAdmin &&
      !allowedHostelNames.has(s.hostel ?? "")
    )
      return false;
    if (
      activeTab === "pending" &&
      s.subscriptionStatus !== "pending_activation"
    )
      return false;
    if (activeTab === "active" && s.subscriptionStatus !== "active")
      return false;
    if (activeTab === "expired" && s.subscriptionStatus !== "expired")
      return false;
    if (filterHostel !== "all" && (s.hostel || "") !== filterHostel)
      return false;
    return true;
  });

  const pendingCount = subscriptions.filter(
    (s) => s.subscriptionStatus === "pending_activation",
  ).length;
  const activeCount = subscriptions.filter(
    (s) => s.subscriptionStatus === "active",
  ).length;
  const expiredCount = subscriptions.filter(
    (s) => s.subscriptionStatus === "expired",
  ).length;

  return (
    <ProtectedRoute module="tv-users">
      <div className="min-h-screen bg-apple-gray-100">
        {/* Header */}
        <header className="bg-white border-b border-apple-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center">
                <Logo />
              </Link>
              <div className="flex items-center gap-2 sm:gap-4">
                <Link
                  href="/admin/data-codes"
                  className="hidden sm:block text-apple-gray-600 hover:text-apple-gray-800 text-sm font-medium"
                >
                  Data Codes
                </Link>
                <Link
                  href="/admin/purchase-logs"
                  className="hidden sm:block text-apple-gray-600 hover:text-apple-gray-800 text-sm font-medium"
                >
                  Purchase Logs
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-apple-gray-700 hover:text-apple-gray-900 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-apple-gray-900 mb-2">
                TV Unlimited Users
              </h1>
              <p className="text-apple-gray-600">
                Manage TV subscription activations and view user details
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={handleMigrateMacAddresses}
                disabled={migrating}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {migrating ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Migrating...
                  </span>
                ) : (
                  "Fix MAC Addresses"
                )}
              </button>
              <button
                onClick={handleCheckExpiry}
                disabled={checkingExpiry}
                className="px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkingExpiry ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Checking...
                  </span>
                ) : (
                  "Check for Expiring Subscriptions"
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6 border-b border-apple-gray-200 overflow-x-auto">
            {/* Hostel filter */}
            {allowedHostels.length > 0 && (
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-apple-gray-600">
                  Hostel:
                </span>
                {(!adminProfile?.hostels?.length ||
                  adminProfile?.isSuperAdmin) && (
                  <button
                    onClick={() => setFilterHostel("all")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      filterHostel === "all"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                    }`}
                  >
                    All
                  </button>
                )}
                {allowedHostels.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setFilterHostel(h.name)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      filterHostel === h.name
                        ? "bg-blue-100 text-blue-700"
                        : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                    }`}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-3 sm:gap-6 min-w-max">
              <button
                onClick={() => setActiveTab("pending")}
                className={`pb-4 px-2 font-medium text-sm transition-colors relative ${
                  activeTab === "pending"
                    ? "text-apple-blue border-b-2 border-apple-blue"
                    : "text-apple-gray-600 hover:text-apple-gray-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Pending Activation
                  {pendingCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab("active")}
                className={`pb-4 px-2 font-medium text-sm transition-colors relative ${
                  activeTab === "active"
                    ? "text-apple-blue border-b-2 border-apple-blue"
                    : "text-apple-gray-600 hover:text-apple-gray-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Active
                  {activeCount > 0 && (
                    <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {activeCount}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab("expired")}
                className={`pb-4 px-2 font-medium text-sm transition-colors relative ${
                  activeTab === "expired"
                    ? "text-apple-blue border-b-2 border-apple-blue"
                    : "text-apple-gray-600 hover:text-apple-gray-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Expired
                  {expiredCount > 0 && (
                    <span className="bg-apple-gray-400 text-white text-xs px-2 py-0.5 rounded-full">
                      {expiredCount}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Subscriptions List */}
          <div className="bg-white rounded-xl shadow-sm border border-apple-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-apple-gray-600">
                Loading subscriptions...
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="p-8 text-center text-apple-gray-600">
                <Tv className="w-12 h-12 mx-auto mb-3 text-apple-gray-400" />
                <p>No {activeTab} subscriptions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-apple-gray-50 border-b border-apple-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-600 uppercase tracking-wider whitespace-nowrap">
                        User Details
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-600 uppercase tracking-wider whitespace-nowrap">
                        MAC Address
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Payment
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Dates
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-apple-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-apple-gray-200">
                    {filteredSubscriptions.map((subscription) => (
                      <tr
                        key={subscription.id}
                        className="hover:bg-apple-gray-50"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <div className="font-medium text-apple-gray-900 whitespace-nowrap">
                              {subscription.name ||
                                subscription.email?.split("@")[0] ||
                                "—"}
                            </div>
                            <div className="text-apple-gray-600 max-w-[140px] truncate">
                              {subscription.email}
                            </div>
                            {subscription.hostel && (
                              <div className="text-xs text-blue-600 font-medium mt-0.5">
                                {subscription.hostel}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <div className="font-medium text-apple-gray-900 whitespace-nowrap">
                              {subscription.planName}
                            </div>
                            <div className="text-apple-gray-600 whitespace-nowrap">
                              {subscription.duration} days • ₦
                              {subscription.price.toLocaleString()}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-mono text-apple-gray-900 whitespace-nowrap">
                            {(subscription as any).macAddress || "****"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <div className="text-apple-gray-900 whitespace-nowrap">
                              ₦{subscription.price.toLocaleString()}
                            </div>
                            <div className="text-xs text-apple-gray-600 max-w-[120px] truncate">
                              Ref: {subscription.paymentRef}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-apple-gray-600 whitespace-nowrap">
                            <div>
                              Paid:{" "}
                              {new Date(
                                subscription.paidAt,
                              ).toLocaleDateString()}
                            </div>
                            {subscription.activatedAt && (
                              <div className="text-green-600">
                                Activated:{" "}
                                {new Date(
                                  subscription.activatedAt,
                                ).toLocaleDateString()}
                              </div>
                            )}
                            {subscription.expiresAt && (
                              <div className="text-red-600">
                                Expires:{" "}
                                {new Date(
                                  subscription.expiresAt,
                                ).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {activeTab === "pending" && canEdit && (
                              <button
                                onClick={() => handleActivate(subscription.id)}
                                disabled={activating === subscription.id}
                                className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                {activating === subscription.id
                                  ? "Activating..."
                                  : "Activate"}
                              </button>
                            )}
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => {
                                    setPlanModal({
                                      subId: subscription.id,
                                      subName:
                                        subscription.name || subscription.email,
                                      currentPlanId: subscription.planId,
                                    });
                                    setSelectedPlanId(subscription.planId);
                                  }}
                                  className="bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  Plan
                                </button>
                                <button
                                  onClick={() => handleDelete(subscription.id)}
                                  disabled={deleting === subscription.id}
                                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  {deleting === subscription.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Plan Update Modal */}
      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-apple-gray-900 mb-1">
              Update Subscription Plan
            </h3>
            <p className="text-sm text-apple-gray-600 mb-5">
              Subscriber:{" "}
              <span className="font-semibold">{planModal.subName}</span>
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {tvPlans.length === 0 ? (
                <p className="text-sm text-apple-gray-500 text-center py-6">
                  Loading plans…
                </p>
              ) : (
                tvPlans.map((plan) => (
                  <label
                    key={plan.id}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      selectedPlanId === plan.id
                        ? "border-blue-400 bg-blue-50"
                        : "border-apple-gray-200 hover:border-apple-gray-300 hover:bg-apple-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tvPlan"
                      value={plan.id}
                      checked={selectedPlanId === plan.id}
                      onChange={() => setSelectedPlanId(plan.id)}
                      className="accent-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-apple-gray-900">
                        {plan.name}
                      </p>
                      <p className="text-xs text-apple-gray-500">
                        {plan.duration} days · ₦{plan.price.toLocaleString()}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setPlanModal(null);
                  setSelectedPlanId("");
                }}
                className="flex-1 py-2.5 rounded-xl border border-apple-gray-200 text-apple-gray-700 text-sm font-semibold hover:bg-apple-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePlan}
                disabled={!selectedPlanId || updatingPlan}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingPlan ? "Updating…" : "Update Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type === "delete" ? "danger" : "warning"}
        confirmText={confirmModal.type === "delete" ? "Delete" : "Continue"}
      />
    </ProtectedRoute>
  );
}
