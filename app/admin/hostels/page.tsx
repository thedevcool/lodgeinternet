"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import ConfirmationModal from "@/components/ConfirmationModal";
import {
  ArrowLeft,
  Building2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
  Smartphone,
  Tv,
  Wifi,
} from "lucide-react";
import type { Hostel, HostelCollage } from "@/types";

export default function AdminHostelsPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("hostels");
  const router = useRouter();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [collages, setCollages] = useState<HostelCollage[]>([]);
  const allowedHostels = useMemo(
    () =>
      !adminProfile?.hostels?.length || adminProfile.isSuperAdmin
        ? hostels
        : hostels.filter((h) => adminProfile.hostels.includes(h.id)),
    [hostels, adminProfile],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add new hostel
  const [newName, setNewName] = useState("");
  const [newCollageId, setNewCollageId] = useState("");
  const [adding, setAdding] = useState(false);

  // Create new collage
  const [newCollageName, setNewCollageName] = useState("");
  const [creatingCollage, setCreatingCollage] = useState(false);
  const [showNewCollage, setShowNewCollage] = useState(false);

  // Edit hostel
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPlanTypes, setEditPlanTypes] = useState<string[]>([]);
  const [editDeviceCounts, setEditDeviceCounts] = useState<number[]>([]);
  const [editCollageId, setEditCollageId] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete hostel
  const [deleteTarget, setDeleteTarget] = useState<Hostel | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchHostels();
    fetchCollages();
  }, []);

  const fetchHostels = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/hostels");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch hostels");
      setHostels(data.hostels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hostels");
    } finally {
      setLoading(false);
    }
  };

  const fetchCollages = async () => {
    try {
      const res = await apiFetch("/api/hostel-collages");
      const data = await res.json();
      if (res.ok) setCollages(data.collages ?? []);
    } catch {
      // silently fail
    }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch("/api/hostels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, collageId: newCollageId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add hostel");
      setNewName("");
      showSuccess(`"${name}" added successfully`);
      await fetchHostels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add hostel");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (hostel: Hostel) => {
    setEditingId(hostel.id);
    setEditName(hostel.name);
    setEditPassword(hostel.password ?? "");
    setEditPlanTypes(hostel.planTypes ?? ["device", "tv", "unlimited"]);
    setEditDeviceCounts(
      hostel.deviceUserCounts && hostel.deviceUserCounts.length > 0
        ? hostel.deviceUserCounts
        : [3, 5],
    );
    setEditCollageId(hostel.collageId ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPassword("");
    setEditPlanTypes([]);
    setEditDeviceCounts([]);
    setEditCollageId("");
  };

  const handleSave = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/hostels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          password: editPassword,
          planTypes: editPlanTypes,
          // Only meaningful when device plans are enabled; harmless otherwise.
          deviceUserCounts: editDeviceCounts,
          collageId: editCollageId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update hostel");
      setEditingId(null);
      showSuccess(`Hostel renamed to "${name}"`);
      await fetchHostels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update hostel");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/hostels?id=${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete hostel");
      showSuccess(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await fetchHostels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete hostel");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateCollage = async () => {
    const name = newCollageName.trim();
    if (!name) return;
    setCreatingCollage(true);
    setError("");
    try {
      const res = await apiFetch("/api/hostel-collages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create collage");
      setNewCollageName("");
      setShowNewCollage(false);
      showSuccess(`Collage "${name}" created`);
      await fetchCollages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collage");
    } finally {
      setCreatingCollage(false);
    }
  };

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
                  Hostel Management
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

          {/* Add new hostel */}
          {canEdit && (
            <div className="bg-white rounded-3xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-500" />
                Add New Hostel
              </h2>
              <form
                onSubmit={handleAdd}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Hostel name (e.g. Ayoni, Block C)"
                    className="flex-1 px-4 py-3 border border-apple-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 placeholder-apple-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={adding || !newName.trim()}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-2xl shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {adding ? "Adding…" : "Add Hostel"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-apple-gray-500 mb-1">
                      Collage (optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={newCollageId}
                        onChange={(e) => setNewCollageId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 text-sm"
                      >
                        <option value="">No collage</option>
                        {collages.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCollage(!showNewCollage)}
                        className="px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                      >
                        + New
                      </button>
                    </div>
                  </div>
                </div>
                {showNewCollage && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={newCollageName}
                      onChange={(e) => setNewCollageName(e.target.value)}
                      placeholder="Collage name"
                      className="flex-1 px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCollage}
                      disabled={creatingCollage || !newCollageName.trim()}
                      className="px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-all"
                    >
                      {creatingCollage ? "Creating…" : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCollage(false);
                        setNewCollageName("");
                      }}
                      className="p-2 text-apple-gray-400 hover:text-apple-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Hostel list */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              Hostels
              <span className="ml-auto text-sm font-normal text-apple-gray-500">
                {allowedHostels.length}{" "}
                {allowedHostels.length === 1 ? "hostel" : "hostels"}
              </span>
            </h2>

            {loading ? (
              <div className="py-12 text-center text-apple-gray-400">
                Loading…
              </div>
            ) : allowedHostels.length === 0 ? (
              <div className="py-12 text-center text-apple-gray-400">
                {hostels.length === 0
                  ? "No hostels yet. Add one above."
                  : "No hostels assigned to your account."}
              </div>
            ) : (
              <ul className="divide-y divide-apple-gray-100">
                {allowedHostels.map((hostel) => (
                  <li key={hostel.id} className="py-4 flex items-center gap-3">
                    {editingId === hostel.id ? (
                      <>
                        <div className="flex-1 space-y-3">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            className="w-full px-3 py-2 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900"
                          />
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-apple-gray-500 shrink-0">Password:</label>
                            <input
                              type="text"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value.toUpperCase())}
                              placeholder="e.g. LODGES01"
                              className="flex-1 px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 font-mono text-sm"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                {
                                  value: "device",
                                  label: "Device Plans",
                                  color: "blue",
                                },
                                {
                                  value: "tv",
                                  label: "TV Plans",
                                  color: "purple",
                                },
                                {
                                  value: "unlimited",
                                  label: "Unlimited",
                                  color: "amber",
                                },
                              ] as const
                            ).map(({ value, label, color }) => {
                              const checked = editPlanTypes.includes(value);
                              const toggle = () =>
                                setEditPlanTypes((prev) =>
                                  checked
                                    ? prev.filter((p) => p !== value)
                                    : [...prev, value],
                                );
                              const cls = checked
                                ? color === "blue"
                                  ? "bg-blue-100 text-blue-700 border-blue-300"
                                  : color === "purple"
                                    ? "bg-purple-100 text-purple-700 border-purple-300"
                                    : "bg-amber-100 text-amber-700 border-amber-300"
                                : "bg-apple-gray-50 text-apple-gray-500 border-apple-gray-200";
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={toggle}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${cls}`}
                                >
                                  {value === "tv" ? (
                                    <Tv className="w-3 h-3" />
                                  ) : value === "unlimited" ? (
                                    <Wifi className="w-3 h-3" />
                                  ) : (
                                    <Smartphone className="w-3 h-3" />
                                  )}
                                  {label}
                                  {checked && <Check className="w-3 h-3" />}
                                </button>
                              );
                            })}
                          </div>
                          {editPlanTypes.includes("device") && (
                            <div className="pl-0.5">
                              <label className="block text-[11px] font-medium text-apple-gray-500 mb-1.5">
                                Device plans — include
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {([3, 5] as const).map((count) => {
                                  const checked =
                                    editDeviceCounts.includes(count);
                                  const toggle = () =>
                                    setEditDeviceCounts((prev) =>
                                      checked
                                        ? prev.filter((c) => c !== count)
                                        : [...prev, count],
                                    );
                                  const cls = checked
                                    ? "bg-blue-100 text-blue-700 border-blue-300"
                                    : "bg-apple-gray-50 text-apple-gray-500 border-apple-gray-200";
                                  return (
                                    <button
                                      key={count}
                                      type="button"
                                      onClick={toggle}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${cls}`}
                                    >
                                      <Smartphone className="w-3 h-3" />
                                      {count} Users
                                      {checked && <Check className="w-3 h-3" />}
                                    </button>
                                  );
                                })}
                              </div>
                              {editDeviceCounts.length === 0 && (
                                <p className="text-[11px] text-amber-600 mt-1">
                                  None selected — both 3 and 5 user plans will
                                  show.
                                </p>
                              )}
                            </div>
                          )}
                          <div>
                            <label className="block text-xs font-medium text-apple-gray-500 mb-1">
                              Collage
                            </label>
                            <select
                              value={editCollageId}
                              onChange={(e) => setEditCollageId(e.target.value)}
                              className="w-full px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 text-sm"
                            >
                              <option value="">No collage</option>
                              {collages.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-apple-gray-400">
                            {editPlanTypes.length === 0 ||
                            editPlanTypes.length === 3
                              ? "All plan types will be available at this hostel."
                              : `Only ${editPlanTypes.join(", ")} will be available.`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleSave(hostel.id)}
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
                        <div className="flex-1 min-w-0">
                          <span className="text-apple-gray-900 font-medium block">
                            {hostel.name}
                          </span>
                          {hostel.collageId && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium">
                              {collages.find((c) => c.id === hostel.collageId)?.name || "Unknown Collage"}
                            </span>
                          )}
                          {hostel.password && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-apple-gray-100 text-apple-gray-600 rounded-md text-xs font-mono">
                              {hostel.password}
                            </span>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {(hostel.planTypes && hostel.planTypes.length > 0
                              ? hostel.planTypes
                              : ["device", "tv", "unlimited"]
                            ).map((pt) => (
                              <span
                                key={pt}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  pt === "tv"
                                    ? "bg-purple-100 text-purple-700"
                                    : pt === "unlimited"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {pt === "tv" ? (
                                  <Tv className="w-3 h-3" />
                                ) : pt === "unlimited" ? (
                                  <Wifi className="w-3 h-3" />
                                ) : (
                                  <Smartphone className="w-3 h-3" />
                                )}
                                {pt === "tv"
                                  ? "TV Plans"
                                  : pt === "unlimited"
                                    ? "Unlimited"
                                    : "Device Plans"}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="text-xs text-apple-gray-400 shrink-0">
                          {hostel.createdAt
                            ? new Date(hostel.createdAt).toLocaleDateString()
                            : ""}
                        </span>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => startEdit(hostel)}
                              className="p-2 rounded-xl bg-apple-gray-100 text-apple-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(hostel)}
                              className="p-2 rounded-xl bg-apple-gray-100 text-apple-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Hostel"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText={deleting ? "Deleting…" : "Delete"}
        type="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </ProtectedRoute>
  );
}
