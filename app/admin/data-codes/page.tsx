"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import ConfirmationModal from "@/components/ConfirmationModal";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  LogOut,
  RefreshCw,
  Trash2,
  Pencil,
  LayoutGrid,
  MessageSquare,
  Star,
  Tv,
  ArrowLeft,
  Copy,
  X,
  ArrowRight,
  Server,
  Globe,
  ShieldCheck,
  SlidersHorizontal,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Save,
  BookOpen,
  Sparkles,
} from "lucide-react";
import type { DataPlan, DataCode, Hostel } from "@/types";

interface LowStockPlan {
  id: string;
  name: string;
  hostel: string;
  remaining: number;
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

/** How often the sync report is re-read while a run is in progress. */
const SYNC_POLL_MS = 1500;

/**
 * Progress bar for a running Omada sync.
 *
 * The backend publishes a percent every so often — once per voucher group
 * through the long middle stretch — and this page polls for it. Two things
 * make that read as smooth rather than as a series of jerks:
 *
 * 1. The fill transitions over slightly longer than the poll interval, in a
 *    straight line, so it is still travelling toward the last sample when the
 *    next one arrives. A short ease (the Tailwind default) instead snaps into
 *    place and then sits still until the next poll.
 * 2. A shimmer rides on top, so a stage that genuinely takes a while to report
 *    still looks alive instead of stalled.
 */
function SyncProgressBar({ percent, label }: { percent?: number; label: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, Math.round(percent ?? 0)));
    // Only ever forward. This component unmounts when the run ends, so a fresh
    // run starts from zero on its own and there is nothing to reset — but a
    // retried stage reporting an earlier percent must not drag the bar back,
    // which reads as a fault rather than as progress.
    setShown((previous) => Math.max(previous, target));
  }, [percent]);

  return (
    <div className="mt-3">
      <div className="sync-track">
        <div
          className="sync-fill"
          style={{ width: `${shown}%` }}
          role="progressbar"
          aria-valuenow={shown}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sync progress"
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

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
  const [dataCodesSummary, setDataCodesSummary] = useState<{
    plans: { total: number; active: number; approvedForSale: number; needsMetadata: number; needsPrice: number; disabled: number };
    pools: { total: number; approvedForSale: number; needsMetadata: number; needsPrice: number; disabled: number };
  } | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [isNewPlan, setIsNewPlan] = useState(true);
  const [codes, setCodes] = useState<DataCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<string | null>(null);
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
  const [controllers, setControllers] = useState<{ id: string; name: string; memberHostels: string[] }[]>([]);
  const allowedHostels = useMemo(
    () =>
      !adminProfile?.hostels?.length || adminProfile.isSuperAdmin
        ? hostels
        : hostels.filter((h) => adminProfile.hostels.includes(h.id)),
    [hostels, adminProfile],
  );
  // Hostels with no controller (server-provided `controllerId` is null) are the
  // only ones targetable in standalone mode; controller members live in the
  // Controllers tab.
  const standaloneHostels = useMemo(
    () => allowedHostels.filter((h) => !h.controllerId),
    [allowedHostels],
  );
  const [selectedAdminHostel, setSelectedAdminHostel] = useState<string>("");
  const [codeHostelFilter, setCodeHostelFilter] = useState<string>("all");

  // Controller vs standalone add-code mode. Controller mode mints codes
  // straight into a controller's shared pool bucket (name + type + device
  // count), skipping any per-hostel plan record.
  const [mode, setMode] = useState<"standalone" | "controllers">("controllers");
  const [selectedControllerId, setSelectedControllerId] = useState("");
  const [ctrlPlanType, setCtrlPlanType] = useState<"device" | "unlimited">(
    "device",
  );
  const [ctrlPlanName, setCtrlPlanName] = useState("");
  const [ctrlUsersCount, setCtrlUsersCount] = useState<number>(USER_OPTIONS[0]);
  const [ctrlPrice, setCtrlPrice] = useState<number>(0);
  const [ctrlCode, setCtrlCode] = useState("");
  const [ctrlAdding, setCtrlAdding] = useState(false);
  const [ctrlBuckets, setCtrlBuckets] = useState<
    {
      poolKey: string;
      planName: string;
      planType: string;
      usersCount: number | null;
      price: number | null;
      needsPriceResolve: boolean;
      needsMetadataResolve?: boolean;
      sourceGroupName: string;
      codeCount: number;
      availableCount: number;
      approved?: boolean;
      enabled?: boolean;
      duration?: number;
      unlimitedPeriod?: string;
      hostelOverrides?: Record<string, { price?: number; enabled?: boolean }>;
    }[]
  >([]);
  const [loadingCtrlBuckets, setLoadingCtrlBuckets] = useState(false);
  const [selectedCtrlBucket, setSelectedCtrlBucket] = useState("");
  const [ctrlCodes, setCtrlCodes] = useState<
    {
      id: string;
      codeMask: string;
      createdAt: string | null;
      reservedBy: string | null;
      reservedUntil: string | null;
      planId: string;
      hostel: string;
      planName: string;
      planType: string;
      usersCount: number | null;
    }[]
  >([]);
  const [loadingCtrlCodes, setLoadingCtrlCodes] = useState(false);

  // Code Inventory display switch: "added" shows the manually typed codes for
  // the selected plan; "controller" shows the shared pool buckets synced from
  // Omada. For a standalone hostel the switch is purely cosmetic.
  const [invTab, setInvTab] = useState<"added" | "controller">("added");

  // Omada sync panel: last run + report + plans needing a price for each
  // controller, surfaced from the Sync quick-action button.
  interface SyncControllerStatus {
    id: string;
    name: string;
    memberHostels: string[];
    lastSync: {
      ranAt: string | null;
      added: number;
      skipped: number;
      filteredOut: number;
      groups: number;
      status: string;
      staleMarkedUnavailable?: number;
      entitlements?: { created?: number; updated?: number; deactivated?: number; unresolved?: number };
    };
    syncProgress?: { status?: string; stage?: string; percent?: number; detail?: string };
    needsPriceResolve: {
      poolKey: string;
      count: number;
      price: number | null;
      sourceGroupName: string;
      needsMetadataResolve?: boolean;
    }[];
  }
  const [showSync, setShowSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncControllerStatus[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [syncResolvePrices, setSyncResolvePrices] = useState<Record<string, string>>({});
  const [syncingResolve, setSyncingResolve] = useState<string | null>(null);
  const [syncingController, setSyncingController] = useState<string | null>(null);
  const [cleanSyncTarget, setCleanSyncTarget] = useState<{ id: string; name: string } | null>(null);
  const [syncingAllControllers, setSyncingAllControllers] = useState(false);
  const [syncDetailControllerId, setSyncDetailControllerId] = useState<string | null>(null);
  const [syncDetailBuckets, setSyncDetailBuckets] = useState<typeof ctrlBuckets>([]);
  const [syncDetailLoading, setSyncDetailLoading] = useState(false);
  const [syncPoolFilter, setSyncPoolFilter] = useState<"all" | "approved" | "enabled" | "disabled" | "metadata">("all");
  const [showAllSyncPools, setShowAllSyncPools] = useState(true);
  const [syncSavingKey, setSyncSavingKey] = useState<string | null>(null);
  const [syncPoolDrafts, setSyncPoolDrafts] = useState<Record<string, typeof ctrlBuckets[number]>>({});
  const [syncFilterPatterns, setSyncFilterPatterns] = useState<string[]>(["test", "testing"]);
  const [syncLowStockThreshold, setSyncLowStockThreshold] = useState(10);
  const [syncFilterScope, setSyncFilterScope] = useState<"global" | "controller">("global");
  const [syncFilterController, setSyncFilterController] = useState("");
  const [savingSyncFilters, setSavingSyncFilters] = useState(false);
  const [showNamingGuide, setShowNamingGuide] = useState(false);
  const [showControllerWalkthrough, setShowControllerWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [walkthroughRect, setWalkthroughRect] = useState<DOMRect | null>(null);
  const walkthroughSteps = [
    { target: "#catalogue-control-centre", title: "Your control centre", body: "This is the main overview. These counters tell you how many plans, controller pools, metadata issues, disabled pools, controllers and hostels are currently in the system.", note: "Start here whenever you need a quick health check" },
    { target: "#omada-sync-section", title: "Sync controllers", body: "This is where you refresh Omada. Sync now updates one controller; Sync all updates every controller one after another. The cards show progress and the latest results.", note: "New codes are added without duplicating existing codes" },
    { target: "#controller-sync-card", title: "Open a controller", body: "Each controller card represents one Omada network and shows its member hostels, groups, added codes, skipped duplicates, used or expired codes, and attention items. Select the card to manage its pools.", note: "One controller · many hostels · one shared inventory" },
    { target: "#controller-pool-drawer", title: "The controller sidebar", body: "This sidebar is the controller’s management room. It lists every pool, including pools with no codes yet, so you can configure a plan before stock arrives.", note: "The tour opened this sidebar for you" },
    { target: "#controller-pool-general", title: "Set the general plan rules", body: "Open a pool and set its customer-facing name, price, duration, approval and enabled state. These general rules apply to every hostel under this controller.", note: "No price means the pool cannot be sold" },
    { target: "#controller-hostel-overrides", title: "Adjust one hostel only", body: "Use per-hostel overrides when one hostel needs a different price or should not see a plan. The controller default stays unchanged for the other hostels.", note: "Useful for special hostel pricing or temporary availability" },
    { target: "#sync-filter-policy", title: "Control what gets synced", body: "The filter policy keeps test or temporary Omada groups out of your real catalogue. Global rules apply everywhere; controller rules apply only to one controller.", note: "The default filters are test and testing" },
    { target: "#plan-setup-section", title: "Plan Setup", body: "Use Controllers to work with shared Omada pools. Use Standalone only for hostels that do not belong to a controller. Controller hostels inherit their parent catalogue.", note: "Controller mode is the default" },
    { target: "#code-inventory-section", title: "Code Inventory", body: "This is where you inspect the actual stock. Added Codes shows manually managed inventory; Controller Pools shows shared Omada stock for the selected controller.", note: "The backend safely serves codes from the correct pool" },
  ];

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("lodge-controller-walkthrough-seen")) {
      setShowControllerWalkthrough(true);
    }
  }, []);

  const openControllerWalkthrough = () => {
    setWalkthroughStep(0);
    setShowControllerWalkthrough(true);
  };

  useEffect(() => {
    if (!showControllerWalkthrough) return;
    if (walkthroughStep === 1 || walkthroughStep === 2 || walkthroughStep === 3) setShowSync(true);
    if (walkthroughStep === 3 && !syncDetailControllerId && controllers[0]?.id) openSyncController(controllers[0].id);
    if (walkthroughStep > 5 && syncDetailControllerId) {
      setSyncDetailControllerId(null);
      setSyncDetailBuckets([]);
    }
    const selector = walkthroughSteps[walkthroughStep].target;
    let target: Element | null = null;
    const updateRect = () => {
      target = document.querySelector(selector);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setWalkthroughRect(target.getBoundingClientRect());
    };
    const timer = window.setTimeout(updateRect, 400);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", updateRect); window.removeEventListener("scroll", updateRect, true); };
  }, [showControllerWalkthrough, walkthroughStep]);

  const closeControllerWalkthrough = () => {
    setShowControllerWalkthrough(false);
    setSyncDetailControllerId(null);
    setSyncDetailBuckets([]);
    if (typeof window !== "undefined") localStorage.setItem("lodge-controller-walkthrough-seen", "1");
  };

  const activeControllers = useMemo(
    () => controllers.filter((c) => (c as any).isActive !== false),
    [controllers],
  );

  const catalogueSummary = useMemo(() => ({
    totalPlans: dataCodesSummary?.plans.total ?? plans.length,
    activePlans: dataCodesSummary?.plans.active ?? plans.filter((p) => p.isActive !== false).length,
    controllerPlans: plans.filter((p) => p.source === "controller").length,
    unresolved: dataCodesSummary?.pools.needsMetadata ?? plans.filter((p) => p.needsMetadataResolve || p.priceResolved === false).length,
    needsPrice: dataCodesSummary?.pools.needsPrice ?? plans.filter((p) => p.priceResolved === false).length,
    approvedForSale: dataCodesSummary?.pools.approvedForSale ?? plans.filter((p) => p.approvedForSale === true).length,
    // Controller pools are the authoritative shared inventory unit. This is
    // intentionally not the per-hostel entitlement count shown by plans.
    inactive: dataCodesSummary?.pools.disabled ?? plans.filter((p) => p.disabled === true || p.isActive === false || p.enabled === false).length,
    hostels: hostels.length,
  }), [plans, hostels, dataCodesSummary]);

  // Which controller owns the currently selected hostel (null = standalone/legacy)
  const selectedHostelController = useMemo(() => {
    if (!selectedAdminHostel) return null;
    return controllers.find((c) => c.memberHostels.includes(selectedAdminHostel)) ?? null;
  }, [controllers, selectedAdminHostel]);

  // Controller members can't be targeted in standalone mode (the picker only
  // lists server-marked standalone hostels). If the selection falls out of
  // that list, reset it so the dropdown never points at a hidden option.
  useEffect(() => {
    if (mode === "standalone" && selectedAdminHostel) {
      const stillValid = standaloneHostels.some((h) => h.name === selectedAdminHostel);
      if (!stillValid) setSelectedAdminHostel("");
    }
  }, [mode, standaloneHostels, selectedAdminHostel]);

  // Default the Code Inventory display to the controller pool view whenever a
  // controller is the active target; revert to "added" otherwise.
  useEffect(() => {
    const controllerModeTargeted =
      mode === "controllers" && !!selectedControllerId;
    setInvTab(controllerModeTargeted ? "controller" : "added");
  }, [mode, selectedControllerId]);

  // Edit plan modal state
  const [editingPlan, setEditingPlan] = useState<DataPlan | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editUsersCount, setEditUsersCount] = useState(0);
  const [editDuration, setEditDuration] = useState(0);
  const [editUnlimitedPeriod, setEditUnlimitedPeriod] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Plans that are about to sell out — surfaced as a banner so a superadmin
  // sees it on the dashboard, not only in the alert email.
  const [lowStock, setLowStock] = useState<LowStockPlan[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  // Duplicate modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [dupFrom, setDupFrom] = useState<string>("");
  const [dupTo, setDupTo] = useState<string>("");
  const [duplicating, setDuplicating] = useState(false);
  const [dupResult, setDupResult] = useState<string>("");

  useEffect(() => {
    fetchPlans();
    fetchDataCodesSummary();
    fetchSyncFilters();
    fetchPendingTVSubscriptions();
    fetchHostels();
    fetchLowStock();
    fetchControllers();
    fetchSyncStatus(false);
  }, []);

  const fetchDataCodesSummary = async () => {
    try {
      const response = await apiFetch("/api/data-codes/summary");
      if (!response.ok) return;
      const data = await response.json();
      setDataCodesSummary(data ?? null);
    } catch (err) {
      console.error("Error fetching data-code summary:", err);
    }
  };

  const fetchSyncFilters = async (controllerId = "") => {
    try {
      const query = controllerId ? `?controllerId=${encodeURIComponent(controllerId)}` : "";
      const response = await apiFetch(`/api/data-codes/sync-filters${query}`);
      if (!response.ok) return;
      const data = await response.json();
      setSyncFilterPatterns(data.controllerBlockedGroupPatterns?.length ? data.controllerBlockedGroupPatterns : data.globalBlockedGroupPatterns ?? ["test", "testing"]);
      setSyncLowStockThreshold(Number(data.controllerLowStockThreshold ?? data.globalLowStockThreshold ?? data.defaultLowStockThreshold ?? 10));
    } catch (err) {
      console.error("Error fetching sync filters:", err);
    }
  };

  const saveSyncFilters = async () => {
    setSavingSyncFilters(true);
    try {
      const response = await apiFetch("/api/data-codes/sync-filters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: syncFilterScope, controllerId: syncFilterScope === "controller" ? syncFilterController : undefined, patterns: syncFilterPatterns, lowStockThreshold: syncLowStockThreshold }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save sync filter");
      setSuccessMessage("Sync filter policy saved. It applies on the next sync.");
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: any) {
      setError(err?.message || "Failed to save sync filter");
    } finally {
      setSavingSyncFilters(false);
    }
  };

  const fetchLowStock = async () => {
    try {
      const res = await apiFetch("/api/data-codes/low-stock");
      if (!res.ok) return;
      const data = await res.json();
      setLowStock(data.plans ?? []);
      if (typeof data.threshold === "number") setLowStockThreshold(data.threshold);
    } catch (err) {
      console.error("Error fetching low stock:", err);
    }
  };

  const fetchControllers = async () => {
    try {
      const res = await apiFetch("/api/admin/controllers");
      if (!res.ok) return;
      const data = await res.json();
      const nextControllers = data.controllers ?? [];
      setControllers(nextControllers);
      if (!selectedControllerId && nextControllers[0]?.id) {
        setSelectedControllerId(nextControllers[0].id);
        fetchControllerBuckets(nextControllers[0].id, false);
      }
    } catch {
      // silently fail — controllers are optional
    }
  };

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
      const response = await apiFetch(
        "/api/tv/subscriptions?status=pending_activation&isAdmin=true",
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
        fetchFeedback(allowed[0].name);
      }
    } catch (err) {
      console.error("Error fetching hostels:", err);
    }
  };

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
      await fetchLowStock();

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

  // Add a code directly into a controller's shared pool bucket. Reuses the
  // plugin `data-codes/add` endpoint with a controllerId (no hostel).
  const handleAddControllerCode = async () => {
    setError("");

    const controller = controllers.find((c) => c.id === selectedControllerId);
    if (!controller) {
      setError("Please select a controller first.");
      return;
    }
    if (!ctrlPlanName.trim()) {
      setError("Please enter a plan name.");
      return;
    }
    if (!ctrlPlanType || !ctrlCode.trim()) {
      setError("Please enter an access code.");
      return;
    }

    setCtrlAdding(true);
    try {
      const requestBody: any = {
        controllerId: selectedControllerId,
        planName: ctrlPlanName.trim(),
        planType: ctrlPlanType,
        price: ctrlPrice,
        usersCount: ctrlUsersCount,
        code: ctrlCode.trim(),
      };
      const response = await apiFetch("/api/data-codes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to add code");
      }

      setCtrlCode("");
      await fetchLowStock();
      await fetchControllerBuckets(selectedControllerId, false);
      setSuccessMessage("Code added to controller pool successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: any) {
      console.error("Error adding controller code:", err);
      setError(err?.message || "Failed to add code");
    } finally {
      setCtrlAdding(false);
    }
  };

  const fetchControllerBuckets = async (
    controllerId: string,
    showLoader = true,
  ) => {
    if (showLoader) setLoadingCtrlBuckets(true);
    setSelectedCtrlBucket("");
    try {
      const res = await apiFetch(
        `/api/data-codes/controller-buckets?controllerId=${encodeURIComponent(controllerId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load buckets");
      setCtrlBuckets(data.buckets ?? []);
    } catch (err: any) {
      console.error("Error fetching controller buckets:", err);
      setError(err?.message || "Failed to load controller codes");
    } finally {
      setLoadingCtrlBuckets(false);
    }
  };

  const fetchControllerCodes = async (controllerId: string, poolKey: string) => {
    setLoadingCtrlCodes(true);
    setCtrlCodes([]);
    try {
      const res = await apiFetch(
        `/api/data-codes/controller-codes?controllerId=${encodeURIComponent(controllerId)}&poolKey=${encodeURIComponent(poolKey)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load codes");
      setCtrlCodes(data.codes ?? []);
    } catch (err: any) {
      console.error("Error fetching controller codes:", err);
      setError(err?.message || "Failed to load controller codes");
    } finally {
      setLoadingCtrlCodes(false);
    }
  };

  const handleControllerSelect = (id: string) => {
    setSelectedControllerId(id);
    setSelectedCtrlBucket("");
    setCtrlPlanName("");
    setCtrlPrice(0);
    setCtrlCode("");
    setCtrlCodes([]);
    if (id) fetchControllerBuckets(id);
    else setCtrlBuckets([]);
  };

  // Pre-fill the add form from an existing bucket, so the new code lands in
  // that exact bucket (same plan name + type + device count).
  const handleCtrlBucketSelect = (bucket: (typeof ctrlBuckets)[number]) => {
    setSelectedCtrlBucket(bucket.poolKey);
    setCtrlPlanName(bucket.planName);
    setCtrlPlanType(bucket.planType === "unlimited" ? "unlimited" : "device");
    if (bucket.usersCount != null) setCtrlUsersCount(Number(bucket.usersCount));
    setCtrlCode("");
    if (selectedControllerId) fetchControllerCodes(selectedControllerId, bucket.poolKey);
  };

  // Resolve a price for a pool from the Sync panel (same endpoint the bucket
  // list uses): stamps it onto every code in the pool and clears the flag.
  const handleSyncResolvePrice = async (
    controllerId: string,
    poolKey: string,
    planName: string,
  ) => {
    const raw = (syncResolvePrices[poolKey] ?? "").trim();
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price <= 0) {
      setError(`Enter a valid price for ${planName} before saving.`);
      return;
    }
    setSyncingResolve(poolKey);
    setError("");
    try {
      const res = await apiFetch(
        "/api/data-codes/controller-buckets/resolve-price",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controllerId, poolKey, price }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set price");
      setSuccessMessage(
        `Price set on ${planName} (${data.updated} code${data.updated !== 1 ? "s" : ""}).`,
      );
      setTimeout(() => setSuccessMessage(""), 5000);
      setSyncResolvePrices((prev) => ({ ...prev, [poolKey]: "" }));
      await fetchSyncStatus();
      if (controllerId) await fetchControllerBuckets(controllerId, false);
    } catch (err: any) {
      console.error("Error resolving price:", err);
      setError(err?.message || "Failed to set price");
    } finally {
      setSyncingResolve(null);
    }
  };

  // Load the per-controller Omada sync report (last run + counts).
  const fetchSyncStatus = async (showLoader = true) => {
    if (showLoader) setLoadingSync(true);
    try {
      const res = await apiFetch("/api/data-codes/sync-status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load sync status");
      setSyncStatus(data.controllers ?? []);
    } catch (err: any) {
      console.error("Error fetching sync status:", err);
      setError(err?.message || "Failed to load sync status");
   } finally {
       setLoadingSync(false);
     }
   };

  // Keep polling for the full duration of manual and clean sync requests. The
  // POST is awaited by the API, so the local button state is the only reliable
  // signal that a run is active before this browser observes the first
  // progress write.
  //
  // This is deliberately reduced to a boolean before it reaches the effect
  // below. Depending on `syncStatus` itself meant a new array every poll, so
  // the interval was torn down and rebuilt on every response — the samples
  // then arrived every (interval + request time) instead of on a steady beat,
  // and the bar's transition had no consistent gap to glide across.
  const syncInProgress =
    Boolean(syncingController) ||
    syncingAllControllers ||
    syncStatus.some((controller) => controller.syncProgress?.status === "running");

  // One poll at a time: a slow response must not let the next tick stack a
  // second request on top of it.
  const syncPollInFlight = useRef(false);

  useEffect(() => {
    if (!showSync || !syncInProgress) return;
    const timer = window.setInterval(async () => {
      if (syncPollInFlight.current) return;
      syncPollInFlight.current = true;
      try {
        await fetchSyncStatus(false);
      } finally {
        syncPollInFlight.current = false;
      }
    }, SYNC_POLL_MS);
    return () => window.clearInterval(timer);
  }, [showSync, syncInProgress]);

   // Trigger an on-demand Omada -> controller refresh for a single controller.
   const handleSyncController = async (controllerId: string, controllerName: string) => {
     setSyncingController(controllerId);
     setSuccessMessage("");
     setError("");
     try {
       const res = await apiFetch("/api/data-codes/sync", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ controllerId }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error || "Sync failed");
       setSuccessMessage(
         `${controllerName}: synced ${data.lastSync?.added ?? 0} new, ${data.lastSync?.skipped ?? 0} skipped.`,
       );
       setTimeout(() => setSuccessMessage(""), 8000);
       await fetchSyncStatus(false);
     } catch (err: any) {
       console.error("Error syncing controller:", err);
       setError(err?.message || "Sync failed");
     } finally {
       setSyncingController(null);
     }
   };

   const handleSyncAllControllers = async () => {
     setSyncingAllControllers(true);
     setSuccessMessage("");
     setError("");
     try {
       const res = await apiFetch("/api/data-codes/sync", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ all: true }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error || "All-controller sync failed");
       const failed = Number(data.failed ?? 0);
       const completed = (data.results ?? []).filter((r: { status?: string }) => r.status === "ok").length;
       if (failed) {
         setError(`Sync completed with ${failed} failure${failed === 1 ? "" : "s"}; ${completed} controller${completed === 1 ? "" : "s"} completed.`);
       } else {
         setSuccessMessage(`All controllers synced: ${completed} completed.`);
         setTimeout(() => setSuccessMessage(""), 8000);
       }
       await Promise.all([fetchSyncStatus(false), fetchPlans(), fetchDataCodesSummary(), fetchLowStock()]);
     } catch (err: any) {
       setError(err?.message || "All-controller sync failed");
     } finally {
       setSyncingAllControllers(false);
     }
   };

   const handleCleanSyncController = async () => {
     if (!cleanSyncTarget) return;
     const target = cleanSyncTarget;
     setCleanSyncTarget(null);
     setSyncingController(target.id);
     setSuccessMessage("");
     setError("");
     try {
       const res = await apiFetch("/api/data-codes/sync", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ controllerId: target.id, clean: true }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error || "Clean resync failed");
       setSuccessMessage(`${target.name}: backup created and codes rebuilt.`);
       setTimeout(() => setSuccessMessage(""), 8000);
       await Promise.all([fetchSyncStatus(false), fetchPlans(), fetchDataCodesSummary(), fetchLowStock()]);
     } catch (err: any) {
       setError(err?.message || "Clean resync failed");
     } finally {
       setSyncingController(null);
     }
   };

   const openSyncController = async (controllerId: string) => {
     setSyncDetailControllerId(controllerId);
     setSyncDetailLoading(true);
     try {
       const res = await apiFetch(`/api/data-codes/controller-buckets?controllerId=${encodeURIComponent(controllerId)}`);
       const data = await res.json();
       if (!res.ok) throw new Error(data.error || "Failed to load controller pools");
       setSyncDetailBuckets(data.buckets ?? []);
       setSyncPoolDrafts(Object.fromEntries((data.buckets ?? []).map((b: typeof ctrlBuckets[number]) => [`${controllerId}:${b.poolKey}`, b])));
     } catch (err: any) {
       setError(err?.message || "Failed to load controller pools");
     } finally {
       setSyncDetailLoading(false);
     }
   };

   const saveSyncPool = async (controllerId: string, poolKey: string) => {
     const key = `${controllerId}:${poolKey}`;
     const draft = syncPoolDrafts[key];
     if (!draft) return;
     setSyncSavingKey(key);
     try {
       const res = await apiFetch(`/api/admin/controllers/${controllerId}/pools/${encodeURIComponent(poolKey)}/metadata`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           planName: draft.planName,
           planType: draft.planType,
           usersCount: draft.usersCount ?? undefined,
           duration: draft.duration ?? undefined,
           unlimitedPeriod: draft.unlimitedPeriod ?? undefined,
           price: draft.price ?? undefined,
           approved: draft.approved === true,
           enabled: draft.enabled !== false,
         }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error || "Failed to save pool settings");
       setSuccessMessage(`${draft.planName} settings saved and hostel plans refreshed.`);
       setTimeout(() => setSuccessMessage(""), 6000);
       await Promise.all([openSyncController(controllerId), fetchSyncStatus(false), fetchPlans(), fetchDataCodesSummary()]);
     } catch (err: any) {
       setError(err?.message || "Failed to save pool settings");
     } finally {
       setSyncSavingKey(null);
     }
   };

   const saveHostelOverride = async (controllerId: string, hostel: string, poolKey: string, field: "price" | "enabled", value: number | boolean) => {
     const key = `${controllerId}:${hostel}:${poolKey}`;
     setSyncSavingKey(key);
     try {
       const res = await apiFetch(`/api/admin/controllers/${controllerId}/hostels/${encodeURIComponent(hostel)}/pools/${encodeURIComponent(poolKey)}/override`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ [field]: value }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error || "Failed to save hostel override");
       setSuccessMessage(`${hostel}: ${field === "price" ? "price" : "availability"} updated.`);
       setTimeout(() => setSuccessMessage(""), 5000);
       await fetchPlans();
     } catch (err: any) {
       setError(err?.message || "Failed to save hostel override");
     } finally {
       setSyncSavingKey(null);
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
      await fetchLowStock();
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
          {/* Catalogue command centre */}
          <section id="catalogue-control-centre" className="relative mb-8 overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-purple-200/30 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:flex-nowrap lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600"><ShieldCheck className="h-4 w-4" /> Catalogue control centre</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Plans, pools &amp; code access</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Manage standalone inventory and controller-owned pools from one place. A controller hostel inherits its parent catalogue; pricing and availability stay visible at every decision point.</p>
              </div>
              <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-nowrap">
                {adminProfile?.isSuperAdmin && <button onClick={() => router.push("/admin/controllers")} className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50/80 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"><SlidersHorizontal className="h-4 w-4" /> Manage controllers <ExternalLink className="h-3.5 w-3.5" /></button>}
                <button onClick={openControllerWalkthrough} className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"><Sparkles className="h-4 w-4 text-blue-600" /> Controller walkthrough</button>
                <button onClick={() => { setShowSync(true); fetchSyncStatus(); }} className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Sync centre</button>
              </div>
            </div>
            <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Active plans", catalogueSummary.activePlans, "text-blue-700 bg-blue-50"],
                ["Controller plans", catalogueSummary.controllerPlans, "text-indigo-700 bg-indigo-50"],
                ["Approved for sale", catalogueSummary.approvedForSale, "text-emerald-700 bg-emerald-50"],
                ["Needs metadata", catalogueSummary.unresolved, "text-amber-700 bg-amber-50"],
                ["Needs price", catalogueSummary.needsPrice, "text-orange-700 bg-orange-50"],
                ["Disabled / retired", catalogueSummary.inactive, "text-slate-600 bg-slate-100"],
                ["Controllers", activeControllers.length, "text-purple-700 bg-purple-50"],
                ["Hostels", catalogueSummary.hostels, "text-emerald-700 bg-emerald-50"],
              ].map(([label, value, tone]) => <div key={String(label)} className={`rounded-2xl px-3 py-3 ${tone}`}><p className="text-xl font-bold">{value}</p><p className="mt-0.5 text-[11px] font-medium opacity-80">{label}</p></div>)}
            </div>
          </section>

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
              onClick={() => {
                setShowSync(!showSync);
                if (!showSync) fetchSyncStatus();
              }}
              className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-green-200"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-r from-green-500 to-green-600 rounded-xl">
                  <RefreshCw className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-apple-gray-900">
                    Sync Data Codes
                  </h3>
                  <p className="text-sm text-apple-gray-600">
                    {showSync ? "Hide" : "View"} Omada sync status &amp; report
                  </p>
                </div>
              </div>
              <div
                className="text-2xl font-bold text-green-600"
                title="Controllers"
              >
                {syncStatus.filter((c) => c.needsPriceResolve.length > 0).length}
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

          {/* Omada Sync Section */}
          {showSync && (
            <section id="omada-sync-section" className="relative mb-8 overflow-hidden rounded-[2rem] border border-white/90 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-green-500" />
                  <h2 className="text-lg font-semibold text-apple-gray-800">
                    Omada Sync Report
                  </h2>
                </div>
                <button
                  onClick={() => fetchSyncStatus()}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                {adminProfile?.isSuperAdmin && (
                  <button
                    onClick={handleSyncAllControllers}
                    disabled={syncingAllControllers || syncingController !== null}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingAllControllers ? "animate-spin" : ""}`} />
                    {syncingAllControllers ? "Syncing all…" : "Sync all"}
                  </button>
                )}
              </div>

              {!loadingSync && syncStatus.length > 0 && (
                <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {syncStatus.map((ctrl, controllerIndex) => {
                    const needs = ctrl.needsPriceResolve.length;
                    const last = ctrl.lastSync;
                    return (
                      <div id={controllerIndex === 0 ? "controller-sync-card" : undefined} key={ctrl.id} role="button" tabIndex={0} onClick={() => openSyncController(ctrl.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openSyncController(ctrl.id); }} className="group rounded-[1.5rem] border border-white/90 bg-white/80 p-4 text-left shadow-[0_12px_35px_rgba(15,23,42,0.07)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2"><div className="rounded-xl bg-blue-50 p-2 text-blue-600"><Server className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{ctrl.name}</p><p className="text-xs text-slate-500">{ctrl.memberHostels.length} hostel{ctrl.memberHostels.length === 1 ? "" : "s"} · {last?.groups ?? 0} groups</p></div></div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1" />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${ctrl.syncProgress?.status === "running" ? "bg-blue-100 text-blue-700" : last?.ranAt ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ctrl.syncProgress?.status === "running" ? `Syncing ${ctrl.syncProgress.percent ?? 0}%` : last?.ranAt ? "Synced" : "Never synced"}</span>
                          {needs > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700"><AlertTriangle className="h-3 w-3" /> {needs} plan{needs === 1 ? "" : "s"} need price</span> : <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">Metadata complete</span>}
                        </div>
                        {ctrl.syncProgress?.status === "running" && (
                          <SyncProgressBar
                            key={ctrl.id}
                            percent={ctrl.syncProgress.percent}
                            label={ctrl.syncProgress.detail || ctrl.syncProgress.stage || "Working…"}
                          />
                        )}
                        <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
                          <span><b className="block text-sm text-slate-900">{last?.added ?? 0}</b>Added</span>
                          <span><b className="block text-sm text-slate-900">{last?.skipped ?? 0}</b>Skipped</span>
                          <span><b className="block text-sm text-slate-900">{last?.filteredOut ?? 0}</b>Used/expired</span>
                          <span><b className="block text-sm text-slate-900">{last?.entitlements?.updated ?? 0}</b>Updated</span>
                        </div>
                        {adminProfile?.isSuperAdmin && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => handleSyncController(ctrl.id, ctrl.name)} disabled={syncingController !== null || syncingAllControllers} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-2 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                            <RefreshCw className={`h-3.5 w-3.5 ${syncingController === ctrl.id ? "animate-spin" : ""}`} />
                            {syncingController === ctrl.id ? "Syncing…" : "Sync now"}
                          </button>
                          <button type="button" onClick={() => setCleanSyncTarget({ id: ctrl.id, name: ctrl.name })} disabled={syncingController !== null || syncingAllControllers} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" /> Clean & resync
                          </button>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {adminProfile?.isSuperAdmin && (
                <div id="sync-filter-policy" className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-sm font-semibold text-slate-900">Omada sync filters</p><p className="text-xs text-slate-500">Groups containing these words are skipped before pools and codes are created.</p></div>
                    <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setShowNamingGuide(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100"><BookOpen className="h-3.5 w-3.5" /> Naming guide</button><div className="flex rounded-full bg-white p-1 text-xs font-semibold shadow-sm"><button type="button" onClick={() => { setSyncFilterScope("global"); fetchSyncFilters(); }} className={`rounded-full px-3 py-1.5 ${syncFilterScope === "global" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Global</button><button type="button" onClick={() => { setSyncFilterScope("controller"); if (syncFilterController) fetchSyncFilters(syncFilterController); }} className={`rounded-full px-3 py-1.5 ${syncFilterScope === "controller" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Controller</button></div></div>
                  </div>
                  {syncFilterScope === "controller" && <select value={syncFilterController} onChange={(e) => { setSyncFilterController(e.target.value); fetchSyncFilters(e.target.value); }} className="mt-3 w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm"><option value="">Select controller</option>{controllers.map((controller) => <option key={controller.id} value={controller.id}>{controller.name}</option>)}</select>}
                  <div className="mt-3 flex flex-wrap items-center gap-2"><input value={syncFilterPatterns.join(", ")} onChange={(e) => setSyncFilterPatterns(e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className="min-w-[14rem] flex-1 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm" placeholder="test, testing, staging" /><label className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">Low-stock alert / refill at <input type="number" min="1" value={syncLowStockThreshold} onChange={(e) => setSyncLowStockThreshold(Number(e.target.value))} className="w-16 border-0 p-0 text-sm font-semibold outline-none" /></label><button type="button" onClick={saveSyncFilters} disabled={savingSyncFilters || (syncFilterScope === "controller" && !syncFilterController)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{savingSyncFilters ? "Saving…" : "Save policy"}</button></div>
                </div>
              )}

              {showNamingGuide && (
                <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25 backdrop-blur-sm" onClick={() => setShowNamingGuide(false)}>
                  <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl sm:p-8" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                      <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600"><BookOpen className="h-4 w-4" /> Omada plan guide</div><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">How to name a plan</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use one clear name for each plan. The sync reads the name and automatically understands the plan type, data size, devices, duration and price.</p></div>
                      <button type="button" onClick={() => setShowNamingGuide(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
                    </div>
                    <div className="mt-6 space-y-6 text-sm text-slate-700">
                      <section><h3 className="font-semibold text-slate-950">The short pattern</h3><p className="mt-2 leading-6">Put five items in this order and separate them with the vertical line <code className="rounded bg-slate-100 px-1 font-mono">|</code>:</p><code className="mt-3 block overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs leading-6 text-blue-100">PLAN NAME | DATA | TYPE | DURATION | PRICE</code></section>
                      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><h3 className="font-semibold text-slate-950">Device plan — copy this</h3><code className="mt-3 block overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs leading-6 text-blue-100">ONLINE|20GB|5|7|2000</code><p className="mt-3 text-xs leading-5 text-slate-600">This means: ONLINE, 20GB, usable on 5 devices, valid for 7 days, sold for ₦2,000. You can also write <code>3k</code> instead of <code>3000</code>.</p></section>
                      <section className="rounded-2xl border border-purple-100 bg-purple-50/70 p-4"><h3 className="font-semibold text-slate-950">Unlimited plan — copy this</h3><code className="mt-3 block overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs leading-6 text-purple-100">ONLINE Weekly Unlimited||WU||5000</code><p className="mt-3 text-xs leading-5 text-slate-600">Use <code>DU</code> for daily, <code>WU</code> for weekly, <code>MU</code> for monthly, or <code>YU</code> for yearly. Leave data and duration empty because the system knows the period and duration automatically.</p></section>
                      <section><h3 className="font-semibold text-slate-950">Type shortcuts</h3><div className="mt-3 space-y-2">{[["3 or 5", "Device plan for 3 or 5 devices."], ["DU / WU / MU / YU", "Daily, weekly, monthly or yearly unlimited."], ["DTV / WTV / MTV / YTV", "Daily, weekly, monthly or yearly TV plan."]].map(([term, explanation]) => <div key={term} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2"><code className="w-32 shrink-0 font-mono text-xs font-semibold text-blue-700">{term}</code><span className="text-xs text-slate-600">{explanation}</span></div>)}</div></section>
                      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">Avoid these mistakes</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900"><li>Do not use commas in the price: write <code>3000</code>, not <code>3,000</code>.</li><li>Do not add the ₦ sign to the price.</li><li>Do not change the spelling of the field names.</li><li>Do not use <code>Test</code> or <code>Testing</code> in a real plan name; those groups are filtered out automatically.</li><li>Use a different name for different products, such as 20GB and 40GB.</li></ul></section>
                      <p className="text-xs leading-5 text-slate-500">After creating or updating voucher groups in Omada, press <strong>Sync now</strong> for that controller. Plans with complete metadata can be made available automatically; existing codes are matched and never duplicated.</p>
                    </div>
                  </aside>
                </div>
              )}

              {loadingSync ? (
                <div className="text-center py-8">
                  <div className="inline-block w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="mt-2 text-sm text-apple-gray-500">
                    Loading sync status...
                  </p>
                </div>
              ) : syncStatus.length === 0 ? (
                <div className="text-center py-8">
                  <Server className="w-12 h-12 text-apple-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-apple-gray-500">
                    No controllers configured yet.
                  </p>
                </div>
              ) : (
                <div className="hidden space-y-6">
                  {syncStatus.map((ctrl) => {
                    const last = ctrl.lastSync;
                    const never = !last?.ranAt;
                    const statusText = never
                      ? "Never synced"
                      : last.status === "in_sync"
                        ? "In sync"
                        : "Syncing";
                    return (
                      <div
                        key={ctrl.id}
                        className="border border-apple-gray-200 rounded-xl p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-blue-500" />
                            <h3 className="text-base font-semibold text-apple-gray-900">
                              {ctrl.name}
                            </h3>
                            <span className="text-xs text-apple-gray-500">
                              · {ctrl.memberHostels.length} hostel
                              {ctrl.memberHostels.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                              {!never && (
                                <span className="text-xs text-apple-gray-500">
                                  Last sync:{" "}
                                  {new Date(last!.ranAt!).toLocaleString()}
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  never
                                    ? "bg-apple-gray-100 text-apple-gray-600"
                                    : statusText === "In sync"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {statusText}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSyncController(ctrl.id, ctrl.name)}
                                disabled={syncingController === ctrl.id || never}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-xs font-medium disabled:opacity-50"
                              >
                                {syncingController === ctrl.id ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    Syncing…
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Sync now
                                  </>
                                )}
                              </button>
                          </div>
                        </div>

                        {!never && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <div className="rounded-lg bg-apple-gray-50 px-3 py-2">
                              <p className="text-xs text-apple-gray-500">Groups</p>
                              <p className="text-lg font-bold text-apple-gray-900">
                                {last.groups}
                              </p>
                            </div>
                            <div className="rounded-lg bg-green-50 px-3 py-2">
                              <p className="text-xs text-green-700">Added</p>
                              <p className="text-lg font-bold text-green-700">
                                {last.added}
                              </p>
                            </div>
                            <div className="rounded-lg bg-apple-gray-50 px-3 py-2">
                              <p className="text-xs text-apple-gray-500">Skipped (dup)</p>
                              <p className="text-lg font-bold text-apple-gray-900">
                                {last.skipped}
                              </p>
                            </div>
                            <div className="rounded-lg bg-apple-gray-50 px-3 py-2">
                              <p className="text-xs text-apple-gray-500">Used / expired</p>
                              <p className="text-lg font-bold text-apple-gray-900">
                                {last.filteredOut}
                              </p>
                            </div>
                          </div>
                        )}

                        {ctrl.needsPriceResolve.length > 0 && (
                          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base">⚠️</span>
                              <h4 className="text-sm font-semibold text-orange-900">
                                Plans needing metadata
                              </h4>
                            </div>
                            <p className="text-xs text-orange-700 mb-3">
                              These codes were synced from Omada but their
                              product metadata is incomplete. Set the missing
                              business fields to make them sellable.
                            </p>
                            <div className="space-y-3">
                              {ctrl.needsPriceResolve.map((pool) => (
                                <div
                                  key={pool.poolKey}
                                  className="border border-orange-200 bg-white rounded-lg p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-apple-gray-900 text-sm">
                                        {pool.poolKey.split("|")[0]}
                                      </p>
                                      <p className="text-xs text-apple-gray-500 mt-0.5">
                                        {pool.count} code
                                        {pool.count !== 1 ? "s" : ""}
                                        {pool.sourceGroupName
                                          ? ` · from "${pool.sourceGroupName}"`
                                          : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <input
                                        type="number"
                                        min="1"
                                        placeholder="Price (₦)"
                                        value={
                                          syncResolvePrices[pool.poolKey] ?? ""
                                        }
                                        onChange={(e) =>
                                          setSyncResolvePrices((prev) => ({
                                            ...prev,
                                            [pool.poolKey]: e.target.value,
                                          }))
                                        }
                                        className="w-28 px-3 py-2 border border-apple-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSyncResolvePrice(
                                            ctrl.id,
                                            pool.poolKey,
                                            pool.poolKey.split("|")[0],
                                          )
                                        }
                                        disabled={syncingResolve === pool.poolKey}
                                        className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white text-sm font-medium disabled:opacity-50"
                                      >
                                        {syncingResolve === pool.poolKey
                                          ? "Saving..."
                                          : "Set"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {ctrl.needsPriceResolve.length === 0 && (
                          <p className="text-xs text-green-600">
                            All pools have a price set — nothing needs
                            resolution.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Controller pool management drawer */}
          {syncDetailControllerId && (
            <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25 backdrop-blur-sm" onClick={() => setSyncDetailControllerId(null)}>
              <aside id="controller-pool-drawer" className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/70 bg-white/90 p-5 shadow-2xl backdrop-blur-2xl sm:p-7" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const ctrl = controllers.find((c) => c.id === syncDetailControllerId);
                  return (
                    <>
                      <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-5">
                        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600"><Server className="h-4 w-4" /> Controller catalogue</div><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{ctrl?.name || "Controller pools"}</h2><p className="mt-1 text-sm text-slate-500">General terms apply to every member hostel unless a hostel override is set.</p></div>
                        <button type="button" onClick={() => setSyncDetailControllerId(null)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
                      </div>
                      {!syncDetailLoading && syncDetailBuckets.length > 0 && <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">Pool visibility</p><button type="button" onClick={() => setShowAllSyncPools((value) => !value)} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 shadow-sm">{showAllSyncPools ? "Showing all pools" : "Needs action only"}</button></div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {([["all", "All"], ["approved", "Approved for sale"], ["enabled", "Enabled"], ["disabled", "Disabled"], ["metadata", "Needs metadata"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setSyncPoolFilter(value)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${syncPoolFilter === value ? "bg-slate-950 text-white" : "bg-white text-slate-600 hover:bg-blue-50"}`}>{label}</button>)}
                        </div>
                      </div>}
                      {syncDetailLoading ? <div className="flex items-center justify-center py-16 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading pools…</div> : syncDetailBuckets.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">No synced pools found for this controller.</div> : <div className="mt-4 space-y-4">
                        {syncDetailBuckets.filter((bucket) => {
                          const saleReady = bucket.approved === true && bucket.enabled !== false && !bucket.needsPriceResolve && bucket.price != null;
                          const matches = syncPoolFilter === "all" || (syncPoolFilter === "approved" && saleReady) || (syncPoolFilter === "enabled" && bucket.enabled !== false) || (syncPoolFilter === "disabled" && bucket.enabled === false) || (syncPoolFilter === "metadata" && bucket.needsMetadataResolve === true);
                          return matches && (showAllSyncPools || !saleReady);
                        }).map((bucket) => {
                          const key = `${syncDetailControllerId}:${bucket.poolKey}`;
                          const draft = syncPoolDrafts[key] ?? bucket;
                          const saleReady = bucket.approved === true && bucket.enabled !== false && !bucket.needsPriceResolve && bucket.price != null;
                          return <details key={bucket.poolKey} className="group rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm" open={bucket.needsPriceResolve || (showControllerWalkthrough && walkthroughStep >= 4 && walkthroughStep <= 5)}>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-slate-900">{bucket.planName}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${saleReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{saleReady ? "Approved for sale" : bucket.enabled === false && bucket.needsPriceResolve ? "Disabled · needs metadata" : bucket.enabled === false ? "Disabled" : bucket.needsPriceResolve ? "Needs metadata" : "Needs review"}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucket.enabled === false ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>{bucket.enabled === false ? "Disabled" : "Enabled"}</span></div><p className="mt-1 text-xs text-slate-500">{bucket.availableCount} available · {bucket.codeCount} total · {bucket.poolKey}</p></div><ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary>
                            <div className="space-y-4 border-t border-slate-100 p-4">
                              <div id="controller-pool-general" className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="col-span-2 text-xs font-medium text-slate-600">Plan name<input value={draft.planName} onChange={(e) => setSyncPoolDrafts((p) => ({ ...p, [key]: { ...draft, planName: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-slate-600">Price (₦)<input type="number" min="0" value={draft.price ?? ""} onChange={(e) => setSyncPoolDrafts((p) => ({ ...p, [key]: { ...draft, price: e.target.value === "" ? null : Number(e.target.value) } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-slate-600">Duration<input type="number" min="1" value={draft.duration ?? ""} onChange={(e) => setSyncPoolDrafts((p) => ({ ...p, [key]: { ...draft, duration: e.target.value === "" ? undefined : Number(e.target.value) } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label></div>
                              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.approved === true} onChange={(e) => setSyncPoolDrafts((p) => ({ ...p, [key]: { ...draft, approved: e.target.checked } }))} /> Approved for sale</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.enabled !== false} onChange={(e) => setSyncPoolDrafts((p) => ({ ...p, [key]: { ...draft, enabled: e.target.checked } }))} /> Enabled</label><button type="button" onClick={() => saveSyncPool(syncDetailControllerId, bucket.poolKey)} disabled={syncSavingKey === key} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {syncSavingKey === key ? "Saving…" : "Save general terms"}</button></div>
                              {ctrl?.memberHostels?.length ? <div id="controller-hostel-overrides" className="rounded-2xl bg-slate-50/90 p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-800">Per-hostel overrides</p><p className="text-[11px] text-slate-500">Override price or availability without changing the controller default.</p></div><span className="text-[10px] font-medium text-slate-400">{ctrl.memberHostels.length} hostels</span></div><div className="space-y-2">{ctrl.memberHostels.map((hostel) => { const override = bucket.hostelOverrides?.[hostel] ?? {}; const effectiveEnabled = override.enabled ?? bucket.enabled !== false; return <div key={hostel} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2"><span className="min-w-[9rem] flex-1 text-xs font-medium text-slate-700">{hostel}<span className="ml-1 text-[10px] text-slate-400">{override.price != null ? "custom price" : "default price"}</span></span><input type="number" min="0" defaultValue={override.price ?? ""} placeholder={`₦${bucket.price ?? "default"}`} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" onBlur={(e) => { if (e.target.value !== "") saveHostelOverride(syncDetailControllerId, hostel, bucket.poolKey, "price", Number(e.target.value)); }} /><button type="button" onClick={() => saveHostelOverride(syncDetailControllerId, hostel, bucket.poolKey, "enabled", !effectiveEnabled)} disabled={syncSavingKey === `${syncDetailControllerId}:${hostel}:${bucket.poolKey}`} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${effectiveEnabled ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>{effectiveEnabled ? "Disable" : "Enable"}</button></div>; })}</div></div> : null}
                            </div>
                          </details>;
                        })}
                      </div>}
                    </>
                  );
                })()}
              </aside>
            </div>
          )}

          {/* Data Codes Management */}
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            {/* LEFT: Plan Configuration */}
            <section id="plan-setup-section" className="relative overflow-hidden rounded-[2rem] border border-white/90 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl flex flex-col gap-5">
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

              {/* Controllers / Standalone toggle */}
              <div className="flex rounded-lg border border-apple-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMode("controllers")}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    mode === "controllers"
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                      : "text-apple-gray-600 hover:bg-apple-gray-50"
                  }`}
                >
                  <Server className="w-4 h-4" />
                  Controllers
                </button>
                <button
                  type="button"
                  onClick={() => setMode("standalone")}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    mode === "standalone"
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                      : "text-apple-gray-600 hover:bg-apple-gray-50"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Standalone
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Plans about to sell out. Sorted emptiest-first by the API, so
                  the most urgent is always the one read first. */}
              {lowStock.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900">
                        {lowStock.length} plan{lowStock.length !== 1 ? "s" : ""} running
                        low on codes
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Fewer than {lowStockThreshold} codes left. The superadmin has
                        also been emailed.
                      </p>
                      <ul className="mt-2 space-y-1">
                        {lowStock.map((plan) => (
                          <li
                            key={`${plan.id}-${plan.hostel}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-amber-900 truncate">
                              {plan.name}
                              <span className="text-amber-700"> · {plan.hostel}</span>
                            </span>
                            <span
                              className={`font-semibold whitespace-nowrap ${
                                plan.remaining === 0
                                  ? "text-red-700"
                                  : "text-amber-900"
                              }`}
                            >
                              {plan.remaining === 0
                                ? "Out of stock"
                                : `${plan.remaining} left`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {mode === "standalone" && (
                <>
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
                    // Re-fetch feedback scoped to new hostel
                    if (newHostelName) {
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
                  {standaloneHostels.map((h) => (
                    <option key={h.id} value={h.name}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {selectedAdminHostel && (
                  <>
                  {selectedHostelController && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                      <Server className="w-3.5 h-3.5" />
                      <span className="font-medium">
                        Shared pool via {selectedHostelController.name} Controller
                      </span>
                      <span className="text-blue-500">
                        &middot; {selectedHostelController.memberHostels.length} hostels share codes
                      </span>
                    </div>
                  )}
                  {!selectedHostelController && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-apple-gray-50 border border-apple-gray-200 rounded-lg text-xs text-apple-gray-500">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Standalone &mdash; codes are private to this hostel</span>
                    </div>
                  )}
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
                  </>
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
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.source === "controller" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                                        {plan.source === "controller" ? "Controller pool" : "Standalone"}
                                      </span>
                                      {plan.source === "controller" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.approvedForSale ? "bg-emerald-100 text-emerald-700" : plan.enabled === false || plan.isActive === false ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}`}>{plan.approvedForSale ? "Approved for sale" : plan.enabled === false || plan.isActive === false ? "Disabled" : plan.needsMetadataResolve ? "Needs metadata" : "Needs approval"}</span>}
                                      {plan.source === "controller" && plan.priceResolved === false && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><AlertTriangle className="h-3 w-3" /> Needs price</span>}
                                    </div>
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
                </>
              )}

              {mode === "controllers" && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      1. Select Controller
                    </label>
                    <select
                      value={selectedControllerId}
                      onChange={(e) => handleControllerSelect(e.target.value)}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a controller...</option>
                      {activeControllers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.memberHostels.length} hostels
                        </option>
                      ))}
                    </select>
                    {selectedControllerId && (
                      <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                        <Server className="w-3.5 h-3.5" />
                        <span className="font-medium">
                          Shared pool — codes added here are drawable by every
                          member hostel with a matching plan bucket
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedCtrlBucket && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                      Adding to existing bucket{" "}
                      <span className="font-semibold">
                        {ctrlPlanName}
                        {ctrlPlanType === "device"
                          ? ` · ${ctrlUsersCount} device${ctrlUsersCount !== 1 ? "s" : ""}`
                          : " · unlimited"}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      2. Plan Type
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setCtrlPlanType("device")}
                        className={`flex-1 px-4 py-3 rounded-lg border font-semibold transition-all ${
                          ctrlPlanType === "device"
                            ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                            : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                        }`}
                      >
                        Device
                      </button>
                      <button
                        type="button"
                        onClick={() => setCtrlPlanType("unlimited")}
                        className={`flex-1 px-4 py-3 rounded-lg border font-semibold transition-all ${
                          ctrlPlanType === "unlimited"
                            ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                            : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                        }`}
                      >
                        Unlimited
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Plan Name
                    </label>
                    <input
                      type="text"
                      value={ctrlPlanName}
                      onChange={(e) => setCtrlPlanName(e.target.value)}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={
                        ctrlPlanType === "device"
                          ? "e.g. Lodge Internet 10GB"
                          : "e.g. Daily Unlimited"
                      }
                    />
                    <p className="mt-1 text-sm text-apple-gray-500">
                      The pool bucket is keyed by this name
                      {ctrlPlanType === "device"
                        ? " and the device count below"
                        : ""}
                      .
                    </p>
                  </div>

                  {ctrlPlanType === "device" && (
                    <div>
                      <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                        Number of Devices
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {USER_OPTIONS.map((count) => (
                          <button
                            key={count}
                            type="button"
                            onClick={() => setCtrlUsersCount(count)}
                            className={`px-4 py-3 rounded-lg border font-semibold transition-all ${
                              ctrlUsersCount === count
                                ? "border-transparent bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                                : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                            }`}
                          >
                            {count} Devices
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Price (₦)
                      <span className="text-apple-gray-400 font-normal">
                        {" "}
                        — for reference only
                      </span>
                    </label>
                    <input
                      type="number"
                      value={ctrlPrice}
                      onChange={(e) => setCtrlPrice(Number(e.target.value))}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g. 3500"
                      min={0}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Access Code
                    </label>
                    <input
                      type="text"
                      value={ctrlCode}
                      onChange={(e) => setCtrlCode(e.target.value)}
                      className="w-full px-4 py-3 border border-apple-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={
                        ctrlPlanType === "device"
                          ? "e.g. WIFI-10GB-3D-8F2A"
                          : "e.g. DAILY-UNLIMITED-77C1"
                      }
                    />
                  </div>

                  <button
                    onClick={handleAddControllerCode}
                    disabled={ctrlAdding}
                    className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {ctrlAdding
                      ? "Adding to Controller Pool..."
                      : "Add Code to Controller Pool"}
                  </button>
                </div>
              )}
            </section>

            {/* RIGHT: Code Inventory */}
            <section id="code-inventory-section" className="relative overflow-hidden rounded-[2rem] border border-white/90 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl flex flex-col gap-5">
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

              {/* Code Inventory display switch: added (manual per-plan codes)
                  vs controller (shared pool buckets synced from Omada). For a
                  standalone hostel this is purely a display switch. */}
              <div className="flex rounded-lg border border-apple-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setInvTab("added")}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    invTab === "added"
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                      : "text-apple-gray-600 hover:bg-apple-gray-50"
                  }`}
                >
                  <KeyRound className="w-4 h-4" />
                  Added Codes
                </button>
                <button
                  type="button"
                  onClick={() => setInvTab("controller")}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    invTab === "controller"
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white"
                      : "text-apple-gray-600 hover:bg-apple-gray-50"
                  }`}
                >
                  <Server className="w-4 h-4" />
                  Controller Codes
                </button>
              </div>

              {invTab === "added" && (
                <>
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

              {/* Code list — scoped to selected hostel (added/standalone view) */}
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
                </>
              )}

              {invTab === "controller" && (
                <>
              {/* Existing pool buckets on this controller — click one to
                  top it up (pre-fills name/type/device count). */}
              {mode === "controllers" && selectedControllerId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-apple-gray-700">
                      Existing Codes, Plans &amp; Devices
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        fetchControllerBuckets(selectedControllerId)
                      }
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                  </div>

                  {loadingCtrlBuckets ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  ) : ctrlBuckets.length === 0 ? (
                    <div className="border border-dashed border-apple-gray-300 rounded-xl px-4 py-6 text-center text-sm text-apple-gray-500">
                      No codes yet on this controller. Add one on the left to
                      create a new bucket.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {ctrlBuckets.map((bucket) => (
                        <button
                          key={bucket.poolKey}
                          type="button"
                          onClick={() => handleCtrlBucketSelect(bucket)}
                          className={`w-full text-left border rounded-xl p-4 transition-all ${
                            selectedCtrlBucket === bucket.poolKey
                              ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400 ring-offset-1"
                              : "border-apple-gray-200 hover:border-blue-200 hover:bg-apple-gray-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-apple-gray-900 text-sm">
                                {bucket.planName}
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucket.approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{bucket.approved ? "Approved" : "Needs review"}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucket.enabled === false ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>{bucket.enabled === false ? "Disabled" : "Enabled"}</span>
                                {bucket.needsMetadataResolve && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700"><AlertTriangle className="h-3 w-3" /> Metadata needed</span>}
                              </div>
                              <p className="text-xs text-apple-gray-500 mt-0.5">
                                {bucket.planType === "unlimited"
                                  ? "Unlimited"
                                  : `${bucket.usersCount ?? "?"} Device${bucket.usersCount !== 1 ? "s" : ""}`}
                                {bucket.planType === "unlimited"
                                  ? " — unlimited bucket"
                                  : ` · ${bucket.planType}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-blue-600">
                                {bucket.availableCount}
                                <span className="text-apple-gray-400 font-normal">
                                  {" "}
                                  / {bucket.codeCount} available
                                </span>
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                      <p className="text-xs text-apple-gray-400 mt-1">
                        Click a bucket to add another code to it.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {mode !== "controllers" && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <Server className="w-10 h-10 text-apple-gray-300 mb-2" />
                  <p className="text-sm text-apple-gray-500">
                    No controller selected.
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Switch to Controller mode and pick a controller to see its
                    shared pool buckets.
                  </p>
                </div>
              )}

              {/* Controller mode: codes for selected bucket */}
              {mode === "controllers" && selectedCtrlBucket && (
                <>
                  {loadingCtrlCodes ? (
                    <div className="flex items-center gap-2 text-sm text-apple-gray-500">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Loading codes...
                    </div>
                  ) : ctrlCodes.length === 0 ? (
                    <div className="text-sm text-apple-gray-500">
                      No codes in this bucket yet.
                    </div>
                  ) : (
                    <div className="border border-apple-gray-200 rounded-xl overflow-hidden bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-apple-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-apple-gray-600">Code</th>
                              <th className="px-3 py-2 text-left font-medium text-apple-gray-600">Status</th>
                              <th className="px-3 py-2 text-left font-medium text-apple-gray-600">Reserved By</th>
                              <th className="px-3 py-2 text-left font-medium text-apple-gray-600">Reserved Until</th>
                              <th className="px-3 py-2 text-left font-medium text-apple-gray-600">Created</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-apple-gray-100">
                            {ctrlCodes.map((code) => (
                              <tr key={code.id} className="hover:bg-apple-gray-50">
                                <td className="px-3 py-2 font-mono text-xs text-apple-gray-900">
                                  {code.codeMask}
                                </td>
                                <td className="px-3 py-2">
                                  {code.reservedBy ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                      Reserved
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                      Available
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-apple-gray-600 font-mono text-xs">
                                  {code.reservedBy || "—"}
                                </td>
                                <td className="px-3 py-2 text-apple-gray-600 text-xs">
                                  {code.reservedUntil
                                    ? new Date(code.reservedUntil).toLocaleString()
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-apple-gray-600 text-xs">
                                  {code.createdAt
                                    ? new Date(code.createdAt).toLocaleString()
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-2 bg-apple-gray-50 border-t border-apple-gray-100 text-xs text-apple-gray-500 text-center">
                        {ctrlCodes.length} code{ctrlCodes.length !== 1 ? "s" : ""} total
                      </div>
                    </div>
                  )}
                </>
              )}
                </>
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

      {showControllerWalkthrough && false && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-md" onClick={closeControllerWalkthrough}>
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_30px_100px_rgba(15,23,42,0.25)] backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-200/50 blur-3xl" />
            <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-purple-200/40 blur-3xl" />
            <div className="relative p-6 sm:p-9">
              <div className="flex items-start justify-between gap-5"><div><div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700"><Sparkles className="h-3.5 w-3.5" /> Welcome to controller mode</div><h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">A simpler way to manage codes</h2><p className="mt-2 text-sm leading-6 text-slate-500">Here is everything you need to know about the new controller setup.</p></div><button type="button" onClick={closeControllerWalkthrough} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
              <div className="mt-8 rounded-[1.5rem] border border-white/90 bg-white/75 p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Step {walkthroughStep + 1} of {walkthroughSteps.length}</p><h3 className="mt-2 text-xl font-semibold text-slate-950">{walkthroughSteps[walkthroughStep].title}</h3></div><div className="flex gap-1.5">{walkthroughSteps.map((_, index) => <span key={index} className={`h-2 w-2 rounded-full transition ${index === walkthroughStep ? "w-6 bg-blue-600" : index < walkthroughStep ? "bg-blue-300" : "bg-slate-200"}`} />)}</div></div><p className="mt-4 text-base leading-7 text-slate-600">{walkthroughSteps[walkthroughStep].body}</p><div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">{walkthroughSteps[walkthroughStep].note}</div></div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={closeControllerWalkthrough} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close for now</button><div className="flex gap-2">{walkthroughStep > 0 && <button type="button" onClick={() => setWalkthroughStep((step) => step - 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>}{walkthroughStep < walkthroughSteps.length - 1 ? <button type="button" onClick={() => setWalkthroughStep((step) => step + 1)} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Next</button> : <button type="button" onClick={closeControllerWalkthrough} className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white">Got it</button>}</div></div>
            </div>
          </div>
        </div>
      )}
      {showControllerWalkthrough && walkthroughRect && (
          <div className="fixed inset-0 z-[60] pointer-events-none">
          <div className="pointer-events-auto absolute inset-0 bg-slate-950/30" onClick={closeControllerWalkthrough} />
          <div className="absolute rounded-2xl border-2 border-blue-400 bg-white/5 shadow-[0_0_0_9999px_rgba(15,23,42,0.48),0_0_35px_rgba(59,130,246,0.45)] transition-all duration-300" style={{ left: walkthroughRect.left - 6, top: walkthroughRect.top - 6, width: walkthroughRect.width + 12, height: walkthroughRect.height + 12 }} />
          <div className="pointer-events-auto absolute w-[min(25rem,calc(100vw-2rem))] rounded-[1.5rem] border border-white/80 bg-white/95 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.25)] backdrop-blur-2xl" style={{ left: Math.min(Math.max(16, walkthroughRect.left), window.innerWidth - 416), top: Math.min(window.innerHeight - 280, Math.max(16, walkthroughRect.bottom + 18)) }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Step {walkthroughStep + 1} of {walkthroughSteps.length}</p><button type="button" onClick={closeControllerWalkthrough} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{walkthroughSteps[walkthroughStep].title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{walkthroughSteps[walkthroughStep].body}</p><p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">{walkthroughSteps[walkthroughStep].note}</p>
            <div className="mt-4 flex items-center justify-between"><div className="flex gap-1">{walkthroughSteps.map((_, index) => <span key={index} className={`h-1.5 rounded-full ${index === walkthroughStep ? "w-5 bg-blue-600" : "w-1.5 bg-slate-200"}`} />)}</div><div className="flex gap-2">{walkthroughStep > 0 && <button type="button" onClick={() => setWalkthroughStep((step) => step - 1)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Back</button>}{walkthroughStep < walkthroughSteps.length - 1 ? <button type="button" onClick={() => setWalkthroughStep((step) => step + 1)} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white">Next</button> : <button type="button" onClick={closeControllerWalkthrough} className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-500 px-4 py-2 text-xs font-semibold text-white">Finish</button>}</div></div>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={!!cleanSyncTarget}
        title={`Clean and resync ${cleanSyncTarget?.name ?? "controller"}?`}
        message="The backend will first create a timestamped backup, then remove this controller's existing code records and rebuild them from current eligible Omada vouchers. This does not affect other controllers, plans, hostels, or payment records. Do this only when no customers are actively claiming codes."
        confirmText="Backup & clean resync"
        cancelText="Keep existing codes"
        type="danger"
        onConfirm={handleCleanSyncController}
        onClose={() => setCleanSyncTarget(null)}
      />
    </ProtectedRoute>
  );
}
