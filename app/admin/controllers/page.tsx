"use client";
import { adminFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import ConfirmationModal from "@/components/ConfirmationModal";
import { AdminPage, EmptyState, GLASS_INPUT, IconButton, Kpi, Modal, Panel } from "@/components/admin/ui";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
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
  /** How the backend reaches it: Omada Cloud, or the self-hosted controller's Open API. */
  omadaConnection?: OmadaConnection;
  /** For a self-hosted one: its site's name on that controller. */
  omadaSiteName?: string;
}

type OmadaConnection = "cloud" | "self_hosted";

interface ConnectionDraft {
  connection: OmadaConnection;
  siteName: string;
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
  const { adminProfile } = useAuthStore();
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
  // Connection (Omada Cloud or the self-hosted controller)
  const [selfHostedConfigured, setSelfHostedConfigured] = useState(false);
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, ConnectionDraft>>({});
  const [connectionTarget, setConnectionTarget] = useState<Controller | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [ctrlRes, hostelRes] = await Promise.all([
        adminFetch("/api/admin/controllers"),
        adminFetch("/api/hostels"),
      ]);
      const ctrlData = await ctrlRes.json();
      const hostelData = await hostelRes.json();
      if (!ctrlRes.ok) throw new Error(ctrlData.error || "Failed to fetch controllers");
      setControllers(ctrlData.controllers ?? []);
      setSelfHostedConfigured(ctrlData.selfHostedConfigured === true);
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
      const res = await adminFetch("/api/admin/controllers", {
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
      const res = await adminFetch(`/api/admin/controllers/${id}`, {
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
      const res = await adminFetch(`/api/admin/controllers/${ctrl.id}`, {
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

  // ─── Connection ──────────────────────────────────────────────────────────

  const connectionDraft = (ctrl: Controller): ConnectionDraft =>
    connectionDrafts[ctrl.id] ?? {
      connection: ctrl.omadaConnection ?? "cloud",
      siteName: ctrl.omadaSiteName ?? "",
    };

  const connectionChanged = (ctrl: Controller) => {
    const draft = connectionDraft(ctrl);
    return (
      draft.connection !== (ctrl.omadaConnection ?? "cloud") ||
      draft.siteName.trim() !== (ctrl.omadaSiteName ?? "")
    );
  };

  const handleSaveConnection = async () => {
    if (!connectionTarget) return;
    const draft = connectionDraft(connectionTarget);
    setSavingConnection(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/controllers/${connectionTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ omadaConnection: draft.connection, omadaSiteName: draft.siteName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change the connection");
      setConnectionDrafts((d) => {
        const next = { ...d };
        delete next[connectionTarget.id];
        return next;
      });
      showSuccess(
        draft.connection === "self_hosted"
          ? `${connectionTarget.name} now uses the self-hosted controller (site "${draft.siteName.trim()}")`
          : `${connectionTarget.name} now uses Omada Cloud`,
      );
      setConnectionTarget(null);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to change the connection");
    } finally {
      setSavingConnection(false);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/controllers/${deleteTarget.id}`, {
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
      const res = await adminFetch(
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
      const res = await adminFetch(
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
      const res = await adminFetch(
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
      const res = await adminFetch(`/api/admin/controllers/${ctrl.id}/pools/${encodeURIComponent(poolKey)}/metadata`, {
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
      const res = await adminFetch(`/api/admin/controllers/${controllerId}/hostels/${encodeURIComponent(hostel)}/pools/${encodeURIComponent(poolKey)}/override`, {
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
      const res = await adminFetch("/api/data-codes/sync", {
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
      const res = await adminFetch("/api/data-codes/sync", {
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

  return (
    <ProtectedRoute requireSuperAdmin>
      <AdminPage
        eyebrow="NETWORK"
        title="Controllers"
        actions={
          <button onClick={fetchData} className="glass-button">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        }
      >
        {/* Status messages */}
        {error && <div className="glass-alert border-rose-200 bg-rose-50/90 text-rose-700">{error}</div>}
        {success && <div className="glass-alert border-emerald-200 bg-emerald-50/90 text-emerald-800">{success}</div>}

        {/* Quick stats */}
        <div className="kpi-grid lg:grid-cols-4 2xl:grid-cols-4">
          <Kpi label="Controllers" value={controllers.length} tone="blue" icon={<Server className="w-4 h-4" />} />
          <Kpi
            label="Assigned"
            value={controllers.reduce((sum, c) => sum + c.memberHostels.length, 0)}
            tone="green"
            icon={<Building2 className="w-4 h-4" />}
          />
          <Kpi label="Standalone" value={unassignedHostels.length} tone="orange" icon={<Globe className="w-4 h-4" />} />
          <Kpi label="Total Hostels" value={allHostels.length} tone="purple" icon={<Users className="w-4 h-4" />} />
        </div>

        {/* Add new controller */}
        {isSuperAdmin && (
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-500" />
                Add New Controller
              </span>
            }
          >
            <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={newCtrlName}
                onChange={(e) => setNewCtrlName(e.target.value)}
                placeholder="Controller name (e.g. Ayoni, Sam, Demonstration)"
                className={`${GLASS_INPUT} sm:flex-1`}
              />
              <button
                type="submit"
                disabled={creating || !newCtrlName.trim()}
                className="glass-primary w-full sm:w-auto"
              >
                {creating ? "Creating…" : "Create Controller"}
              </button>
            </form>
          </Panel>
        )}

        {/* Controller list */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-500" />
              Controllers
            </span>
          }
          actions={
            <>
              <span className="text-sm text-slate-500">
                {controllers.length} {controllers.length === 1 ? "controller" : "controllers"}
              </span>
              {isSuperAdmin && (
                <button
                  onClick={syncAllControllers}
                  disabled={syncingAll || syncingController !== null}
                  className="glass-primary"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingAll ? "animate-spin" : ""}`} />
                  {syncingAll ? "Syncing all…" : "Sync all controllers"}
                </button>
              )}
            </>
          }
        >
          {loading ? (
            <EmptyState title={"Loading…"} />
          ) : controllers.length === 0 ? (
            <EmptyState title="No controllers yet. Create one above." />
          ) : (
            <ul className="space-y-3">
              {controllers.map((ctrl) => {
                const isExpanded = expandedId === ctrl.id;
                return (
                  <li key={ctrl.id} className="glass-controller hover:translate-y-0">
                    {/* Controller row: stacked on a phone, one line from md up */}
                    {editingId === ctrl.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className={`${GLASS_INPUT} min-w-0 flex-1 basis-full sm:basis-0`}
                        />
                        <IconButton
                          label="Save"
                          tone="success"
                          onClick={() => handleSave(ctrl.id)}
                          disabled={saving || !editName.trim()}
                        >
                          <Check className="w-4 h-4" />
                        </IconButton>
                        <IconButton label="Cancel" onClick={cancelEdit}>
                          <X className="w-4 h-4" />
                        </IconButton>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <IconButton
                            label={isExpanded ? "Collapse" : "Expand"}
                            onClick={() => setExpandedId(isExpanded ? null : ctrl.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </IconButton>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="min-w-0 break-words text-base font-semibold text-slate-900">
                                {ctrl.name}
                              </span>
                              {ctrl.isActive ? (
                                <span className="status-chip inline-flex items-center gap-1">
                                  <Power className="w-3 h-3" /> Active
                                </span>
                              ) : (
                                <span className="slate-chip inline-flex items-center gap-1">
                                  <PowerOff className="w-3 h-3" /> Inactive
                                </span>
                              )}
                              {ctrl.omadaConnection === "self_hosted" ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 font-semibold text-purple-700"
                                  title={`Self-hosted controller, site "${ctrl.omadaSiteName ?? ""}"`}
                                >
                                  <Server className="w-3 h-3" /> Self-hosted
                                </span>
                              ) : (
                                <span className="slate-chip inline-flex items-center gap-1" title="Reached through Omada Cloud">
                                  <Globe className="w-3 h-3" /> Omada Cloud
                                </span>
                              )}
                            </div>
                            {ctrl.omadaConnection === "self_hosted" && ctrl.omadaSiteName && (
                              <p className="mt-1 break-words text-xs text-slate-500">Site &ldquo;{ctrl.omadaSiteName}&rdquo;</p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {ctrl.memberHostels.length === 0 ? (
                                <span className="text-xs italic text-slate-400">No hostels assigned</span>
                              ) : (
                                ctrl.memberHostels.map((h) => (
                                  <span
                                    key={h}
                                    className="inline-flex min-w-0 max-w-full items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700"
                                  >
                                    <Building2 className="mr-1 w-3 h-3 shrink-0" />
                                    <span className="truncate">{h}</span>
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-3 md:border-0 md:pt-0">
                          <span className="mr-auto text-xs text-slate-500 md:mr-1">
                            {ctrl.memberHostels.length} {ctrl.memberHostels.length === 1 ? "hostel" : "hostels"}
                          </span>
                          {isSuperAdmin && (
                            <>
                              <IconButton label="Assign hostels" tone="primary" onClick={() => openAssign(ctrl)}>
                                <UserPlus className="w-4 h-4" />
                              </IconButton>
                              <IconButton label="Edit" onClick={() => startEdit(ctrl)}>
                                <Pencil className="w-4 h-4" />
                              </IconButton>
                              <IconButton
                                label={ctrl.isActive ? "Deactivate" : "Activate"}
                                tone={ctrl.isActive ? "default" : "success"}
                                onClick={() => handleToggleActive(ctrl)}
                              >
                                {ctrl.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                              </IconButton>
                              <IconButton label="Delete" tone="danger" onClick={() => setDeleteTarget(ctrl)}>
                                <Trash2 className="w-4 h-4" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Expanded detail — member hostels */}
                    {isExpanded && !editingId && (
                      <div className="mt-4 space-y-3 sm:ml-[52px]">
                        {isSuperAdmin && (() => {
                          const draft = connectionDraft(ctrl);
                          const setDraft = (change: Partial<ConnectionDraft>) =>
                            setConnectionDrafts((d) => ({ ...d, [ctrl.id]: { ...draft, ...change } }));
                          const selfHosted = draft.connection === "self_hosted";
                          const canSave =
                            connectionChanged(ctrl) && (!selfHosted || (selfHostedConfigured && draft.siteName.trim() !== ""));
                          return (
                            <div className="space-y-3 rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                              <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 text-purple-600" />
                                <h3 className="text-sm font-semibold text-slate-900">Connection</h3>
                              </div>
                              <p className="text-xs text-slate-500">
                                How the backend reaches this controller for vouchers, balances and TV access. Switching
                                takes effect within a minute, and can be switched back the same way.
                              </p>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <select
                                  value={draft.connection}
                                  onChange={(e) => setDraft({ connection: e.target.value as OmadaConnection })}
                                  className={GLASS_INPUT}
                                >
                                  <option value="cloud">Omada Cloud</option>
                                  <option value="self_hosted" disabled={!selfHostedConfigured && ctrl.omadaConnection !== "self_hosted"}>
                                    Self-hosted controller
                                  </option>
                                </select>
                                <input
                                  value={draft.siteName}
                                  onChange={(e) => setDraft({ siteName: e.target.value })}
                                  placeholder="Site name, e.g. Ayoni (finds “Ekiti - Ayoni”)"
                                  disabled={!selfHosted}
                                  maxLength={64}
                                  className={GLASS_INPUT}
                                />
                                <button
                                  onClick={() => setConnectionTarget(ctrl)}
                                  disabled={!canSave}
                                  className="glass-primary"
                                >
                                  <Save className="w-4 h-4" /> Save connection
                                </button>
                              </div>
                              {!selfHostedConfigured && (
                                <p className="text-[11px] text-slate-500">
                                  The self-hosted controller isn&apos;t configured on the server yet (OMADA_SH_*), so it
                                  can&apos;t be chosen.
                                </p>
                              )}
                            </div>
                          );
                        })()}
                        <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-slate-900">Controller plan pools</h3>
                            <button
                              onClick={() => syncController(ctrl)}
                              disabled={syncingController === ctrl.id}
                              className="glass-button ml-auto text-blue-700"
                            >
                              <RefreshCw className={`w-4 h-4 ${syncingController === ctrl.id ? "animate-spin" : ""}`} />
                              {syncingController === ctrl.id ? "Syncing…" : "Sync Omada"}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500">Approve a pool and set its product terms. Eligible hostels will receive the plan automatically; codes remain shared at controller level.</p>
                          {Object.entries(ctrl.poolMetadata || {}).map(([poolKey, metadata]) => {
                            const key = draftKey(ctrl.id, poolKey);
                            const draft = poolDrafts[key] ?? metadata;
                            return (
                              <div key={poolKey} className="glass-card space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <code className="min-w-0 flex-1 break-all text-xs text-slate-500">{poolKey}</code>
                                  <span className={`text-[11px] ${draft.approved ? "status-chip" : "warning-chip"}`}>
                                    {draft.approved ? "Approved" : "Needs review"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                  <input value={draft.planName ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, planName: e.target.value } }))} placeholder="Plan name" className={`${GLASS_INPUT} col-span-2 sm:col-span-1`} />
                                  <select value={draft.planType ?? "device"} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, planType: e.target.value as PoolMetadata["planType"] } }))} className={GLASS_INPUT}><option value="device">Device</option><option value="unlimited">Unlimited</option></select>
                                  <input type="number" value={draft.usersCount ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, usersCount: Number(e.target.value) } }))} placeholder="Users" className={GLASS_INPUT} />
                                  <input type="number" value={draft.duration ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, duration: Number(e.target.value) } }))} placeholder="Days" className={GLASS_INPUT} />
                                  <input type="number" value={draft.price ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, price: Number(e.target.value) } }))} placeholder="Price" className={GLASS_INPUT} />
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                                  <label className="inline-flex min-h-[40px] items-center gap-2">
                                    <input type="checkbox" className="h-4 w-4" checked={draft.approved === true} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, approved: e.target.checked } }))} /> Approved
                                  </label>
                                  <label className="inline-flex min-h-[40px] items-center gap-2">
                                    <input type="checkbox" className="h-4 w-4" checked={draft.enabled !== false} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, enabled: e.target.checked } }))} /> Enabled
                                  </label>
                                  <input value={draft.unlimitedPeriod ?? ""} onChange={(e) => setPoolDrafts((p) => ({ ...p, [key]: { ...draft, unlimitedPeriod: e.target.value } }))} placeholder="Unlimited period" className={`${GLASS_INPUT} sm:w-48 sm:flex-none`} />
                                  <button onClick={() => updatePool(ctrl, poolKey)} disabled={savingPool === key} className="glass-primary w-full sm:ml-auto sm:w-auto">
                                    <Save className="w-4 h-4" />
                                    {savingPool === key ? "Saving…" : "Save pool"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                            <input value={newPoolDrafts[ctrl.id]?.poolKey ?? ""} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], poolKey: e.target.value } }))} placeholder="New pool key" className={`${GLASS_INPUT} col-span-2 sm:col-span-1`} />
                            <input value={newPoolDrafts[ctrl.id]?.planName ?? ""} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], planName: e.target.value } }))} placeholder="Plan name" className={`${GLASS_INPUT} col-span-2 sm:col-span-1`} />
                            <select value={newPoolDrafts[ctrl.id]?.planType ?? "device"} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], planType: e.target.value as PoolMetadata["planType"], approved: true, enabled: true } }))} className={GLASS_INPUT}><option value="device">Device</option><option value="unlimited">Unlimited</option></select>
                            <input type="number" value={newPoolDrafts[ctrl.id]?.price ?? ""} onChange={(e) => setNewPoolDrafts((p) => ({ ...p, [ctrl.id]: { ...p[ctrl.id], price: Number(e.target.value), approved: true, enabled: true } }))} placeholder="Price" className={GLASS_INPUT} />
                            <button onClick={() => addPool(ctrl)} className="glass-button col-span-2 text-blue-700 sm:col-span-2"><Plus className="w-4 h-4" />Add pool</button>
                          </div>
                          {ctrl.lastSync && <p className="text-[11px] text-slate-500">Last sync: {ctrl.lastSync.added ?? 0} added · {ctrl.lastSync.skipped ?? 0} refreshed · {ctrl.lastSync.status ?? "unknown"}</p>}
                        </div>
                        {ctrl.memberHostels.length === 0 ? (
                          <p className="text-sm italic text-slate-400">
                            No hostels assigned yet. Click{" "}
                            <UserPlus className="w-3 h-3 inline" /> to assign
                            hostels.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {ctrl.memberHostels.map((h) => (
                              <li
                                key={h}
                                className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/60 px-3 py-2"
                              >
                                <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-0 sm:flex-1">
                                  <Building2 className="w-4 h-4 shrink-0 text-blue-500" />
                                  <span className="min-w-0 truncate text-sm font-medium text-slate-900" title={h}>
                                    {h}
                                  </span>
                                </div>
                                {Object.keys(ctrl.poolMetadata || {}).length > 0 && (
                                  <details className="group open:order-last open:basis-full">
                                    <summary className="glass-button cursor-pointer list-none text-xs">Override</summary>
                                    <div className="mt-2 w-full rounded-2xl border border-white/90 bg-white/90 p-3 shadow-sm ring-1 ring-black/5 sm:max-w-md">
                                      <p className="mb-2 text-xs font-semibold text-slate-700">Hostel pricing / access</p>
                                      {Object.keys(ctrl.poolMetadata || {}).map((poolKey) => {
                                        const oKey = `${ctrl.id}:${h}:${poolKey}`;
                                        const persisted = allHostels.find((hostel) => hostel.name === h)?.poolOverrides?.[poolKey] || {};
                                        const override = overrideDrafts[oKey] || persisted;
                                        return (
                                          <div key={poolKey} className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className="min-w-0 basis-full truncate text-xs text-slate-500" title={poolKey}>
                                              {poolKey.split("|")[0]}
                                            </span>
                                            <input
                                              type="number"
                                              value={override.price ?? ""}
                                              onChange={(e) => setOverrideDrafts((p) => ({ ...p, [oKey]: { ...override, price: Number(e.target.value) } }))}
                                              placeholder="Price"
                                              className={`${GLASS_INPUT} min-w-0 flex-1 !min-h-[40px]`}
                                            />
                                            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-slate-600">
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked={override.enabled !== false}
                                                onChange={(e) => setOverrideDrafts((p) => ({ ...p, [oKey]: { ...override, enabled: e.target.checked } }))}
                                              />{" "}
                                              on
                                            </label>
                                            <IconButton
                                              label="Save override"
                                              tone="primary"
                                              onClick={() => updateOverride(ctrl.id, h, poolKey)}
                                              disabled={savingOverride === oKey}
                                            >
                                              <Save className="h-4 w-4" />
                                            </IconButton>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </details>
                                )}
                                {renameTarget?.controllerId === ctrl.id &&
                                renameTarget?.oldName === h ? (
                                  <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
                                    <input
                                      type="text"
                                      value={renameNew}
                                      onChange={(e) => setRenameNew(e.target.value)}
                                      autoFocus
                                      className={`${GLASS_INPUT} min-w-0 flex-1 sm:w-48 sm:flex-none`}
                                      placeholder="New name"
                                    />
                                    <IconButton
                                      label="Save"
                                      tone="success"
                                      onClick={handleRename}
                                      disabled={renaming || !renameNew.trim()}
                                    >
                                      <Check className="w-4 h-4" />
                                    </IconButton>
                                    <IconButton
                                      label="Cancel"
                                      onClick={() => {
                                        setRenameTarget(null);
                                        setRenameNew("");
                                      }}
                                    >
                                      <X className="w-4 h-4" />
                                    </IconButton>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {isSuperAdmin && (
                                      <>
                                        <IconButton
                                          label="Rename"
                                          onClick={() => {
                                            setRenameTarget({
                                              controllerId: ctrl.id,
                                              oldName: h,
                                            });
                                            setRenameNew(h);
                                          }}
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </IconButton>
                                        <IconButton
                                          label="Unassign"
                                          tone="danger"
                                          onClick={() =>
                                            setUnassignTarget({
                                              controllerId: ctrl.id,
                                              hostelName: h,
                                            })
                                          }
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </IconButton>
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
        </Panel>

        {/* Standalone hostels section */}
        {unassignedHostels.length > 0 && (
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-500" />
                Standalone Hostels
              </span>
            }
            actions={
              <span className="text-sm text-slate-500">
                {unassignedHostels.length} not assigned to any controller
              </span>
            }
          >
            <ul className="divide-y divide-slate-200/60">
              {unassignedHostels.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <Globe className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 break-words font-medium text-slate-900">{h.name}</span>
                  <span className="text-xs italic text-slate-400">Uses legacy code pool</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </AdminPage>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}

      {/* Delete confirmation */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Controller"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All ${deleteTarget?.memberHostels.length ?? 0} member hostels will be unassigned. Codes stay in Firestore but become orphaned (legacy mode).`}
        confirmText={deleting ? "Deleting…" : "Delete"}
        type="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Connection change confirmation */}
      <ConfirmationModal
        isOpen={!!connectionTarget}
        title="Change how this controller is reached"
        message={
          connectionTarget
            ? connectionDraft(connectionTarget).connection === "self_hosted"
              ? `Switch "${connectionTarget.name}" to the self-hosted controller, site "${connectionDraft(connectionTarget).siteName.trim()}"? Voucher syncs, balance checks and TV access for its ${connectionTarget.memberHostels.length} hostels will go to that site. Run a sync afterwards.`
              : `Switch "${connectionTarget.name}" back to Omada Cloud? Voucher syncs, balance checks and TV access for its ${connectionTarget.memberHostels.length} hostels will go to the cloud controller again.`
            : ""
        }
        confirmText={savingConnection ? "Saving…" : "Switch"}
        type="warning"
        onConfirm={handleSaveConnection}
        onClose={() => setConnectionTarget(null)}
      />

      {/* Unassign confirmation */}
      <ConfirmationModal
        isOpen={!!unassignTarget}
        title="Unassign Hostel"
        message={`Remove "${unassignTarget?.hostelName}" from "${controllers.find((c) => c.id === unassignTarget?.controllerId)?.name ?? ""}"? Codes drawn by this hostel will revert to legacy mode.`}
        confirmText={unassigning ? "Removing…" : "Unassign"}
        type="warning"
        onConfirm={handleUnassign}
        onClose={() => setUnassignTarget(null)}
      />

      {/* Assign hostels modal */}
      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        size="lg"
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <UserPlus className="w-5 h-5" />
          </span>
        }
        title={<span className="break-words">Assign Hostels to {assignTarget?.name}</span>}
        footer={
          <>
            <button onClick={() => setAssignTarget(null)} className="glass-button">
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={assigning || assignHostels.length === 0}
              className="glass-primary"
            >
              {assigning
                ? "Assigning…"
                : `Assign ${assignHostels.length} Hostel${assignHostels.length !== 1 ? "s" : ""}`}
            </button>
          </>
        }
      >
        {assignTarget && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Select hostels to assign. Hostels already assigned to
              another controller must be unassigned first.
            </p>
            {(() => {
              const available = availableForAssign(assignTarget);
              return available.length === 0 ? (
                <p className="py-4 text-sm italic text-slate-400">
                  All hostels are already assigned to controllers.
                </p>
              ) : (
                <div className="space-y-1.5">
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
                        className={`flex min-h-[44px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition-all ${
                          checked
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-white/80 bg-white/60 text-slate-700 hover:bg-white"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                            checked ? "border-blue-500 bg-blue-500" : "border-slate-300"
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <Building2 className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 break-words">{h.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </Modal>
    </ProtectedRoute>
  );
}
