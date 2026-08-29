"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import ConfirmationModal from "@/components/ConfirmationModal";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  LogOut,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Server,
  Trash2,
  UserPlus,
  Users,
  X,
  Save,
  SlidersHorizontal,
} from "lucide-react";

interface Controller {
  id: string;
  name: string;
  hostelIds: string[];
  isActive: boolean;
  memberHostels: string[];
  createdAt: string;
  poolMetadata: Record<string, PoolMetadata>;
  lastSync?: { added?: number; skipped?: number; status?: string; ranAt?: string } | null;
}

interface PoolMetadata {
  planName?: string;
  planType?: "device" | "unlimited";
  usersCount?: number;
  unlimitedPeriod?: string;
  duration?: number;
  price?: number;
  enabled?: boolean;
  approved?: boolean;
}

interface Hostel {
  id: string;
  name: string;
  controllerId?: string;
  poolOverrides?: Record<string, { price?: number; enabled?: boolean }>;
}

export default function AdminControllersPage() {
  const { logout, adminProfile } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;

  const [controllers, setControllers] = useState<Controller[]>([]);
  const [allHostels, setAllHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create controller
  const [newCtrlName, setNewCtrlName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit controller
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete controller
  const [deleteTarget, setDeleteTarget] = useState<Controller | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expand controller detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Assign hostels modal
  const [assignTarget, setAssignTarget] = useState<Controller | null>(null);
  const [assignHostels, setAssignHostels] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Unassign hostel
  const [unassignTarget, setUnassignTarget] = useState<{
    controllerId: string;
    hostelName: string;
  } | null>(null);
  const [unassigning, setUnassigning] = useState(false);

  // Rename hostel
  const [renameTarget, setRenameTarget] = useState<{
    controllerId: string;
    oldName: string;
  } | null>(null);
  const [renameNew, setRenameNew] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [poolDrafts, setPoolDrafts] = useState<Record<string, PoolMetadata>>({});
  const [savingPool, setSavingPool] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { price?: number; enabled?: boolean }>>({});
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [syncingController, setSyncingController] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [newPoolDrafts, setNewPoolDrafts] = useState<Record<string, PoolMetadata & { poolKey?: string }>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [ctrlRes, hostelRes] = await Promise.all([
        apiFetch("/api/admin/controllers"),
        apiFetch("/api/hostels"),
      ]);
      const ctrlData = await ctrlRes.json();
      const hostelData = await hostelRes.json();
      if (!ctrlRes.ok) throw new Error(ctrlData.error || "Failed to fetch controllers");
      setControllers(ctrlData.controllers ?? []);
      setAllHostels(hostelData.hostels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  };

  // ─── Create ──────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCtrlName.trim();
    if (!name) return;
    setCreating(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/controllers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create controller");
      setNewCtrlName("");
      showSuccess(`Controller "${name}" created`);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create controller");
    } finally {
      setCreating(false);
    }
  };

  // ─── Edit ────────────────────────────────────────────────────────────────

  const startEdit = (ctrl: Controller) => {
    setEditingId(ctrl.id);
    setEditName(ctrl.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleSave = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/admin/controllers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setEditingId(null);
      showSuccess("Controller updated");
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle Active ───────────────────────────────────────────────────────

  const handleToggleActive = async (ctrl: Controller) => {
    try {
      const res = await apiFetch(`/api/admin/controllers/${ctrl.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !ctrl.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle");
      showSuccess(`Controller ${ctrl.isActive ? "deactivated" : "activated"}`);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to toggle");
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await apiFetch(`/api/admin/controllers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      showSuccess(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // ─── Assign Hostels ──────────────────────────────────────────────────────

  const openAssign = (ctrl: Controller) => {
    setAssignTarget(ctrl);
    setAssignHostels([]);
  };

  const handleAssign = async () => {
    if (!assignTarget || assignHostels.length === 0) return;
    setAssigning(true);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/controllers/${assignTarget.id}/hostels`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostels: assignHostels }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      const assigned = data.assigned ?? [];
      const notFound = data.notFound ?? [];
      const parts = [];
      if (assigned.length) parts.push(`${assigned.length} assigned`);
      if (notFound.length) parts.push(`${notFound.length} not found`);
      showSuccess(parts.join(", ") || "Done");
      setAssignTarget(null);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  // ─── Unassign Hostel ─────────────────────────────────────────────────────

  const handleUnassign = async () => {
    if (!unassignTarget) return;
    setUnassigning(true);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/controllers/${unassignTarget.controllerId}/hostels/${encodeURIComponent(unassignTarget.hostelName)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unassign");
      showSuccess(`"${unassignTarget.hostelName}" unassigned`);
      setUnassignTarget(null);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to unassign");
    } finally {
      setUnassigning(false);
    }
  };

  // ─── Rename Hostel ───────────────────────────────────────────────────────

  const handleRename = async () => {
    if (!renameTarget) return;
    const newName = renameNew.trim();
    if (!newName) return;
    setRenaming(true);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/controllers/${renameTarget.controllerId}/hostels/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldName: renameTarget.oldName, newName }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename");
      showSuccess(`Renamed "${renameTarget.oldName}" → "${newName}"`);
      setRenameTarget(null);
      setRenameNew("");
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenaming(false);
    }
  };

  const draftKey = (controllerId: string, poolKey: string) => `${controllerId}:${poolKey}`;

  const updatePool = async (ctrl: Controller, poolKey: string, explicitDraft?: PoolMetadata) => {
    const key = draftKey(ctrl.id, poolKey);
    setSavingPool(key);
    try {
      const res = await apiFetch(`/api/admin/controllers/${ctrl.id}/pools/${encodeURIComponent(poolKey)}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(explicitDraft ?? poolDrafts[key] ?? ctrl.poolMetadata[poolKey]),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save pool settings");
      showSuccess(`${poolKey} settings saved and hostels refreshed`);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save pool settings");
    } finally {
      setSavingPool(null);
    }
  };

  const updateOverride = async (controllerId: string, hostel: string, poolKey: string) => {
    const key = `${controllerId}:${hostel}:${poolKey}`;
    setSavingOverride(key);
    try {
      const res = await apiFetch(`/api/admin/controllers/${controllerId}/hostels/${encodeURIComponent(hostel)}/pools/${encodeURIComponent(poolKey)}/override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrideDrafts[key] ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save hostel override");
      showSuccess(`${hostel} override saved`);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save hostel override");
    } finally {
      setSavingOverride(null);
    }
  };

  const syncController = async (ctrl: Controller) => {
    setSyncingController(ctrl.id);
    try {
      const res = await apiFetch("/api/data-codes/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controllerId: ctrl.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Controller sync failed");
      showSuccess(`${ctrl.name} synced: ${data.lastSync?.added ?? 0} new codes`);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Controller sync failed");
    } finally {
      setSyncingController(null);
    }
  };

  const syncAllControllers = async () => {
    setSyncingAll(true);
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
        showError(`Sync finished with ${failed} failure${failed === 1 ? "" : "s"}; ${completed} controller${completed === 1 ? "" : "s"} completed.`);
      } else {
        showSuccess(`All controllers synced: ${completed} completed`);
      }
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "All-controller sync failed");
    } finally {
      setSyncingAll(false);
    }
  };

  const addPool = async (ctrl: Controller) => {
    const draft = newPoolDrafts[ctrl.id] ?? {};
    const poolKey = (draft.poolKey || "").trim();
    if (!poolKey || !draft.planName || !draft.planType) {
      showError("Enter a pool key, plan name, and plan type first.");
      return;
    }
    setPoolDrafts((prev) => ({ ...prev, [draftKey(ctrl.id, poolKey)]: { ...draft, poolKey: undefined } }));
    await updatePool(ctrl, poolKey, draft);
    setNewPoolDrafts((prev) => ({ ...prev, [ctrl.id]: {} }));
  };

  // ─── Hostels not in any controller ───────────────────────────────────────

  const unassignedHostels = allHostels.filter(
    (h) =>
      !controllers.some((c) => c.memberHostels.includes(h.name)),
  );

  // ─── Hostels available for a specific controller's assign modal ──────────

  const availableForAssign = (ctrl: Controller) =>
    allHostels.filter(
      (h) =>
        !controllers.some(
          (c) =>
            c.id !== ctrl.id &&
            c.memberHostels.includes(h.name),
        ),
    );

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  return (
    <ProtectedRoute module="hostels">
      <div className="min-h-screen bg-apple-gray-50">
        <header className="bg-white shadow-sm border-b border-apple-gray-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Logo variant="dark" />
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent">
                  Controllers
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchData}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
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

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Status messages */}
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-2xl text-sm">
              {success}
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <Server className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-apple-gray-900">
                  {controllers.length}
                </p>
                <p className="text-xs text-apple-gray-500">Controllers</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-xl">
                <Building2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-apple-gray-900">
                  {controllers.reduce(
                    (sum, c) => sum + c.memberHostels.length,
                    0,
                  )}
                </p>
                <p className="text-xs text-apple-gray-500">Assigned</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl">
                <Globe className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-apple-gray-900">
                  {unassignedHostels.length}
                </p>
                <p className="text-xs text-apple-gray-500">Standalone</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-apple-gray-900">
                  {allHostels.length}
                </p>
                <p className="text-xs text-apple-gray-500">Total Hostels</p>
              </div>
            </div>
          </div>

          {/* Add new controller */}
          {isSuperAdmin && (
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-500" />
              Add New Controller
            </h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={newCtrlName}
                onChange={(e) => setNewCtrlName(e.target.value)}
                placeholder="Controller name (e.g. Ayoni, Sam, Demonstration)"
                className="flex-1 px-4 py-3 border border-apple-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 placeholder-apple-gray-400"
              />
              <button
                type="submit"
                disabled={creating || !newCtrlName.trim()}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-2xl shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {creating ? "Creating\u2026" : "Create Controller"}
              </button>
            </form>
          </div>
          )}

          {/* Controller list */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-500" />
              <span>Controllers</span>
              {isSuperAdmin && (
                <button
                  onClick={syncAllControllers}
                  disabled={syncingAll || syncingController !== null}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? "animate-spin" : ""}`} />
                  {syncingAll ? "Syncing all…" : "Sync all controllers"}
                </button>
              )}
              <span className="ml-auto text-sm font-normal text-apple-gray-500">
                {controllers.length}{" "}
                {controllers.length === 1 ? "controller" : "controllers"}
              </span>
            </h2>

            {loading ? (
              <div className="py-12 text-center text-apple-gray-400">
                Loading\u2026
              </div>
            ) : controllers.length === 0 ? (
              <div className="py-12 text-center text-apple-gray-400">
                No controllers yet. Create one above.
              </div>
            ) : (
              <ul className="divide-y divide-apple-gray-100">
                {controllers.map((ctrl) => {
                  const isExpanded = expandedId === ctrl.id;
                  return (
                    <li key={ctrl.id} className="py-4">
                      {/* Controller row */}
                      <div className="flex items-center gap-3">
                        {editingId === ctrl.id ? (
                          <>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              autoFocus
                              className="flex-1 px-3 py-2 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900"
                            />
                            <button
                              onClick={() => handleSave(ctrl.id)}
                              disabled={saving || !editName.trim()}
                              className="p-2 rounded-xl bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-2 rounded-xl bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                setExpandedId(isExpanded ? null : ctrl.id)
                              }
                              className="p-2 rounded-xl bg-apple-gray-50 text-apple-gray-400 hover:bg-apple-gray-100 hover:text-apple-gray-600 transition-colors"
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-apple-gray-900 font-medium">
                                  {ctrl.name}
                                </span>
                                {ctrl.isActive ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    <Power className="w-3 h-3" /> Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-apple-gray-100 text-apple-gray-500">
                                    <PowerOff className="w-3 h-3" /> Inactive
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {ctrl.memberHostels.length === 0 ? (
                                  <span className="text-xs text-apple-gray-400 italic">
                                    No hostels assigned
                                  </span>
                                ) : (
                                  ctrl.memberHostels.map((h) => (
                                    <span
                                      key={h}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                                    >
                                      <Building2 className="w-3 h-3 mr-1" />
                                      {h}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-apple-gray-400 shrink-0">
                              {ctrl.memberHostels.length}{" "}
                              {ctrl.memberHostels.length === 1
                                ? "hostel"
                                : "hostels"}
                            </span>
                            {isSuperAdmin && (
                            <>
                            <button
                              onClick={() => openAssign(ctrl)}
                              className="p-2 rounded-xl bg-apple-gray-100 text-apple-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                              title="Assign hostels"
                            >
                              <UserPlus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => startEdit(ctrl)}
                              className="p-2 rounded-xl bg-apple-gray-100 text-apple-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(ctrl)}
                              className={`p-2 rounded-xl transition-colors ${
                                ctrl.isActive
                                  ? "bg-apple-gray-100 text-apple-gray-600 hover:bg-amber-100 hover:text-amber-600"
                                  : "bg-apple-gray-100 text-apple-gray-600 hover:bg-green-100 hover:text-green-600"
                              }`}
                              title={ctrl.isActive ? "Deactivate" : "Activate"}
                            >
                              {ctrl.isActive ? (
                                <PowerOff className="w-4 h-4" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(ctrl)}
                              className="p-2 rounded-xl bg-apple-gray-100 text-apple-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            </>
                            )}
                          </>
                        )}
                      </div>

                      {/* Expanded detail — member hostels */}
                      {isExpanded && !editingId && (
                        <div className="mt-4 ml-11 space-y-3">
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                              <h3 className="text-sm font-semibold text-apple-gray-900">Controller plan pools</h3>
                              <button onClick={() => syncController(ctrl)} disabled={syncingController === ctrl.id} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-50">
                                <RefreshCw className={`w-3.5 h-3.5 ${syncingController === ctrl.id ? "animate-spin" : ""}`} />
                                {syncingController === ctrl.id ? "Syncing…" : "Sync Omada"}
                              </button>
                            </div>
                            <p className="text-xs text-apple-gray-500">Approve a pool and set its product terms. Eligible hostels will receive the plan automatically; codes remain shared at controller level.</p>
                            {Object.entries(ctrl.poolMetadata || {}).map(([poolKey, metadata]) => {
                              const key = draftKey(ctrl.id, poolKey);
                              const draft = poolDrafts[key] ?? metadata;
                              return (
                                <div key={poolKey} className="rounded-xl bg-white p-3 space-y-2 shadow-sm">
                                  <div className="flex items-center gap-2"><code className="flex-1 truncate text-xs text-apple-gray-500">{poolKey}</code><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${draft.approved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{draft.approved ? "Approved" : "Needs review"}</span></div>
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                    <input value={draft.planName ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, planName: e.target.value } }))} placeholder="Plan name" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" />
                                    <select value={draft.planType ?? "device"} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, planType: e.target.value as PoolMetadata["planType"] } }))} className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs"><option value="device">Device</option><option value="unlimited">Unlimited</option></select>
                                    <input type="number" value={draft.usersCount ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, usersCount: Number(e.target.value) } }))} placeholder="Users" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" />
                                    <input type="number" value={draft.duration ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, duration: Number(e.target.value) } }))} placeholder="Days" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" />
                                    <input type="number" value={draft.price ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, price: Number(e.target.value) } }))} placeholder="Price" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-apple-gray-600"><label className="inline-flex items-center gap-1"><input type="checkbox" checked={draft.approved === true} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, approved: e.target.checked } }))} /> Approved</label><label className="inline-flex items-center gap-1"><input type="checkbox" checked={draft.enabled !== false} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, enabled: e.target.checked } }))} /> Enabled</label><input value={draft.unlimitedPeriod ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, unlimitedPeriod: e.target.value } }))} placeholder="Unlimited period" className="rounded-lg border border-apple-gray-200 px-2 py-1.5 text-xs" /><button onClick={() => updatePool(ctrl, poolKey)} disabled={savingPool === key} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Save className="w-3 h-3" />{savingPool === key ? "Saving…" : "Save pool"}</button></div>
                                </div>
                              );
                            })}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6"><input value={newPoolDrafts[ctrl.id]?.poolKey ?? ""} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], poolKey: e.target.value } }))} placeholder="New pool key" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" /><input value={newPoolDrafts[ctrl.id]?.planName ?? ""} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], planName: e.target.value } }))} placeholder="Plan name" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" /><select value={newPoolDrafts[ctrl.id]?.planType ?? "device"} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], planType: e.target.value as PoolMetadata["planType"], approved: true, enabled: true } }))} className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs"><option value="device">Device</option><option value="unlimited">Unlimited</option></select><input type="number" value={newPoolDrafts[ctrl.id]?.price ?? ""} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], price: Number(e.target.value), approved: true, enabled: true } }))} placeholder="Price" className="rounded-lg border border-apple-gray-200 px-2 py-2 text-xs" /><button onClick={() => addPool(ctrl)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100"><Plus className="w-3 h-3" />Add pool</button></div>
                            {ctrl.lastSync && <p className="text-[11px] text-apple-gray-500">Last sync: {ctrl.lastSync.added ?? 0} added · {ctrl.lastSync.skipped ?? 0} refreshed · {ctrl.lastSync.status ?? "unknown"}</p>}
                          </div>
                          {ctrl.memberHostels.length === 0 ? (
                            <p className="text-sm text-apple-gray-400 italic">
                              No hostels assigned yet. Click{" "}
                              <UserPlus className="w-3 h-3 inline" /> to assign
                              hostels.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {ctrl.memberHostels.map((h) => (
                                <li
                                  key={h}
                                  className="flex items-center gap-2 px-3 py-2 bg-apple-gray-50 rounded-xl"
                                >
                                  <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                                  <span className="flex-1 text-sm text-apple-gray-900 font-medium">
                                    {h}
                                  </span>
                                  {Object.keys(ctrl.poolMetadata || {}).length > 0 && <details className="relative"><summary className="cursor-pointer list-none rounded-lg bg-apple-gray-100 px-2 py-1 text-[11px] text-apple-gray-600">Override</summary><div className="absolute right-0 top-8 z-20 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-black/5"><p className="mb-2 text-xs font-semibold text-apple-gray-700">Hostel pricing / access</p>{Object.keys(ctrl.poolMetadata || {}).map((poolKey) => { const oKey = `${ctrl.id}:${h}:${poolKey}`; const persisted = allHostels.find((hostel) => hostel.name === h)?.poolOverrides?.[poolKey] || {}; const override = overrideDrafts[oKey] || persisted; return <div key={poolKey} className="mb-2 flex items-center gap-1"><span className="w-24 truncate text-[10px] text-apple-gray-500" title={poolKey}>{poolKey.split("|")[0]}</span><input type="number" value={override.price ?? ""} onChange={(e) => setOverrideDrafts((p) => ({ ...p, [oKey]: { ...override, price: Number(e.target.value) } }))} placeholder="Price" className="w-16 rounded border border-apple-gray-200 px-1 py-1 text-[11px]" /><label className="text-[10px]"><input type="checkbox" checked={override.enabled !== false} onChange={(e) => setOverrideDrafts((p) => ({ ...p, [oKey]: { ...override, enabled: e.target.checked } }))} /> on</label><button onClick={() => updateOverride(ctrl.id, h, poolKey)} disabled={savingOverride === oKey} className="rounded bg-blue-600 p-1 text-white"><Save className="h-3 w-3" /></button></div>; })}</div></details>}
                                  {renameTarget?.controllerId === ctrl.id &&
                                  renameTarget?.oldName === h ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={renameNew}
                                        onChange={(e) =>
                                          setRenameNew(e.target.value)
                                        }
                                        autoFocus
                                        className="px-3 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                        placeholder="New name"
                                      />
                                      <button
                                        onClick={handleRename}
                                        disabled={
                                          renaming || !renameNew.trim()
                                        }
                                        className="p-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                                        title="Save"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRenameTarget(null);
                                          setRenameNew("");
                                        }}
                                        className="p-1 rounded-lg bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200 transition-colors"
                                        title="Cancel"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      {isSuperAdmin && (
                                      <>
                                      <button
                                        onClick={() => {
                                          setRenameTarget({
                                            controllerId: ctrl.id,
                                            oldName: h,
                                          });
                                          setRenameNew(h);
                                        }}
                                        className="p-1 rounded-lg bg-apple-gray-100 text-apple-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                                        title="Rename"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          setUnassignTarget({
                                            controllerId: ctrl.id,
                                            hostelName: h,
                                          })
                                        }
                                        className="p-1 rounded-lg bg-apple-gray-100 text-apple-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                                        title="Unassign"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                      </>
                                      )}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Standalone hostels section */}
          {unassignedHostels.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-500" />
                Standalone Hostels
                <span className="ml-auto text-sm font-normal text-apple-gray-500">
                  {unassignedHostels.length} not assigned to any controller
                </span>
              </h2>
              <ul className="divide-y divide-apple-gray-100">
                {unassignedHostels.map((h) => (
                  <li
                    key={h.id}
                    className="py-3 flex items-center gap-3"
                  >
                    <Globe className="w-4 h-4 text-apple-gray-400 shrink-0" />
                    <span className="text-apple-gray-900 font-medium flex-1">
                      {h.name}
                    </span>
                    <span className="text-xs text-apple-gray-400 italic">
                      Uses legacy code pool
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}

      {/* Delete confirmation */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Controller"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All ${deleteTarget?.memberHostels.length ?? 0} member hostels will be unassigned. Codes stay in Firestore but become orphaned (legacy mode).`}
        confirmText={deleting ? "Deleting\u2026" : "Delete"}
        type="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Unassign confirmation */}
      <ConfirmationModal
        isOpen={!!unassignTarget}
        title="Unassign Hostel"
        message={`Remove "${unassignTarget?.hostelName}" from "${controllers.find((c) => c.id === unassignTarget?.controllerId)?.name ?? ""}"? Codes drawn by this hostel will revert to legacy mode.`}
        confirmText={unassigning ? "Removing\u2026" : "Unassign"}
        type="warning"
        onConfirm={handleUnassign}
        onClose={() => setUnassignTarget(null)}
      />

      {/* Assign hostels modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Assign Hostels to {assignTarget.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Select hostels to assign. Hostels already assigned to
                    another controller must be unassigned first.
                  </p>
                  {(() => {
                    const available = availableForAssign(assignTarget);
                    return available.length === 0 ? (
                      <p className="text-sm text-apple-gray-400 italic py-4">
                        All hostels are already assigned to controllers.
                      </p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {available.map((h) => {
                          const checked = assignHostels.includes(h.name);
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() =>
                                setAssignHostels((prev) =>
                                  checked
                                    ? prev.filter((n) => n !== h.name)
                                    : [...prev, h.name],
                                )
                              }
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                checked
                                  ? "border-blue-300 bg-blue-50 text-blue-700"
                                  : "border-apple-gray-200 text-apple-gray-700 hover:bg-apple-gray-50"
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                  checked
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-apple-gray-300"
                                }`}
                              >
                                {checked && (
                                  <Check className="w-3 h-3 text-white" />
                                )}
                              </div>
                              <Building2 className="w-4 h-4 text-apple-gray-400" />
                              {h.name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                <button
                  onClick={() => setAssignTarget(null)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex items-center gap-3 justify-end">
              <button
                onClick={() => setAssignTarget(null)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || assignHostels.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-lg disabled:opacity-50 transition-all"
              >
                {assigning
                  ? "Assigning\u2026"
                  : `Assign ${assignHostels.length} Hostel${assignHostels.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
