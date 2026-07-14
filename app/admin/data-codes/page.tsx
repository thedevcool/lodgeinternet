"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  LogOut,
  RefreshCw,
  Trash2,
  Pencil,
  LayoutGrid,
  Receipt,
  MessageSquare,
  Star,
  Tv,
  ArrowLeft,
  Copy,
  X,
  ArrowRight,
} from "lucide-react";
import type { DataPlan, DataCode, Hostel } from "@/types";

interface DataPurchase {
  id: string;
  planId: string;
  planName: string;
  usersCount: number;
  price: number;
  codeId: string;
  purchasedAt: Date;
}

interface FeedbackItem {
  id: string;
  name: string;
  email: string;
  planName: string;
  type: "review" | "complaint";
  rating?: number;
  message: string;
  createdAt: string;
}

const USER_OPTIONS = [3, 5];

export default function AdminDataCodesPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("data-codes");
  const router = useRouter();
  const [planName, setPlanName] = useState("");
  const [planType, setPlanType] = useState<"device" | "tv" | "unlimited">(
    "device",
  );
  const [unlimitedPeriod, setUnlimitedPeriod] = useState<string>("daily");
  const [customPeriodName, setCustomPeriodName] = useState("");
  const [usersCount, setUsersCount] = useState<number>(USER_OPTIONS[0]);
  const [duration, setDuration] = useState<number>(7); // Duration in days for TV/unlimited plans
  const [price, setPrice] = useState<number>(0);
  const [codeInput, setCodeInput] = useState("");
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [isNewPlan, setIsNewPlan] = useState(true);
  const [codes, setCodes] = useState<DataCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<DataPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [showPurchases, setShowPurchases] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState<
    "all" | "review" | "complaint"
  >("all");
  const [pendingCount, setPendingCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const allowedHostels = useMemo(
    () =>
      !adminProfile?.hostels?.length || adminProfile.isSuperAdmin
        ? hostels
        : hostels.filter((h) => adminProfile.hostels.includes(h.id)),
    [hostels, adminProfile],
  );
  const [selectedAdminHostel, setSelectedAdminHostel] = useState<string>("");
  const [codeHostelFilter, setCodeHostelFilter] = useState<string>("all");

  // Edit plan modal state
  const [editingPlan, setEditingPlan] = useState<DataPlan | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editUsersCount, setEditUsersCount] = useState(0);
  const [editDuration, setEditDuration] = useState(0);
  const [editUnlimitedPeriod, setEditUnlimitedPeriod] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Duplicate modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [dupFrom, setDupFrom] = useState<string>("");
  const [dupTo, setDupTo] = useState<string>("");
  const [duplicating, setDuplicating] = useState(false);
  const [dupResult, setDupResult] = useState<string>("");

  useEffect(() => {
    fetchPlans();
    fetchPendingTVSubscriptions();
    fetchHostels();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await apiFetch("/api/admin/plans");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch plans");
      const plans: DataPlan[] = (data.plans ?? []).map((d: any) => ({
        ...d,
        createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
        updatedAt: d.updatedAt ? new Date(d.updatedAt) : undefined,
      }));
      setPlans(plans);
    } catch (err) {
      console.error("Error fetching plans:", err);
    }
  };

  // Plans scoped to the currently selected hostel — only active plans
  const hostelPlans = useMemo(
    () =>
      (selectedAdminHostel
        ? plans.filter((p) => p.hostelId === selectedAdminHostel)
        : plans
      ).filter((p) => p.isActive !== false),
    [plans, selectedAdminHostel],
  );

  const fetchPurchases = async (hostel?: string) => {
    setLoadingPurchases(true);

    try {
      const params = hostel ? `?hostel=${encodeURIComponent(hostel)}` : "";
      const response = await apiFetch(`/api/data-codes/purchases${params}`);
      const result = await response.json();

      if (response.ok) {
        const data = (result.purchases || []).map((p: any) => ({
          ...p,
          purchasedAt: p.purchasedAt ? new Date(p.purchasedAt) : null,
        })) as DataPurchase[];
        setPurchases(data);
      }
    } catch (err) {
      console.error("Error fetching purchases:", err);
    } finally {
      setLoadingPurchases(false);
    }
  };

  const fetchFeedback = async (hostel?: string) => {
    setLoadingFeedback(true);

    try {
      const params = hostel ? `?hostel=${encodeURIComponent(hostel)}` : "";
      const response = await apiFetch(`/api/data-codes/feedback${params}`);
      const result = await response.json();

      if (response.ok) {
        setFeedback(result.feedback || []);
      }
    } catch (err) {
      console.error("Error fetching feedback:", err);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const fetchPendingTVSubscriptions = async () => {
    try {
      const response = await fetch(
        "/api/tv/subscriptions?status=pending_activation",
      );
      if (response.ok) {
        const data = await response.json();
        setPendingCount(data.count || 0);
      }
    } catch (err) {
      console.error("Error fetching pending TV subscriptions:", err);
    }
  };

  const fetchHostels = async () => {
    try {
      const res = await apiFetch("/api/hostels");
      const data = await res.json();
      const all: Hostel[] = data.hostels || [];
      setHostels(all);
      // Auto-select if admin is restricted to exactly one hostel
      const allowed =
        !adminProfile?.hostels?.length || adminProfile?.isSuperAdmin
          ? all
          : all.filter((h) => adminProfile?.hostels?.includes(h.id) ?? false);
      if (allowed.length === 1) {
        setSelectedAdminHostel(allowed[0].name);
        fetchPurchases(allowed[0].name);
        fetchFeedback(allowed[0].name);
      }
    } catch (err) {
      console.error("Error fetching hostels:", err);
    }
  };

  const totalRevenue = purchases.reduce(
    (sum, purchase) => sum + purchase.price,
    0,
  );

  const selectedPlan = useMemo(() => {
    if (selectedPlanId && !isNewPlan) {
      return hostelPlans.find((plan) => plan.id === selectedPlanId);
    }
    const normalizedName = planName.trim().toLowerCase();
    return hostelPlans.find((plan) => {
      if (plan.planType !== planType) return false;
      if (plan.name.toLowerCase() !== normalizedName) return false;
      if (plan.price !== price) return false;
      if (planType === "device" && plan.usersCount !== usersCount) return false;
      if (planType === "tv" && plan.duration !== duration) return false;
      return true;
    });
  }, [
    hostelPlans,
    planName,
    planType,
    usersCount,
    duration,
    price,
    selectedPlanId,
    isNewPlan,
  ]);

  const currentHostelObj = useMemo(
    () => hostels.find((h) => h.name === selectedAdminHostel) ?? null,
    [hostels, selectedAdminHostel],
  );

  const allowedPlanTypes = useMemo<Array<"device" | "tv" | "unlimited">>(
    () =>
      currentHostelObj?.planTypes?.length
        ? (currentHostelObj.planTypes as Array<
            "device" | "tv" | "unlimited"
          >)
        : ["device", "tv", "unlimited"],
    [currentHostelObj],
  );

  const fetchCodes = async (targetPlanId: string, hostel: string) => {
    setLoadingCodes(true);
    try {
      const res = await fetch(
        `/api/data-codes/add?planId=${encodeURIComponent(targetPlanId)}&hostel=${encodeURIComponent(hostel)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load codes");
      const codes: DataCode[] = (data.codes ?? []).map((c: any) => ({
        id: c.id,
        planId: c.planId,
        hostel: c.hostel,
        codeMask: c.codeMask,
        createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
      }));
      setCodes(codes);
    } catch (err) {
      console.error("Error fetching codes:", err);
      setError("Failed to load codes for this plan.");
    } finally {
      setLoadingCodes(false);
    }
  };

  const handleLoadCodes = async () => {
    setError("");
    const plan = selectedPlan;
    if (!plan) {
      setError("No matching plan found. Add a code to create it first.");
      return;
    }

    setPlanId(plan.id);
    await fetchCodes(plan.id, selectedAdminHostel);
  };

  const handleAddCode = async () => {
    setError("");

    const currentPlanName = isNewPlan ? planName : selectedPlan?.name || "";
    const currentPlanType = isNewPlan
      ? planType
      : selectedPlan?.planType || "device";
    const currentUsersCount = isNewPlan
      ? usersCount
      : selectedPlan?.usersCount || 0;
    const currentDuration = isNewPlan ? duration : selectedPlan?.duration || 0;
    const currentPrice = isNewPlan ? price : selectedPlan?.price || 0;

    // Validation - TV plans don't need codes
    if (!currentPlanName.trim() || !currentPrice) {
      setError("Please enter plan name and price.");
      return;
    }

    if (!selectedAdminHostel) {
      setError("Please select a hostel first.");
      return;
    }

    if (currentPlanType === "device" && !codeInput.trim()) {
      setError("Please enter an access code for device plans.");
      return;
    }

    if (currentPlanType === "unlimited" && !codeInput.trim()) {
      setError("Please enter an access code for unlimited plans.");
      return;
    }

    setAdding(true);

    const currentUnlimitedPeriod = isNewPlan
      ? unlimitedPeriod === "custom"
        ? customPeriodName.trim()
        : unlimitedPeriod
      : selectedPlan?.unlimitedPeriod || "";

    try {
      const requestBody: any = {
        planName: currentPlanName.trim(),
        planType: currentPlanType,
        price: currentPrice,
        hostel: selectedAdminHostel,
      };

      // Only include relevant fields for each plan type
      if (currentPlanType === "device") {
        requestBody.usersCount = currentUsersCount;
        requestBody.code = codeInput.trim();
      } else if (currentPlanType === "unlimited") {
        requestBody.code = codeInput.trim();
        requestBody.unlimitedPeriod = currentUnlimitedPeriod;
        requestBody.usersCount = currentUsersCount;
      } else {
        requestBody.duration = currentDuration;
      }

      const response = await apiFetch("/api/data-codes/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to add code");
      }

      setPlanId(result.planId);
      if (!isNewPlan) {
        setSelectedPlanId(result.planId);
      }

      // Add to codes list for device and unlimited plans
      if ((currentPlanType === "device" || currentPlanType === "unlimited") && result.codeId) {
        setCodes((prev) => [
          {
            id: result.codeId,
            planId: result.planId,
            hostel: selectedAdminHostel,
            codeMask: result.codeMask,
            createdAt: new Date(),
          },
          ...prev,
        ]);
      }

      setCodeInput("");
      await fetchPlans();

      setSuccessMessage("Code added successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);

      // Reset form for TV plans
      if (currentPlanType === "tv") {
        setPlanName("");
        setDuration(7);
        setPrice(0);
      }
    } catch (err: any) {
      console.error("Error adding code:", err);
      setError(err?.message || "Failed to add code");
    } finally {
      setAdding(false);
    }
  };

  const handlePlanChange = (value: string) => {
    if (value === "new") {
      setIsNewPlan(true);
      setSelectedPlanId("");
      setPlanName("");
      setPlanType("device");
      setUsersCount(USER_OPTIONS[0]);
      setDuration(7);
      setPrice(0);
      setPlanId(null);
      setCodes([]);
    } else {
      const plan = hostelPlans.find((p) => p.id === value);
      if (plan) {
        setIsNewPlan(false);
        setSelectedPlanId(value);
        setPlanName(plan.name);
        setPlanType(plan.planType);
        if (plan.planType === "device") {
          setUsersCount(plan.usersCount || 3);
        } else if (plan.planType === "unlimited") {
          setUsersCount(plan.usersCount || 1);
          setDuration(plan.duration || 7);
        } else {
          setDuration(plan.duration || 7);
        }
        setPrice(plan.price);
        setPlanId(plan.id);
        if (plan.planType === "device" || plan.planType === "unlimited") {
          fetchCodes(plan.id, selectedAdminHostel);
        }
      }
    }
  };

  const handleDuplicate = async () => {
    if (!dupFrom || !dupTo || dupFrom === dupTo) return;
    setDuplicating(true);
    setDupResult("");
    setError("");

    try {
      const response = await apiFetch("/api/data-codes/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromHostel: dupFrom, toHostel: dupTo }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to duplicate");

      setDupResult(result.message);
      await fetchPlans();
    } catch (err: any) {
      setError(err?.message || "Failed to duplicate plans and codes");
    } finally {
      setDuplicating(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  const handleDeleteCode = async (codeId: string, codeMask: string) => {
    if (!confirm(`Delete code ${codeMask}?\n\nThis action cannot be undone.`)) {
      return;
    }

    setDeleting(codeId);
    setError("");

    try {
      const response = await apiFetch("/api/data-codes/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ codeId, hostel: selectedAdminHostel }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete code");
      }

      setCodes((prev) => prev.filter((code) => code.id !== codeId));
    } catch (err: any) {
      console.error("Error deleting code:", err);
      setError(err?.message || "Failed to delete code");
    } finally {
      setDeleting(null);
    }
  };

  const handleDeletePlan = async (planToDelete: DataPlan) => {
    const planDetails =
      planToDelete.planType === "device"
        ? `${planToDelete.usersCount} Users`
        : planToDelete.planType === "unlimited"
          ? (planToDelete.unlimitedPeriod || "Unlimited").charAt(0).toUpperCase() + (planToDelete.unlimitedPeriod || "unlimited").slice(1)
          : `${planToDelete.duration} Days`;

    if (
      !confirm(
        `Delete plan "${planToDelete.name}" (${planDetails} - ₦${planToDelete.price.toLocaleString()})?\n\nThis will delete the plan and ALL associated codes.\n\nThis action cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingPlan(planToDelete.id);
    setError("");

    try {
      const response = await apiFetch("/api/data-codes/delete-plan", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId: planToDelete.id, hostel: selectedAdminHostel }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete plan");
      }

      // Remove plan from list
      setPlans((prev) => prev.filter((p) => p.id !== planToDelete.id));

      // Reset if this was the selected plan
      if (selectedPlanId === planToDelete.id) {
        setSelectedPlanId("");
        setIsNewPlan(true);
        setCodes([]);
        setPlanId(null);
      }

      setSuccessMessage(
        `Plan deleted successfully. ${result.deletedCodesCount} code(s) were also removed.`,
      );
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: any) {
      console.error("Error deleting plan:", err);
      setError(err?.message || "Failed to delete plan");
    } finally {
      setDeletingPlan(null);
    }
  };

  const openEditModal = (plan: DataPlan) => {
    setEditingPlan(plan);
    setEditName(plan.name);
    setEditPrice(plan.price);
    setEditUsersCount(plan.usersCount || 0);
    setEditDuration(plan.duration || 0);
    setEditUnlimitedPeriod(plan.unlimitedPeriod || "daily");
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;
    if (!editName.trim()) {
      setError("Plan name cannot be empty.");
      return;
    }
    if (editPrice <= 0) {
      setError("Price must be a positive number.");
      return;
    }

    setSavingEdit(true);
    setError("");

    try {
      const body: any = {
        planId: editingPlan.id,
        name: editName.trim(),
        price: editPrice,
      };

      if (editingPlan.planType === "device" || editingPlan.planType === "unlimited") {
        body.usersCount = editUsersCount;
      }
      if (editingPlan.planType === "tv" || editingPlan.planType === "unlimited") {
        body.duration = editDuration;
      }
      if (editingPlan.planType === "unlimited") {
        body.unlimitedPeriod = editUnlimitedPeriod;
      }

      const response = await apiFetch("/api/data-codes/update-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to update plan");
      }

      setSuccessMessage("Plan updated successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
      setEditingPlan(null);
      await fetchPlans();
    } catch (err: any) {
      setError(err?.message || "Failed to update plan");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <ProtectedRoute module="data-codes">
      <div className="min-h-screen bg-apple-gray-50">
        {/* Success Toast Notification */}
        {successMessage && (
          <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-2xl shadow-lg flex items-center gap-3 max-w-md">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="font-medium">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage("")}
                className="ml-2 text-white/80 hover:text-white transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Logo variant="dark" />
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent">
                    Data Codes
                  </h1>
                  <p className="text-sm text-apple-gray-600">
                    Lodge Internet • Fast and Reliable Hostel Internet
                  </p>
                </div>
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
                  onClick={handleLogout}
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
          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <button
              onClick={() => router.push("/admin/tv-users")}
              className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-purple-200"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 rounded-xl">
                  <Tv className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-apple-gray-900">
                    TV Users
                  </h3>
                  <p className="text-sm text-apple-gray-600">
                    Manage TV subscriptions
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                    {pendingCount}
                  </span>
                )}
                <svg
                  className="w-5 h-5 text-apple-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>
            <button
              onClick={() => setShowPurchases(!showPurchases)}
              className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-green-200"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-r from-green-500 to-green-600 rounded-xl">
                  <Receipt className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-apple-gray-900">
                    Purchase Logs
                  </h3>
                  <p className="text-sm text-apple-gray-600">
                    {showPurchases ? "Hide" : "View"} all customer purchases
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {purchases.length}
              </div>
            </button>

            <button
              onClick={() => setShowFeedback(!showFeedback)}
              className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-purple-200"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-apple-gray-900">
                    Customer Feedback
                  </h3>
                  <p className="text-sm text-apple-gray-600">
                    {showFeedback ? "Hide" : "View"} reviews & complaints
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {feedback.length}
              </div>
            </button>

            {canEdit && (
              <button
                onClick={() => {
                  setShowDuplicateModal(true);
                  setDupFrom("");
                  setDupTo("");
                  setDupResult("");
                }}
                className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-blue-200"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                    <Copy className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-apple-gray-900">
                      Duplicate Plans
                    </h3>
                    <p className="text-sm text-apple-gray-600">
                      Copy plans & codes to another hostel
                    </p>
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-apple-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Purchases Log Section */}
          {showPurchases && (
            <section className="bg-white rounded-2xl shadow-sm p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-green-500" />
                  <h2 className="text-lg font-semibold text-apple-gray-800">
                    Purchase Log
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-sm text-apple-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    ₦{totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>

              {loadingPurchases ? (
                <div className="text-center py-8">
                  <div className="inline-block w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="mt-2 text-sm text-apple-gray-500">
                    Loading purchases...
                  </p>
                </div>
              ) : purchases.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="w-12 h-12 text-apple-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-apple-gray-500">
                    No purchases yet
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-apple-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-apple-gray-700">
                          Date
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-apple-gray-700">
                          Plan
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-apple-gray-700">
                          Users
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-apple-gray-700">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((purchase) => (
                        <tr
                          key={purchase.id}
                          className="border-b border-apple-gray-100 hover:bg-apple-gray-50"
                        >
                          <td className="py-3 px-4 text-sm text-apple-gray-600">
                            {purchase.purchasedAt?.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-apple-gray-900">
                            {purchase.planName}
                          </td>
                          <td className="py-3 px-4 text-sm text-apple-gray-600">
                            {purchase.usersCount} Users
                          </td>
                          <td className="py-3 px-4 text-sm font-semibold text-green-600 text-right">
                            ₦{purchase.price.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex items-center justify-between text-sm text-apple-gray-600">
                    <span>
                      {purchases.length} total purchase
                      {purchases.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => fetchPurchases(selectedAdminHostel || undefined)}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Data Codes Management */}
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            {/* LEFT: Plan Configuration */}
            <section className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-apple-gray-800">
                    Plan Setup
                  </h2>
                  <p className="text-sm text-apple-gray-500">
                    Configure plans per hostel
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Step 1: Hostel */}
              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  1. Select Hostel
                </label>
                <select
                  value={selectedAdminHostel}
                  onChange={(e) => {
                    const newHostelName = e.target.value;
                    setSelectedAdminHostel(newHostelName);
                    setIsNewPlan(true);
                    setSelectedPlanId("");
                    setPlanId(null);
                    setCodes([]);
                    // Re-fetch purchases and feedback scoped to new hostel
                    if (newHostelName) {
                      fetchPurchases(newHostelName);
                      fetchFeedback(newHostelName);
                    }
                    const newHostelObj = hostels.find(
                      (h) => h.name === newHostelName,
                    );
                    if (
                      newHostelObj?.planTypes?.length &&
                      !newHostelObj.planTypes.includes(planType)
                    ) {
                      setPlanType(
                        (newHostelObj.planTypes[0] as
                          | "device"
                          | "tv"
                          | "unlimited") ?? "device",
                      );
                    }
                  }}
                  className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a hostel...</option>
                  {allowedHostels.map((h) => (
                    <option key={h.id} value={h.name}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {selectedAdminHostel && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {allowedPlanTypes.map((type) => (
                      <span
                        key={type}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          type === "device"
                            ? "bg-blue-100 text-blue-700"
                            : type === "tv"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-green-100 text-green-700"
                        }`}
                      >
                        {type === "device"
                          ? "Device Plans"
                          : type === "tv"
                            ? "TV Plans"
                            : "Unlimited"}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2: Plan */}
              {selectedAdminHostel && (
                <div>
                  <p className="block text-sm font-medium text-apple-gray-700 mb-3">
                    2. Plan
                  </p>

                  {/* Mode Toggle */}
                  <div className="flex rounded-lg border border-apple-gray-200 overflow-hidden mb-5">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          const defaultType = allowedPlanTypes[0] ?? "device";
                          setIsNewPlan(true);
                          setSelectedPlanId("");
                          setPlanName("");
                          setPlanType(defaultType);
                          setUsersCount(USER_OPTIONS[0]);
                          setDuration(7);
                          setPrice(0);
                          setPlanId(null);
                          setCodes([]);
                        }}
                        className={`flex-1 py-2.5 px-4 text-sm font-medium transition-colors ${
                          isNewPlan
                            ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                            : "text-apple-gray-600 hover:bg-apple-gray-50"
                        }`}
                      >
                        + New Plan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewPlan(false);
                        setSelectedPlanId("");
                        setPlanId(null);
                        setCodes([]);
                      }}
                      className={`flex-1 py-2.5 px-4 text-sm font-medium transition-colors ${
                        !isNewPlan
                          ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                          : "text-apple-gray-600 hover:bg-apple-gray-50"
                      }`}
                    >
                      Existing (
                      {
                        hostelPlans.filter((p) =>
                          allowedPlanTypes.includes(p.planType),
                        ).length
                      }
                      )
                    </button>
                  </div>

                  {/* NEW PLAN FORM */}
                  {isNewPlan && canEdit && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                          Plan Type
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {allowedPlanTypes.includes("device") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (planType !== "device") {
                                  setPlanType("device");
                                  setPlanId(null);
                                  setCodes([]);
                                  setSelectedPlanId("");
                                  setIsNewPlan(true);
                                }
                              }}
                              className={`flex-1 px-4 py-3 rounded-lg border font-semibold transition-all ${
                                planType === "device"
                                  ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                                  : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                              }`}
                            >
                              Device
                            </button>
                          )}
                          {allowedPlanTypes.includes("unlimited") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (planType !== "unlimited") {
                                  setPlanType("unlimited");
                                  setPlanId(null);
                                  setCodes([]);
                                  setSelectedPlanId("");
                                  setIsNewPlan(true);
                                }
                              }}
                              className={`flex-1 px-4 py-3 rounded-lg border font-semibold transition-all ${
                                planType === "unlimited"
                                  ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                                  : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                              }`}
                            >
                              Unlimited
                            </button>
                          )}
                          {allowedPlanTypes.includes("tv") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (planType !== "tv") {
                                  setPlanType("tv");
                                  setPlanId(null);
                                  setCodes([]);
                                  setSelectedPlanId("");
                                  setIsNewPlan(true);
                                }
                              }}
                              className={`flex-1 px-4 py-3 rounded-lg border font-semibold transition-all ${
                                planType === "tv"
                                  ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                                  : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                              }`}
                            >
                              TV Unlimited
                            </button>
                          )}
                        </div>
                      </div>

                      {planType === "unlimited" && (
                        <div>
                          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                            Number of Devices
                          </label>
                          <input
                            type="number"
                            value={usersCount}
                            onChange={(e) => {
                              setUsersCount(Number(e.target.value));
                              setPlanId(null);
                              setCodes([]);
                            }}
                            className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g. 1, 2, 3"
                            min={1}
                            max={10}
                          />
                        </div>
                      )}

                      {planType === "unlimited" && (
                        <div>
                          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                            Unlimited Period
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {["daily", "weekly", "monthly", "yearly", "custom"].map(
                              (period) => (
                                <button
                                  key={period}
                                  type="button"
                                  onClick={() => {
                                    setUnlimitedPeriod(period);
                                    setPlanId(null);
                                    setCodes([]);
                                  }}
                                  className={`px-3 py-2 rounded-lg border font-medium text-sm capitalize transition-all ${
                                    unlimitedPeriod === period
                                      ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                                      : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                                  }`}
                                >
                                  {period}
                                </button>
                              ),
                            )}
                          </div>
                          {unlimitedPeriod === "custom" && (
                            <input
                              type="text"
                              value={customPeriodName}
                              onChange={(e) => setCustomPeriodName(e.target.value)}
                              className="w-full mt-2 px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="e.g. 3-Day, Bi-Weekly, Semester"
                            />
                          )}
                        </div>
                      )}

                      {planType === "unlimited" && (
                        <div>
                          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                            Number of Devices
                          </label>
                          <input
                            type="number"
                            value={usersCount}
                            onChange={(e) => {
                              setUsersCount(Number(e.target.value) || 1);
                              setPlanId(null);
                              setCodes([]);
                            }}
                            className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g. 3"
                            min={1}
                            max={10}
                          />
                          <p className="mt-1 text-sm text-apple-gray-500">
                            How many devices can use this plan simultaneously
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                          Plan Name
                        </label>
                        <input
                          type="text"
                          value={planName}
                          onChange={(event) => {
                            setPlanName(event.target.value);
                            setPlanId(null);
                            setCodes([]);
                          }}
                          className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={
                            planType === "device"
                              ? "e.g. Lodge Internet 10GB"
                              : planType === "unlimited"
                                ? "e.g. Daily Unlimited, Weekend Pass"
                                : "e.g. Weekly Plan, Premium Monthly"
                          }
                        />
                      </div>

                      {planType === "device" && (
                        <div>
                          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                            Number of Users
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            {USER_OPTIONS.map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => {
                                  setUsersCount(count);
                                  setPlanId(null);
                                  setCodes([]);
                                }}
                                className={`px-4 py-3 rounded-lg border font-semibold transition-all ${
                                  usersCount === count
                                    ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                                    : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                                }`}
                              >
                                {count} Users
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {planType === "tv" && (
                        <div>
                          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                            Duration (Days)
                          </label>
                          <input
                            type="number"
                            value={duration}
                            onChange={(event) => {
                              setDuration(Number(event.target.value));
                              setPlanId(null);
                              setCodes([]);
                            }}
                            className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g. 7 for weekly, 30 for monthly"
                            min={1}
                          />
                          <p className="mt-1 text-sm text-apple-gray-500">
                            e.g., 7 days (weekly), 21 days, 30 days (monthly),
                            etc.
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                          Price (₦)
                        </label>
                        <input
                          type="number"
                          value={price}
                          onChange={(event) => {
                            setPrice(Number(event.target.value));
                            setPlanId(null);
                            setCodes([]);
                          }}
                          className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g. 3500"
                          min={0}
                        />
                      </div>

                      {planType === "tv" && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800">
                            <strong>Note:</strong> TV Unlimited plans don&apos;t
                            require access codes. Users will purchase
                            subscriptions directly, and you&apos;ll activate
                            them manually from the TV Users page.
                          </p>
                          <button
                            onClick={handleAddCode}
                            disabled={adding}
                            className="mt-4 w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {adding ? "Creating Plan..." : "Create TV Plan"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXISTING PLANS */}
                  {!isNewPlan && (
                    <div>
                      {allowedPlanTypes.length > 1 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {allowedPlanTypes.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setPlanType(type)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                planType === type
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                              }`}
                            >
                              {type === "device"
                                ? "Device Plans"
                                : type === "tv"
                                  ? "TV Plans"
                                  : "Unlimited"}
                            </button>
                          ))}
                        </div>
                      )}

                      {hostelPlans.filter(
                        (p) =>
                          p.planType === planType &&
                          allowedPlanTypes.includes(p.planType),
                      ).length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {hostelPlans
                            .filter(
                              (p) =>
                                p.planType === planType &&
                                allowedPlanTypes.includes(p.planType),
                            )
                            .map((plan) => (
                              <div key={plan.id} className="relative">
                                <button
                                  type="button"
                                  onClick={() => handlePlanChange(plan.id)}
                                  className={`w-full text-left border rounded-xl p-4 transition-all ${
                                    selectedPlanId === plan.id
                                      ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400 ring-offset-1"
                                      : "border-apple-gray-200 hover:border-blue-200 hover:bg-apple-gray-50"
                                  }`}
                                >
                                  <div className="pr-7">
                                    <p className="font-semibold text-apple-gray-900 text-sm">
                                      {plan.name}
                                    </p>
                                    <p className="text-xs text-apple-gray-500 mt-0.5">
                                      {plan.planType === "device"
                                        ? `${plan.usersCount} Users`
                                        : plan.planType === "unlimited"
                                          ? `${(plan.unlimitedPeriod || "Unlimited").charAt(0).toUpperCase() + (plan.unlimitedPeriod || "unlimited").slice(1)}${plan.usersCount ? ` · ${plan.usersCount} Device${plan.usersCount !== 1 ? "s" : ""}` : ""}`
                                          : `${plan.duration} Days`}
                                    </p>
                                    <p className="text-base font-bold text-blue-600 mt-1">
                                      ₦{plan.price.toLocaleString()}
                                    </p>
                                  </div>
                                </button>
                                {canEdit && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditModal(plan);
                                      }}
                                      className="absolute top-3 right-10 flex items-center justify-center w-7 h-7 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                                      title="Edit plan"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePlan(plan);
                                      }}
                                      disabled={deletingPlan === plan.id}
                                      className="absolute top-3 right-3 flex items-center justify-center w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                      title="Delete plan"
                                    >
                                      {deletingPlan === plan.id ? (
                                        <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-sm text-apple-gray-500">
                          No{" "}
                          {planType === "device"
                            ? "device"
                            : planType === "tv"
                              ? "TV"
                              : "unlimited"}{" "}
                          plans yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* RIGHT: Code Inventory */}
            <section className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-blue-500" />
                  <div>
                    <h2 className="text-lg font-semibold text-apple-gray-800">
                      Code Inventory
                    </h2>
                    <p className="text-sm text-apple-gray-500">
                      {planId && selectedAdminHostel
                        ? `${codes.length} code${codes.length !== 1 ? "s" : ""} · ${selectedAdminHostel}`
                        : "Select a hostel and plan"}
                    </p>
                  </div>
                </div>
                {selectedPlan && (
                  <span className="text-xs font-medium text-apple-gray-600 bg-apple-gray-100 px-3 py-1 rounded-full">
                    ₦{selectedPlan.price.toLocaleString()} ·{" "}
                    {selectedPlan.planType === "device"
                      ? `${selectedPlan.usersCount} Users`
                      : selectedPlan.planType === "unlimited"
                        ? `${(selectedPlan.unlimitedPeriod || "Unlimited").charAt(0).toUpperCase() + (selectedPlan.unlimitedPeriod || "unlimited").slice(1)}${selectedPlan.usersCount ? ` · ${selectedPlan.usersCount} Device${selectedPlan.usersCount !== 1 ? "s" : ""}` : ""}`
                        : `${selectedPlan.duration} Days`}
                  </span>
                )}
              </div>

              {/* Add code row — device and unlimited plans */}
              {selectedAdminHostel &&
                canEdit &&
                ((isNewPlan && (planType === "device" || planType === "unlimited")) ||
                  (!isNewPlan && (selectedPlan?.planType === "device" || selectedPlan?.planType === "unlimited"))) && (
                  <div className="border border-apple-gray-200 rounded-xl p-4 bg-apple-gray-50">
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Add Access Code
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={codeInput}
                        onChange={(event) => setCodeInput(event.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddCode();
                        }}
                        className="flex-1 px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        placeholder="Enter access code"
                      />
                      <button
                        onClick={handleAddCode}
                        disabled={adding}
                        className="flex-shrink-0 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-3 px-5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {adding ? "..." : "Add"}
                      </button>
                    </div>
                    {!isNewPlan && planId && (
                      <button
                        onClick={handleLoadCodes}
                        type="button"
                        className="mt-2 flex items-center gap-1.5 text-sm text-apple-gray-500 hover:text-apple-gray-800 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reload codes
                      </button>
                    )}
                  </div>
                )}

              {/* States */}
              {!selectedAdminHostel ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <KeyRound className="w-12 h-12 text-apple-gray-300 mb-3" />
                  <p className="text-sm text-apple-gray-500">
                    Select a hostel and plan to manage codes
                  </p>
                </div>
              ) : (isNewPlan && planType === "tv") ||
                (!isNewPlan && selectedPlan?.planType === "tv") ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <Tv className="w-10 h-10 text-apple-gray-300 mb-2" />
                  <p className="text-sm text-apple-gray-500">
                    TV plans don&apos;t use access codes.
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Manage subscriptions from the TV Users page.
                  </p>
                </div>
              ) : !planId && !isNewPlan ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-apple-gray-500">
                    Select a plan on the left to view its codes.
                  </p>
                </div>
              ) : loadingCodes ? (
                <div className="flex items-center gap-2 text-sm text-apple-gray-500">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Loading codes...
                </div>
              ) : planId && codes.length === 0 ? (
                <div className="text-sm text-apple-gray-500">
                  No codes for {selectedAdminHostel} under this plan yet.
                </div>
              ) : null}

              {/* Code list — scoped to selected hostel */}
              {!loadingCodes && codes.length > 0 && (
                <ul className="space-y-2">
                  {codes.map((code) => (
                    <li
                      key={code.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 border border-apple-gray-200 rounded-lg hover:border-apple-gray-300 transition-colors"
                    >
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-mono text-sm text-apple-gray-700">
                          {code.codeMask}
                        </span>
                        <span className="text-xs text-apple-gray-500">
                          {code.createdAt
                            ? new Date(code.createdAt).toLocaleString()
                            : "Just now"}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() =>
                            handleDeleteCode(code.id, code.codeMask)
                          }
                          disabled={deleting === code.id}
                          className="flex items-center justify-center w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete code"
                        >
                          {deleting === code.id ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-apple-gray-500 mt-auto">
                Codes are encrypted and hashed before storage. Only masked
                values are shown here.
              </p>
            </section>
          </div>

          {/* Feedback Section */}
          {showFeedback && (
            <section className="bg-white rounded-2xl shadow-sm p-6 mt-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                  <h2 className="text-lg font-semibold text-apple-gray-800">
                    Customer Feedback
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setFeedbackFilter("all")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      feedbackFilter === "all"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                    }`}
                  >
                    All ({feedback.length})
                  </button>
                  <button
                    onClick={() => setFeedbackFilter("review")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      feedbackFilter === "review"
                        ? "bg-green-100 text-green-700"
                        : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                    }`}
                  >
                    Reviews (
                    {feedback.filter((f) => f.type === "review").length})
                  </button>
                  <button
                    onClick={() => setFeedbackFilter("complaint")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      feedbackFilter === "complaint"
                        ? "bg-red-100 text-red-700"
                        : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                    }`}
                  >
                    Complaints (
                    {feedback.filter((f) => f.type === "complaint").length})
                  </button>
                  <button
                    onClick={() => fetchFeedback(selectedAdminHostel || undefined)}
                    className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </button>
                </div>
              </div>

              {loadingFeedback ? (
                <div className="text-center py-8">
                  <div className="inline-block w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="mt-2 text-sm text-apple-gray-500">
                    Loading feedback...
                  </p>
                </div>
              ) : feedback.filter(
                  (f) => feedbackFilter === "all" || f.type === feedbackFilter,
                ).length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-apple-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-apple-gray-500">
                    {feedbackFilter === "all"
                      ? "No feedback yet"
                      : `No ${feedbackFilter}s yet`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {feedback
                    .filter(
                      (f) =>
                        feedbackFilter === "all" || f.type === feedbackFilter,
                    )
                    .map((item) => (
                      <div
                        key={item.id}
                        className={`border-2 rounded-xl p-5 transition-all ${
                          item.type === "review"
                            ? "border-green-200 bg-green-50/50 hover:border-green-300"
                            : "border-red-200 bg-red-50/50 hover:border-red-300"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-2xl ${item.type === "review" ? "text-green-600" : "text-red-600"}`}
                              >
                                {item.type === "review" ? "⭐" : "⚠️"}
                              </span>
                              <h3 className="font-semibold text-apple-gray-900">
                                {item.name}
                              </h3>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  item.type === "review"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {item.type === "review"
                                  ? "Review"
                                  : "Complaint"}
                              </span>
                            </div>
                            <p className="text-sm text-apple-gray-600">
                              {item.email} • {item.planName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-apple-gray-500">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-apple-gray-400">
                              {new Date(item.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>

                        {item.type === "review" && item.rating && (
                          <div className="flex items-center gap-1 mb-3">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-5 h-5 ${
                                  star <= item.rating!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-apple-gray-300"
                                }`}
                              />
                            ))}
                            <span className="ml-2 text-sm font-medium text-apple-gray-700">
                              {item.rating}/5
                            </span>
                          </div>
                        )}

                        <div
                          className={`p-4 rounded-lg ${
                            item.type === "review" ? "bg-white" : "bg-white"
                          }`}
                        >
                          <p className="text-apple-gray-800 whitespace-pre-wrap">
                            {item.message}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Duplicate Plans Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                    <Copy className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-apple-gray-900">
                      Duplicate Plans & Codes
                    </h3>
                    <p className="text-sm text-apple-gray-500">
                      Copy all plans and codes between hostels
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  className="p-1.5 text-apple-gray-400 hover:text-apple-gray-600 hover:bg-apple-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                    From Hostel
                  </label>
                  <select
                    value={dupFrom}
                    onChange={(e) => setDupFrom(e.target.value)}
                    className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select source hostel...</option>
                    {allowedHostels.map((h) => (
                      <option key={h.id} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-center">
                  <div className="p-2 bg-apple-gray-100 rounded-full">
                    <ArrowRight className="w-4 h-4 text-apple-gray-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                    To Hostel
                  </label>
                  <select
                    value={dupTo}
                    onChange={(e) => setDupTo(e.target.value)}
                    className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select destination hostel...</option>
                    {allowedHostels
                      .filter((h) => h.name !== dupFrom)
                      .map((h) => (
                        <option key={h.id} value={h.name}>
                          {h.name}
                        </option>
                      ))}
                  </select>
                </div>

                {dupFrom && dupTo && dupFrom !== dupTo && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm text-blue-800">
                      All plans and codes from <strong>{dupFrom}</strong> will be
                      copied to <strong>{dupTo}</strong>. Existing plans in{" "}
                      <strong>{dupTo}</strong> won&apos;t be duplicated.
                    </p>
                  </div>
                )}

                {dupResult && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-sm text-green-800 font-medium">
                      {dupResult}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-apple-gray-50 rounded-b-2xl flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-2.5 text-apple-gray-700 bg-white border border-apple-gray-300 rounded-xl hover:bg-apple-gray-50 transition-colors font-medium"
              >
                {dupResult ? "Done" : "Cancel"}
              </button>
              {!dupResult && (
                <button
                  onClick={handleDuplicate}
                  disabled={
                    duplicating || !dupFrom || !dupTo || dupFrom === dupTo
                  }
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {duplicating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Duplicating...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Duplicate
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                    <Pencil className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-apple-gray-900">
                      Edit Plan
                    </h3>
                    <p className="text-sm text-apple-gray-500">
                      Update plan details
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setEditingPlan(null); setError(""); }}
                  className="p-1.5 text-apple-gray-400 hover:text-apple-gray-600 hover:bg-apple-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                    Plan Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Plan name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                    Price (₦)
                  </label>
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                    min={0}
                  />
                </div>

                {(editingPlan.planType === "device" ||
                  editingPlan.planType === "unlimited") && (
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Users Count
                    </label>
                    <input
                      type="number"
                      value={editUsersCount}
                      onChange={(e) => setEditUsersCount(Number(e.target.value))}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                      min={1}
                    />
                  </div>
                )}

                {(editingPlan.planType === "tv" ||
                  editingPlan.planType === "unlimited") && (
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Duration (days)
                    </label>
                    <input
                      type="number"
                      value={editDuration}
                      onChange={(e) => setEditDuration(Number(e.target.value))}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                      min={1}
                    />
                  </div>
                )}

                {editingPlan.planType === "unlimited" && (
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Period
                    </label>
                    <select
                      value={editUnlimitedPeriod}
                      onChange={(e) => setEditUnlimitedPeriod(e.target.value)}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setEditingPlan(null); setError(""); }}
                  className="flex-1 px-4 py-3 border border-apple-gray-300 text-apple-gray-700 rounded-xl font-semibold hover:bg-apple-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {savingEdit ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
