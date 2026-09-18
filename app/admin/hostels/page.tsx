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
  Power,
  PowerOff,
  Layers,
  ChevronDown,
} from "lucide-react";
import type { Hostel, HostelCollage, HostelSchool } from "@/types";

export default function AdminHostelsPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("hostels");
  const router = useRouter();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [collages, setCollages] = useState<HostelCollage[]>([]);
  const [schools, setSchools] = useState<HostelSchool[]>([]);
  const allowedHostels = useMemo(
    () =>
      !adminProfile?.hostels?.length || adminProfile.isSuperAdmin
        ? hostels
        : hostels.filter((h) => adminProfile.hostels.includes(h.id)),
    [hostels, adminProfile],
  );
  const activeHostels = allowedHostels.filter((hostel) => hostel.isActive !== false).length;
  const groupedHostels = allowedHostels.filter((hostel) => Boolean(hostel.collageId)).length;
  const [hostelSearch, setHostelSearch] = useState("");
  const [hostelGroupFilter, setHostelGroupFilter] = useState("all");
  const visibleHostels = allowedHostels.filter((hostel) => {
    const matchesSearch = hostel.name.toLowerCase().includes(hostelSearch.trim().toLowerCase());
    const matchesGroup = hostelGroupFilter === "all" ||
      (hostelGroupFilter === "ungrouped" ? !hostel.collageId : hostel.collageId === hostelGroupFilter);
    return matchesSearch && matchesGroup;
  });
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
  const [newSchoolId, setNewSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [showNewSchool, setShowNewSchool] = useState(false);
  const [newCollegeName, setNewCollegeName] = useState("");
  const [newCollegeSchoolId, setNewCollegeSchoolId] = useState("");
  const [creatingCollege, setCreatingCollege] = useState(false);
  const [showNewCollege, setShowNewCollege] = useState(false);
  const [inlineCollegeSchoolId, setInlineCollegeSchoolId] = useState<string | null>(null);
  const [groupEdit, setGroupEdit] = useState<{ kind: "school" | "college"; id: string } | null>(null);
  const [groupEditName, setGroupEditName] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupToggling, setGroupToggling] = useState<string | null>(null);
  const [existingCollegeBySchool, setExistingCollegeBySchool] = useState<Record<string, string[]>>({});
  const [existingHostelByCollege, setExistingHostelByCollege] = useState<Record<string, string[]>>({});
  const [assigningExisting, setAssigningExisting] = useState<string | null>(null);
  const [openCollegePicker, setOpenCollegePicker] = useState<Record<string, boolean>>({});
  const [openHostelPicker, setOpenHostelPicker] = useState<Record<string, boolean>>({});

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
    fetchSchools();
  }, []);

  const fetchHostels = async () => {
    setLoading(true);
    try {
      // Without this, a deactivated hostel is invisible to the public listing
      // and would vanish from this page too — the only way back on would be
      // gone along with it.
      const res = await apiFetch("/api/hostels?includeInactive=true");
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
      const res = await apiFetch("/api/hostel-collages?includeInactive=true");
      const data = await res.json();
      if (res.ok) setCollages(data.collages ?? []);
    } catch {
      // silently fail
    }
  };

  const fetchSchools = async () => {
    try {
      const res = await apiFetch("/api/hostel-schools?includeInactive=true");
      const data = await res.json();
      if (res.ok) setSchools(data.schools ?? []);
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

  // The installation is being pulled: nothing sells here from this moment on,
  // and any TV device already granted access is revoked immediately. Off is a
  // hard stop, not a delisting — the backend owns that behavior end to end;
  // this only flips the switch and shows what it reports.
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleActive = async (hostel: Hostel) => {
    const nextActive = hostel.isActive === false;
    if (
      !nextActive &&
      !window.confirm(
        `Turn off "${hostel.name}"?\n\nNothing will sell here from now on, and any TV device already ` +
          `granted access at this hostel will be revoked immediately. This can be undone later.`,
      )
    ) {
      return;
    }

    setTogglingId(hostel.id);
    setError("");
    try {
      const res = await apiFetch("/api/admin/hostels/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostel: hostel.name, isActive: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change hostel status");

      const failures: string[] = data.failures || [];
      if (failures.length > 0) {
        setError(
          `"${hostel.name}" is now ${nextActive ? "active" : "inactive"}, but ` +
            `${failures.length} TV device(s) could not be updated — check the TV Users page.`,
        );
      } else {
        showSuccess(
          nextActive
            ? `"${hostel.name}" is active again.`
            : `"${hostel.name}" is now inactive — ${data.devicesRevoked ?? 0} device(s) revoked.`,
        );
      }
      await fetchHostels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change hostel status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      // apiFetch, not a bare fetch: DELETE /api/hostels is admin-guarded and
      // needs the bearer token, and the backend now lives on its own origin —
      // neither of which a same-origin fetch() gets for free.
      const res = await apiFetch(
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
        body: JSON.stringify({ name, schoolId: newSchoolId || undefined }),
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

  const handleCreateSchool = async () => {
    const name = newSchoolName.trim();
    if (!name) return;
    setCreatingSchool(true);
    setError("");
    try {
      const res = await apiFetch("/api/hostel-schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create school");
      setNewSchoolName("");
      setShowNewSchool(false);
      setNewSchoolId(data.id || "");
      showSuccess(`School "${name}" created`);
      await fetchSchools();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create school");
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleCreateCollege = async () => {
    const name = newCollegeName.trim();
    if (!name) return;
    setCreatingCollege(true);
    setError("");
    try {
      const res = await apiFetch("/api/hostel-collages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, schoolId: newCollegeSchoolId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create college");
      setNewCollegeName("");
      setShowNewCollege(false);
      showSuccess(`College "${name}" created`);
      await fetchCollages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create college");
    } finally {
      setCreatingCollege(false);
    }
  };

  const openCollegeForSchool = (schoolId: string) => {
    setNewCollegeSchoolId(schoolId);
    setInlineCollegeSchoolId(schoolId);
    setShowNewCollege(true);
  };

  const assignExistingCollege = async (schoolId: string) => {
    const selectedIds = existingCollegeBySchool[schoolId] || [];
    const selected = collages.filter((college) => selectedIds.includes(college.id));
    if (!selected.length) return;
    setAssigningExisting(`college:${schoolId}`);
    setError("");
    try {
      const results = await Promise.all(selected.map(async (college) => {
        const res = await apiFetch("/api/hostel-collages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: college.id, name: college.name, schoolId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to assign ${college.name}`);
        return data;
      }));
      setExistingCollegeBySchool((previous) => ({ ...previous, [schoolId]: [] }));
      showSuccess(`${results.length} college${results.length === 1 ? "" : "s"} added to the school`);
      await fetchCollages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign college");
    } finally {
      setAssigningExisting(null);
    }
  };

  const assignExistingHostel = async (collageId: string) => {
    const selectedIds = existingHostelByCollege[collageId] || [];
    const selected = hostels.filter((hostel) => selectedIds.includes(hostel.id));
    if (!selected.length) return;
    setAssigningExisting(`hostel:${collageId}`);
    setError("");
    try {
      const results = await Promise.all(selected.map(async (hostel) => {
        const res = await apiFetch("/api/hostels", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: hostel.id, name: hostel.name, collageId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to assign ${hostel.name}`);
        return data;
      }));
      setExistingHostelByCollege((previous) => ({ ...previous, [collageId]: [] }));
      showSuccess(`${results.length} hostel${results.length === 1 ? "" : "s"} added to the college`);
      await fetchHostels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign hostel");
    } finally {
      setAssigningExisting(null);
    }
  };

  const startGroupEdit = (kind: "school" | "college", id: string, name: string) => {
    setGroupEdit({ kind, id });
    setGroupEditName(name);
  };

  const cancelGroupEdit = () => {
    setGroupEdit(null);
    setGroupEditName("");
  };

  const saveGroupEdit = async () => {
    if (!groupEdit || !groupEditName.trim()) return;
    setGroupSaving(true);
    setError("");
    try {
      const isSchool = groupEdit.kind === "school";
      const currentCollege = isSchool ? null : collages.find((college) => college.id === groupEdit.id);
      const res = await apiFetch(isSchool ? "/api/hostel-schools" : "/api/hostel-collages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: groupEdit.id,
          name: groupEditName.trim(),
          ...(currentCollege?.schoolId ? { schoolId: currentCollege.schoolId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to update ${isSchool ? "school" : "college"}`);
      cancelGroupEdit();
      showSuccess(`${isSchool ? "School" : "College"} updated`);
      await Promise.all([fetchSchools(), fetchCollages()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group");
    } finally {
      setGroupSaving(false);
    }
  };

  const toggleGroup = async (kind: "school" | "college", id: string, isActive: boolean) => {
    const label = kind === "school" ? "school" : "college";
    if (isActive && !window.confirm(`Deactivate this ${label}? Its descendants will disappear from public selection.`)) return;
    setGroupToggling(`${kind}:${id}`);
    setError("");
    try {
      const res = await apiFetch(`/api/admin/hostel-${kind === "school" ? "schools" : "collages"}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [`${kind}Id`]: id, isActive: !isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to change ${label} status`);
      showSuccess(`${label[0].toUpperCase() + label.slice(1)} ${!isActive ? "reactivated" : "deactivated"}`);
      await Promise.all([fetchSchools(), fetchCollages(), fetchHostels()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to change ${label} status`);
    } finally {
      setGroupToggling(null);
    }
  };

  const deleteGroup = async (kind: "school" | "college", id: string, name: string) => {
    const label = kind === "school" ? "school" : "college";
    if (!window.confirm(`Delete ${label} "${name}"? It must have no descendants.`)) return;
    setError("");
    try {
      const res = await apiFetch(`/api/hostel-${kind === "school" ? "schools" : "collages"}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to delete ${label}`);
      showSuccess(`${label[0].toUpperCase() + label.slice(1)} deleted`);
      await Promise.all([fetchSchools(), fetchCollages()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${label}`);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  return (
    <ProtectedRoute module="hostels">
      <div className="min-h-screen bg-[#f5f5f7] text-slate-900">
        <header className="bg-white/80 backdrop-blur-2xl border-b border-slate-200/80 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Logo variant="dark" />
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-950">Hostel Management</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Places, groups and service availability</p>
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

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <section className="rounded-[30px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-6 sm:p-8 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-blue-200 font-semibold">Operations / Places</p>
                <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.04em] mt-3">Your hostel network.</h2>
                <p className="text-sm sm:text-base text-slate-300 mt-3 leading-relaxed">Build a clear School → College → Hostel structure, then manage service availability and access from one calm workspace.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 min-w-full lg:min-w-[570px]">
                {[
                  ["Schools", schools.length],
                  ["Colleges", collages.length],
                  ["Hostels", allowedHostels.length],
                  ["Active", activeHostels],
                  ["Grouped", groupedHostels],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white/10 border border-white/10 px-3 py-3 sm:px-4 sm:py-4 backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">{label}</p>
                    <p className="text-2xl sm:text-3xl font-semibold mt-2">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
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

          {/* School → College overview */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-semibold text-apple-gray-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-500" />
                  School &amp; College Groups
                </h2>
                <p className="text-sm text-apple-gray-500 mt-1">
                  Organize your hostels as <strong>School → College → Hostel</strong>.
                  Existing colleges without a school remain supported.
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewSchool((shown) => !shown)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl"
                  >
                    <Plus className="w-4 h-4" /> New School
                  </button>
                  <button
                    type="button"
                    onClick={() => { setInlineCollegeSchoolId(null); setShowNewCollege((shown) => !shown); }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl"
                  >
                    <Plus className="w-4 h-4" /> New College
                  </button>
                </div>
              )}
            </div>

            {showNewSchool && canEdit && (
              <div className="flex flex-col sm:flex-row gap-2 mb-5 p-3 rounded-2xl bg-blue-50 border border-blue-100">
                <input
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  placeholder="School name"
                  className="flex-1 px-3 py-2 border border-blue-200 rounded-xl text-sm text-apple-gray-900 bg-white"
                />
                <button
                  type="button"
                  onClick={handleCreateSchool}
                  disabled={creatingSchool || !newSchoolName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {creatingSchool ? "Creating…" : "Create School"}
                </button>
              </div>
            )}

            {showNewCollege && inlineCollegeSchoolId === null && canEdit && (
              <div className="flex flex-col sm:flex-row gap-2 mb-5 p-3 rounded-2xl bg-purple-50 border border-purple-100">
                <select
                  value={newCollegeSchoolId}
                  onChange={(e) => setNewCollegeSchoolId(e.target.value)}
                  className="sm:w-56 px-3 py-2 border border-purple-200 rounded-xl text-sm text-apple-gray-900 bg-white"
                >
                  <option value="">No school (legacy college)</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
                <input
                  value={newCollegeName}
                  onChange={(e) => setNewCollegeName(e.target.value)}
                  placeholder="College name"
                  className="flex-1 px-3 py-2 border border-purple-200 rounded-xl text-sm text-apple-gray-900 bg-white"
                />
                <button
                  type="button"
                  onClick={handleCreateCollege}
                  disabled={creatingCollege || !newCollegeName.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {creatingCollege ? "Creating…" : "Create College"}
                </button>
              </div>
            )}

            {schools.length === 0 && collages.filter((college) => !college.schoolId).length === 0 ? (
              <p className="text-sm text-apple-gray-500 py-3">No school or college groups have been created yet.</p>
            ) : (
              <div className="space-y-2">
                {schools.map((school) => {
                  const schoolColleges = collages.filter((college) => college.schoolId === school.id);
                  const schoolHostelCount = hostels.filter((hostel) =>
                    schoolColleges.some((college) => college.id === hostel.collageId),
                  ).length;
                  return (
                    <div key={school.id} className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className={`font-semibold ${school.isActive === false ? "text-slate-400 line-through" : "text-apple-gray-900"}`}>{school.name}</span>
                          {school.isActive === false && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Inactive</span>}
                          <span className="ml-2 text-xs text-apple-gray-500">{schoolColleges.length} colleges · {schoolHostelCount} hostels</span>
                        </div>
                        {canEdit && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openCollegeForSchool(school.id)}
                              disabled={school.isActive === false}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add College
                            </button>
                            <button type="button" onClick={() => startGroupEdit("school", school.id, school.name)} className="rounded-xl bg-white p-2 text-slate-500 hover:bg-slate-100" title="Edit school"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => toggleGroup("school", school.id, school.isActive !== false)} disabled={groupToggling === `school:${school.id}`} className="rounded-xl bg-white p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50" title={school.isActive === false ? "Reactivate school" : "Deactivate school"}>{school.isActive === false ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}</button>
                            <button type="button" onClick={() => deleteGroup("school", school.id, school.name)} className="rounded-xl bg-white p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Delete school"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </div>
                      {groupEdit?.kind === "school" && groupEdit.id === school.id && canEdit && (
                        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-blue-200 bg-white p-3 sm:flex-row">
                          <input autoFocus value={groupEditName} onChange={(e) => setGroupEditName(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
                          <button type="button" onClick={saveGroupEdit} disabled={groupSaving || !groupEditName.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{groupSaving ? "Saving…" : "Save"}</button>
                          <button type="button" onClick={cancelGroupEdit} className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">Cancel</button>
                        </div>
                      )}
                      {canEdit && school.isActive !== false && collages.some((college) => college.schoolId !== school.id) && (
                        <div className="mt-3">
                          <button type="button" onClick={() => setOpenCollegePicker((previous) => ({ ...previous, [school.id]: !previous[school.id] }))} className="flex w-full items-center justify-between rounded-2xl border border-purple-100 bg-white/70 px-4 py-3 text-left shadow-sm backdrop-blur-xl transition hover:border-purple-200 hover:bg-white">
                            <span><span className="block text-sm font-semibold text-slate-900">Assign existing colleges</span><span className="block text-xs text-slate-500">{existingCollegeBySchool[school.id]?.length || 0} selected · choose from your existing colleges</span></span>
                            <ChevronDown className={`h-5 w-5 text-purple-600 transition-transform ${openCollegePicker[school.id] ? "rotate-180" : ""}`} />
                          </button>
                          {openCollegePicker[school.id] && <div className="mt-2 rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-[0_8px_30px_rgba(88,28,135,0.08)] backdrop-blur-xl">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div><p className="text-sm font-semibold text-slate-900">Add existing colleges</p><p className="text-xs text-slate-500">Select one or more colleges to move into this school.</p></div>
                            <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">{existingCollegeBySchool[school.id]?.length || 0} selected</span>
                          </div>
                          <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
                            {collages.filter((college) => college.schoolId !== school.id).map((college) => {
                              const selected = (existingCollegeBySchool[school.id] || []).includes(college.id);
                              return <button type="button" key={college.id} onClick={() => setExistingCollegeBySchool((previous) => ({ ...previous, [school.id]: selected ? (previous[school.id] || []).filter((id) => id !== college.id) : [...(previous[school.id] || []), college.id] }))} className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${selected ? "border-purple-300 bg-gradient-to-br from-purple-50 to-white shadow-sm" : "border-slate-200/80 bg-white/60 hover:border-purple-200 hover:bg-white"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${selected ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300 bg-white text-transparent group-hover:border-purple-300"}`}>✓</span><span className="min-w-0 flex-1"><span className={`block truncate text-sm font-semibold ${selected ? "text-purple-900" : "text-slate-700"}`}>{college.name}</span><span className="block text-[11px] text-slate-400">{college.schoolId ? "Currently in another school" : "Unassigned"}</span></span></button>;
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => assignExistingCollege(school.id)}
                            disabled={!existingCollegeBySchool[school.id]?.length || assigningExisting === `college:${school.id}`}
                            className="mt-3 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {assigningExisting === `college:${school.id}` ? "Adding colleges…" : `Add ${existingCollegeBySchool[school.id]?.length || "selected colleges"}`}
                          </button>
                          </div>}
                        </div>
                      )}
                      {inlineCollegeSchoolId === school.id && showNewCollege && canEdit && (
                        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-purple-200 bg-white p-3 sm:flex-row">
                          <input
                            autoFocus
                            value={newCollegeName}
                            onChange={(e) => setNewCollegeName(e.target.value)}
                            placeholder={`College under ${school.name}`}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                          />
                          <button
                            type="button"
                            onClick={handleCreateCollege}
                            disabled={creatingCollege || !newCollegeName.trim()}
                            className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {creatingCollege ? "Adding…" : "Add College"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setInlineCollegeSchoolId(null); setNewCollegeName(""); }}
                            className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {schoolColleges.length === 0 ? (
                          <span className="text-xs text-apple-gray-500">No colleges assigned yet</span>
                        ) : schoolColleges.map((college) => (
                          <div key={college.id} className={`w-full rounded-2xl border bg-white p-3 ${college.isActive === false ? "border-slate-200 opacity-60" : "border-purple-100"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className={`text-sm font-semibold ${college.isActive === false ? "text-slate-400 line-through" : "text-purple-900"}`}>{college.name}</span>
                                {college.isActive === false && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Inactive</span>}
                                <span className="ml-2 text-xs text-slate-500">{hostels.filter((hostel) => hostel.collageId === college.id).length} hostels</span>
                              </div>
                              {canEdit && <div className="flex items-center gap-1">
                                <button type="button" onClick={() => startGroupEdit("college", college.id, college.name)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit college"><Pencil className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => toggleGroup("college", college.id, college.isActive !== false)} disabled={groupToggling === `college:${college.id}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50" title={college.isActive === false ? "Reactivate college" : "Deactivate college"}>{college.isActive === false ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}</button>
                                <button type="button" onClick={() => deleteGroup("college", college.id, college.name)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700" title="Delete college"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>}
                            </div>
                            {groupEdit?.kind === "college" && groupEdit.id === college.id && canEdit && (
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input autoFocus value={groupEditName} onChange={(e) => setGroupEditName(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
                                <button type="button" onClick={saveGroupEdit} disabled={groupSaving || !groupEditName.trim()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{groupSaving ? "Saving…" : "Save"}</button>
                                <button type="button" onClick={cancelGroupEdit} className="rounded-xl px-2 py-2 text-xs text-slate-500 hover:bg-slate-100">Cancel</button>
                              </div>
                            )}
                            {canEdit && college.isActive !== false && hostels.some((hostel) => hostel.collageId !== college.id) && (
                              <div className="mt-3">
                                <button type="button" onClick={() => setOpenHostelPicker((previous) => ({ ...previous, [college.id]: !previous[college.id] }))} className="flex w-full items-center justify-between rounded-2xl border border-blue-100 bg-slate-50/80 px-4 py-3 text-left shadow-sm backdrop-blur-xl transition hover:border-blue-200 hover:bg-white">
                                  <span><span className="block text-sm font-semibold text-slate-900">Assign existing hostels</span><span className="block text-xs text-slate-500">{existingHostelByCollege[college.id]?.length || 0} selected · choose from your existing hostels</span></span>
                                  <ChevronDown className={`h-5 w-5 text-blue-600 transition-transform ${openHostelPicker[college.id] ? "rotate-180" : ""}`} />
                                </button>
                                {openHostelPicker[college.id] && <div className="mt-2 rounded-[24px] border border-white/80 bg-slate-50/80 p-4 shadow-[0_8px_30px_rgba(37,99,235,0.08)] backdrop-blur-xl">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div><p className="text-sm font-semibold text-slate-900">Add existing hostels</p><p className="text-xs text-slate-500">Select one or more hostels to move into this college.</p></div>
                                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">{existingHostelByCollege[college.id]?.length || 0} selected</span>
                                </div>
                                <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
                                  {hostels.filter((hostel) => hostel.collageId !== college.id).map((hostel) => {
                                    const selected = (existingHostelByCollege[college.id] || []).includes(hostel.id);
                                    return <button type="button" key={hostel.id} onClick={() => setExistingHostelByCollege((previous) => ({ ...previous, [college.id]: selected ? (previous[college.id] || []).filter((id) => id !== hostel.id) : [...(previous[college.id] || []), hostel.id] }))} className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${selected ? "border-blue-300 bg-gradient-to-br from-blue-50 to-white shadow-sm" : "border-slate-200/80 bg-white/60 hover:border-blue-200 hover:bg-white"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent group-hover:border-blue-300"}`}>✓</span><span className="min-w-0 flex-1"><span className={`block truncate text-sm font-semibold ${selected ? "text-blue-900" : "text-slate-700"}`}>{hostel.name}</span><span className="block text-[11px] text-slate-400">{hostel.collageId ? "Currently in another college" : "Unassigned"}</span></span></button>;
                                  })}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => assignExistingHostel(college.id)}
                                  disabled={!existingHostelByCollege[college.id]?.length || assigningExisting === `hostel:${college.id}`}
                                  className="mt-3 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {assigningExisting === `hostel:${college.id}` ? "Adding hostels…" : `Add ${existingHostelByCollege[college.id]?.length || "selected hostels"}`}
                                </button>
                                </div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {collages.filter((college) => !college.schoolId).length > 0 && (
                  <div className="rounded-2xl border border-apple-gray-200 p-4">
                    <span className="font-semibold text-apple-gray-900">Legacy colleges</span>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {collages.filter((college) => !college.schoolId).map((college) => (
                        <div key={college.id} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div><span className="text-sm font-semibold text-slate-700">{college.name}</span><span className="ml-2 text-xs text-slate-500">{hostels.filter((hostel) => hostel.collageId === college.id).length} hostels</span></div>
                            {canEdit && <div className="flex items-center gap-1">
                              <button type="button" onClick={() => startGroupEdit("college", college.id, college.name)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => toggleGroup("college", college.id, college.isActive !== false)} disabled={groupToggling === `college:${college.id}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700">{college.isActive === false ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}</button>
                              <button type="button" onClick={() => deleteGroup("college", college.id, college.name)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>}
                          </div>
                          {groupEdit?.kind === "college" && groupEdit.id === college.id && canEdit && <div className="mt-2 flex gap-2"><input autoFocus value={groupEditName} onChange={(e) => setGroupEditName(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" /><button type="button" onClick={saveGroupEdit} disabled={groupSaving || !groupEditName.trim()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save</button><button type="button" onClick={cancelGroupEdit} className="rounded-xl px-2 py-2 text-xs text-slate-500">Cancel</button></div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
                      College (optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={newCollageId}
                        onChange={(e) => setNewCollageId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 text-sm"
                      >
                        <option value="">No college</option>
                        {schools.map((school) => (
                          <optgroup key={school.id} label={school.name}>
                            {collages.filter((c) => c.schoolId === school.id).map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </optgroup>
                        ))}
                        <optgroup label="Legacy colleges">
                          {collages.filter((c) => !c.schoolId).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCollage(!showNewCollage)}
                        className="px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                      >
                        + New College
                      </button>
                    </div>
                  </div>
                </div>
                {showNewCollage && (
                  <div className="flex gap-2 items-center">
                    <select
                      value={newSchoolId}
                      onChange={(e) => setNewSchoolId(e.target.value)}
                      className="w-44 px-3 py-2 border border-apple-gray-200 rounded-xl text-apple-gray-900 text-sm"
                    >
                      <option value="">No school</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>{school.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newCollageName}
                      onChange={(e) => setNewCollageName(e.target.value)}
                      placeholder="College name"
                      className="flex-1 px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCollage}
                      disabled={creatingCollage || !newCollageName.trim()}
                      className="px-4 py-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-all"
                    >
                        {creatingCollage ? "Creating…" : "Create College"}
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewSchool(!showNewSchool)}
                    className="text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl px-3 py-2"
                  >
                    + New school
                  </button>
                  {showNewSchool && (
                    <>
                      <input
                        value={newSchoolName}
                        onChange={(e) => setNewSchoolName(e.target.value)}
                        placeholder="School name"
                        className="flex-1 px-3 py-2 border border-apple-gray-200 rounded-xl text-apple-gray-900 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleCreateSchool}
                        disabled={creatingSchool || !newSchoolName.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm disabled:opacity-50"
                      >
                        {creatingSchool ? "Creating…" : "Create"}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Hostel list */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold">Inventory</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 mt-1">Hostels</h2>
                <p className="text-sm text-slate-500 mt-1">Manage access, grouping and service availability.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:min-w-[430px]">
                <input
                  value={hostelSearch}
                  onChange={(e) => setHostelSearch(e.target.value)}
                  placeholder="Search hostels…"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <select
                  value={hostelGroupFilter}
                  onChange={(e) => setHostelGroupFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400"
                >
                  <option value="all">All groups</option>
                  <option value="ungrouped">Ungrouped</option>
                  {collages.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{visibleHostels.length} shown</span>
              <span>of {allowedHostels.length} hostels</span>
            </div>

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
            ) : visibleHostels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No hostels match this search or group.</div>
            ) : (
              <ul className="divide-y divide-apple-gray-100">
                {visibleHostels.map((hostel) => (
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
                              College
                            </label>
                            <select
                              value={editCollageId}
                              onChange={(e) => setEditCollageId(e.target.value)}
                              className="w-full px-3 py-2 border border-apple-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-apple-gray-900 text-sm"
                            >
                              <option value="">No college</option>
                              {schools.map((school) => (
                                <optgroup key={school.id} label={school.name}>
                                  {collages.filter((c) => c.schoolId === school.id).map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </optgroup>
                              ))}
                              <optgroup label="Legacy colleges">
                                {collages.filter((c) => !c.schoolId).map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </optgroup>
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
                          <span className="text-apple-gray-900 font-medium">
                            {hostel.name}
                          </span>
                          {hostel.isActive === false && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <PowerOff className="w-3 h-3" />
                              Inactive
                            </span>
                          )}
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
                              onClick={() => handleToggleActive(hostel)}
                              disabled={togglingId === hostel.id}
                              className={`p-2 rounded-xl transition-colors disabled:opacity-50 ${
                                hostel.isActive === false
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : "bg-apple-gray-100 text-apple-gray-600 hover:bg-red-100 hover:text-red-600"
                              }`}
                              title={
                                hostel.isActive === false
                                  ? "Turn back on — restores sales and any TV access still in date"
                                  : "Turn off — stops all sales here and revokes TV access immediately"
                              }
                            >
                              {hostel.isActive === false ? (
                                <Power className="w-4 h-4" />
                              ) : (
                                <PowerOff className="w-4 h-4" />
                              )}
                            </button>
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
        </main>
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
