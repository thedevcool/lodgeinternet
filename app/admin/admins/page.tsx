"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import ConfirmationModal from "@/components/ConfirmationModal";
import Logo from "@/components/Logo";
import {
  LogOut,
  ArrowLeft,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Tv,
  Receipt,
  BarChart3,
  Mail,
  DatabaseZap,
  Building2,
  X,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Users,
  Phone,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type { AdminModule, AdminPermission, ModulePermission } from "@/types";
import type { Hostel } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_MODULES: {
  id: AdminModule;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: "data-codes",
    label: "Data Codes",
    description: "Internet plans & access codes",
    icon: <KeyRound className='w-4 h-4' />,
    color: "from-blue-400 to-blue-600",
  },
  {
    id: "tv-users",
    label: "TV Users",
    description: "TV subscriptions management",
    icon: <Tv className='w-4 h-4' />,
    color: "from-blue-400 via-blue-500 to-purple-400",
  },
  {
    id: "purchase-logs",
    label: "Purchase Logs",
    description: "Customer purchase history",
    icon: <Receipt className='w-4 h-4' />,
    color: "from-green-500 to-green-600",
  },
  {
    id: "transactions",
    label: "Transactions",
    description: "Financial reports & audits",
    icon: <BarChart3 className='w-4 h-4' />,
    color: "from-blue-500 to-indigo-600",
  },
  {
    id: "emails",
    label: "Email Management",
    description: "Send newsletters & announcements",
    icon: <Mail className='w-4 h-4' />,
    color: "from-blue-500 to-purple-600",
  },
  {
    id: "migrations",
    label: "Migrations",
    description: "Run database migrations",
    icon: <DatabaseZap className='w-4 h-4' />,
    color: "from-violet-500 to-purple-600",
  },
  {
    id: "hostels",
    label: "Hostels",
    description: "Hostel management",
    icon: <Building2 className='w-4 h-4' />,
    color: "from-amber-400 to-orange-500",
  },
];

const PERMISSION_LEVELS: {
  id: AdminPermission | "none";
  label: string;
  short: string;
  color: string;
}[] = [
  { id: "none", label: "No Access", short: "None", color: "" },
  { id: "read", label: "Read Only", short: "Read", color: "bg-slate-500" },
  {
    id: "read-write",
    label: "Read & Write",
    short: "R+W",
    color: "bg-blue-500",
  },
];

const PERMISSION_BADGE: Record<
  AdminPermission,
  { label: string; cls: string }
> = {
  read: { label: "Read", cls: "bg-slate-100 text-slate-700" },
  write: { label: "Write", cls: "bg-amber-100 text-amber-700" },
  "read-write": { label: "R+W", cls: "bg-blue-100 text-blue-700" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminRow {
  id: string;
  username: string;
  email: string;
  whatsappPhone: string;
  role: string;
  modulePermissions: ModulePermission[];
  hostels: string[];
  isActive: boolean;
  isPartner: boolean;
  partnerSplitPercent: number;
  createdBy: string;
  createdAt: string | null;
}

type ModuleAccess = AdminPermission | "none";

interface FormState {
  username: string;
  email: string;
  whatsappPhone: string;
  password: string;
  modulePermissions: Record<AdminModule, ModuleAccess>;
  hostels: string[];
  isPartner: boolean;
  partnerSplitPercent: number | "";
}

const EMPTY_MODULE_PERMISSIONS = Object.fromEntries(
  ALL_MODULES.map((m) => [m.id, "none"]),
) as Record<AdminModule, ModuleAccess>;

const DEFAULT_FORM: FormState = {
  username: "",
  email: "",
  whatsappPhone: "",
  password: "",
  modulePermissions: { ...EMPTY_MODULE_PERMISSIONS },
  hostels: [],
  isPartner: false,
  partnerSplitPercent: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ModulePermissionBadge({ mp }: { mp: ModulePermission }) {
  const meta = ALL_MODULES.find((m) => m.id === mp.module);
  const badge = PERMISSION_BADGE[mp.permission];
  return (
    <span className='inline-flex items-center gap-1 px-2 py-0.5 bg-apple-gray-100 text-apple-gray-700 text-xs rounded-lg font-medium'>
      {meta?.icon}
      <span>{meta?.label ?? mp.module}</span>
      <span
        className={`ml-0.5 px-1.5 py-px rounded text-white text-[10px] font-semibold ${badge.cls.replace("bg-", "bg-").replace("text-", "")} ${badge.cls}`}>
        {badge.label}
      </span>
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminManagementPage() {
  const { logout, adminProfile } = useAuthStore();
  const router = useRouter();

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Available hostels for selection
  const [availableHostels, setAvailableHostels] = useState<Hostel[]>([]);
  const [hostelsLoading, setHostelsLoading] = useState(true);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminRow | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AdminRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/admin/admins");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load admins");
      setAdmins(data.admins ?? []);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHostels = useCallback(async () => {
    setHostelsLoading(true);
    try {
      const res = await apiFetch("/api/hostels");
      const data = await res.json();
      setAvailableHostels(data.hostels ?? []);
    } catch {
      // Non-critical — hostel selector just won't show
    } finally {
      setHostelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
    fetchHostels();
  }, [fetchAdmins, fetchHostels]);

  // ── Open panel ────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingAdmin(null);
    setForm(DEFAULT_FORM);
    setFormError("");
    setFormSuccess("");
    setShowPassword(false);
    setPanelOpen(true);
  };

  const openEdit = (admin: AdminRow) => {
    setEditingAdmin(admin);
    // Convert array → record
    const modulePermissions = { ...EMPTY_MODULE_PERMISSIONS };
    admin.modulePermissions.forEach((mp) => {
      modulePermissions[mp.module] = mp.permission;
    });
    setForm({
      username: admin.username,
      email: admin.email,
      whatsappPhone: admin.whatsappPhone ?? "",
      password: "",
      modulePermissions,
      hostels: [...admin.hostels],
      isPartner: admin.isPartner,
      partnerSplitPercent: admin.partnerSplitPercent ?? 0,
    });
    setFormError("");
    setFormSuccess("");
    setShowPassword(false);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingAdmin(null);
    setFormError("");
    setFormSuccess("");
  };

  // ── Module permission toggle ───────────────────────────────────────────────

  const setModulePerm = (mod: AdminModule, perm: ModuleAccess) => {
    setForm((prev) => ({
      ...prev,
      modulePermissions: { ...prev.modulePermissions, [mod]: perm },
    }));
  };

  const grantAllModules = () => {
    const all = Object.fromEntries(
      ALL_MODULES.map((m) => [m.id, "read-write"]),
    ) as Record<AdminModule, ModuleAccess>;
    setForm((prev) => ({ ...prev, modulePermissions: all }));
  };

  const clearAllModules = () => {
    setForm((prev) => ({
      ...prev,
      modulePermissions: { ...EMPTY_MODULE_PERMISSIONS },
    }));
  };

  // ── Hostel toggle ─────────────────────────────────────────────────────────

  const toggleHostel = (hostelId: string) => {
    setForm((prev) => ({
      ...prev,
      hostels: prev.hostels.includes(hostelId)
        ? prev.hostels.filter((h) => h !== hostelId)
        : [...prev.hostels, hostelId],
    }));
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setFormError("");
    setFormSuccess("");

    if (!form.username.trim()) {
      setFormError("Username is required.");
      return;
    }
    if (!editingAdmin && form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (editingAdmin && form.password && form.password.length < 6) {
      setFormError("New password must be at least 6 characters.");
      return;
    }

    // Convert record → array, excluding "none"
    const modulePermissions = ALL_MODULES.filter(
      (m) => form.modulePermissions[m.id] !== "none",
    ).map((m) => ({
      module: m.id,
      permission: form.modulePermissions[m.id] as AdminPermission,
    }));

    if (modulePermissions.length === 0) {
      setFormError("Grant at least one module permission.");
      return;
    }
    if (
      form.isPartner &&
      (typeof form.partnerSplitPercent !== "number" ||
        form.partnerSplitPercent < 0 ||
        form.partnerSplitPercent > 100)
    ) {
      setFormError("Partner split must be between 0 and 100.");
      return;
    }

    setSubmitting(true);

    if (editingAdmin) {
      const body: Record<string, unknown> = {
        email: form.email,
        whatsappPhone: form.whatsappPhone,
        modulePermissions,
        hostels: form.hostels,
        isPartner: form.isPartner,
        partnerSplitPercent: form.isPartner ? form.partnerSplitPercent : 0,
      };
      if (form.password) body.password = form.password;

      try {
        const res = await apiFetch(`/api/admin/admins/${editingAdmin.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update admin");
        setFormSuccess("Admin updated successfully.");
        fetchAdmins();
      } catch (err: any) {
        setFormError(err.message);
      } finally {
        setSubmitting(false);
      }
    } else {
      try {
        const res = await apiFetch("/api/admin/admins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username,
            email: form.email,
            whatsappPhone: form.whatsappPhone,
            password: form.password,
            modulePermissions,
            hostels: form.hostels,
            createdBy: adminProfile?.username ?? "super-admin",
            isPartner: form.isPartner,
            partnerSplitPercent: form.isPartner ? form.partnerSplitPercent : 0,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create admin");
        setFormSuccess("Admin created successfully.");
        setForm(DEFAULT_FORM);
        fetchAdmins();
      } catch (err: any) {
        setFormError(err.message);
      } finally {
        setSubmitting(false);
      }
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────

  const toggleActive = async (admin: AdminRow) => {
    try {
      const res = await apiFetch(`/api/admin/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !admin.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update");
      fetchAdmins();
    } catch {
      alert("Failed to update admin status.");
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/admins/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setDeleteTarget(null);
      fetchAdmins();
    } catch {
      alert("Failed to delete admin.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className='min-h-screen bg-apple-gray-50'>
        {/* Header */}
        <header className='bg-white shadow-sm sticky top-0 z-10'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-3'>
                <button
                  onClick={() => router.push("/admin/dashboard")}
                  className='p-2 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                  <ArrowLeft className='w-5 h-5 text-apple-gray-600' />
                </button>
                <Logo variant='dark' />
                <div>
                  <h1 className='text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-white-500 bg-clip-text text-transparent'>
                    Admin Management
                  </h1>
                  <p className='text-sm text-apple-gray-600'>
                    Add admins, assign roles and permissions
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <button
                  onClick={openAdd}
                  className='inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-md'>
                  <Plus className='w-4 h-4' />
                  Add Admin
                </button>
                <button
                  onClick={handleLogout}
                  className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                  <LogOut className='w-4 h-4' />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6'>
          {/* Super Admin notice */}
          <div className='bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-5 text-white'>
            <div className='flex items-start gap-4'>
              <div className='w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0'>
                <ShieldCheck className='w-5 h-5 text-white' />
              </div>
              <div>
                <p className='font-semibold'>
                  Super Admin: {adminProfile?.username ?? "—"}
                </p>
                <p className='text-sm text-white/80 mt-0.5'>
                  The super admin has unrestricted access to all sections and
                  cannot be managed here. Sub-admins below are stored in
                  Firestore and can be enabled, disabled, or removed at any
                  time.
                </p>
              </div>
            </div>
          </div>

          {/* Admin list */}
          <div className='bg-white rounded-2xl shadow-sm border border-apple-gray-200'>
            <div className='px-6 py-4 border-b border-apple-gray-200 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <Users className='w-5 h-5 text-blue-500' />
                <h2 className='text-lg font-semibold text-apple-gray-900'>
                  Sub-Admins
                </h2>
                {!loading && (
                  <span className='ml-1 px-2 py-0.5 bg-apple-gray-100 text-apple-gray-600 text-xs font-medium rounded-full'>
                    {admins.length}
                  </span>
                )}
              </div>
              <button
                onClick={openAdd}
                className='inline-flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors'>
                <Plus className='w-4 h-4' />
                New
              </button>
            </div>

            {loading ? (
              <div className='flex items-center justify-center py-16 gap-3 text-apple-gray-500'>
                <Loader2 className='w-5 h-5 animate-spin' />
                <span className='text-sm'>Loading admins…</span>
              </div>
            ) : loadError ? (
              <div className='py-12 text-center'>
                <AlertCircle className='w-8 h-8 text-red-400 mx-auto mb-2' />
                <p className='text-red-600 text-sm'>{loadError}</p>
              </div>
            ) : admins.length === 0 ? (
              <div className='py-16 text-center'>
                <div className='w-16 h-16 bg-apple-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                  <ShieldCheck className='w-8 h-8 text-apple-gray-400' />
                </div>
                <p className='text-apple-gray-600 font-medium'>
                  No sub-admins yet
                </p>
                <p className='text-apple-gray-400 text-sm mt-1'>
                  Click &quot;Add Admin&quot; to create the first one.
                </p>
              </div>
            ) : (
              <div className='divide-y divide-apple-gray-100'>
                {admins.map((admin) => (
                  <div
                    key={admin.id}
                    className={`px-6 py-5 transition-colors ${
                      admin.isActive ? "bg-white" : "bg-apple-gray-50"
                    }`}>
                    <div className='flex flex-col sm:flex-row sm:items-start gap-4'>
                      {/* Avatar */}
                      <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0'>
                        {admin.username.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className='flex-1 min-w-0'>
                        <div className='flex flex-wrap items-center gap-2 mb-1'>
                          <span
                            className={`font-semibold text-apple-gray-900 ${
                              !admin.isActive ? "opacity-50" : ""
                            }`}>
                            {admin.username}
                          </span>
                          {!admin.isActive && (
                            <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700'>
                              Disabled
                            </span>
                          )}
                          {admin.isPartner && (
                            <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700'>
                              Partner · {admin.partnerSplitPercent ?? 0}% net split
                            </span>
                          )}
                        </div>

                        {admin.email && (
                          <p className='text-sm text-apple-gray-500 mb-1'>
                            {admin.email}
                          </p>
                        )}

                        {admin.whatsappPhone && (
                          <p className='text-sm text-green-600 mb-2 flex items-center gap-1'>
                            <Phone className='w-3.5 h-3.5' />
                            wa.me/{admin.whatsappPhone}
                          </p>
                        )}

                        {/* Per-module permissions */}
                        <div className='flex flex-wrap gap-1.5 mb-1'>
                          {admin.modulePermissions.map((mp) => (
                            <ModulePermissionBadge key={mp.module} mp={mp} />
                          ))}
                        </div>

                        {/* Hostel restriction */}
                        {admin.hostels.length > 0 && (
                          <div className='flex flex-wrap gap-1 mt-1'>
                            <span className='text-xs text-apple-gray-400 mr-0.5'>
                              Hostels:
                            </span>
                            {admin.hostels.map((hId) => {
                              const h = availableHostels.find(
                                (ah) => ah.id === hId,
                              );
                              return (
                                <span
                                  key={hId}
                                  className='inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-lg font-medium border border-amber-200'>
                                  <Building2 className='w-3 h-3' />
                                  {h?.name ?? hId}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {admin.hostels.length === 0 && (
                          <p className='text-xs text-apple-gray-400 mt-1'>
                            <Building2 className='w-3 h-3 inline mr-0.5' />
                            All hostels
                          </p>
                        )}

                        {admin.createdBy && (
                          <p className='text-xs text-apple-gray-400 mt-2'>
                            Created by {admin.createdBy}
                            {admin.createdAt
                              ? ` · ${new Date(admin.createdAt).toLocaleDateString()}`
                              : ""}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className='flex items-center gap-2 flex-shrink-0'>
                        {/* Toggle active */}
                        <button
                          onClick={() => toggleActive(admin)}
                          title={
                            admin.isActive ? "Disable admin" : "Enable admin"
                          }
                          className={`p-2 rounded-lg transition-colors ${
                            admin.isActive
                              ? "text-green-600 hover:bg-green-50"
                              : "text-apple-gray-400 hover:bg-apple-gray-100"
                          }`}>
                          {admin.isActive ? (
                            <ToggleRight className='w-5 h-5' />
                          ) : (
                            <ToggleLeft className='w-5 h-5' />
                          )}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => openEdit(admin)}
                          title='Edit admin'
                          className='p-2 rounded-lg text-apple-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors'>
                          <Pencil className='w-4 h-4' />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteTarget(admin)}
                          title='Delete admin'
                          className='p-2 rounded-lg text-apple-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors'>
                          <Trash2 className='w-4 h-4' />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Slide-in Panel (Add / Edit) ─────────────────────────────────── */}
        {panelOpen && (
          <div className='fixed inset-0 z-50 flex'>
            {/* Backdrop */}
            <div
              className='flex-1 bg-black/40 backdrop-blur-sm'
              onClick={closePanel}
            />

            {/* Panel */}
            <div className='w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col'>
              {/* Panel header */}
              <div className='sticky top-0 bg-white border-b border-apple-gray-200 px-6 py-4 flex items-center justify-between z-10'>
                <div>
                  <h2 className='text-lg font-bold text-apple-gray-900'>
                    {editingAdmin ? "Edit Admin" : "Add New Admin"}
                  </h2>
                  <p className='text-sm text-apple-gray-500'>
                    {editingAdmin
                      ? `Editing @${editingAdmin.username}`
                      : "Create a new sub-admin account"}
                  </p>
                </div>
                <button
                  onClick={closePanel}
                  className='p-2 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                  <X className='w-5 h-5 text-apple-gray-600' />
                </button>
              </div>

              <div className='flex-1 px-6 py-6 space-y-6'>
                {/* Feedback */}
                {formError && (
                  <div className='flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl'>
                    <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-700'>{formError}</p>
                  </div>
                )}
                {formSuccess && (
                  <div className='flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl'>
                    <CheckCircle className='w-5 h-5 text-green-500 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-green-700'>{formSuccess}</p>
                  </div>
                )}

                {/* Username */}
                <div>
                  <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                    Username <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='text'
                    value={form.username}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, username: e.target.value }))
                    }
                    disabled={!!editingAdmin}
                    placeholder='e.g. john_doe'
                    className='w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-400 focus:outline-none text-sm disabled:bg-apple-gray-50 disabled:text-apple-gray-500'
                  />
                  {editingAdmin && (
                    <p className='text-xs text-apple-gray-400 mt-1'>
                      Username cannot be changed after creation.
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                    Email{" "}
                    <span className='text-apple-gray-400 font-normal'>
                      (optional)
                    </span>
                  </label>
                  <input
                    type='email'
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    placeholder='admin@example.com'
                    className='w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-400 focus:outline-none text-sm'
                  />
                </div>

                {/* WhatsApp Phone */}
                <div>
                  <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                    WhatsApp Phone{" "}
                    <span className='text-apple-gray-400 font-normal'>
                      (optional — shown as support contact on hostel pages)
                    </span>
                  </label>
                  <div className='relative'>
                    <Phone className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500' />
                    <input
                      type='tel'
                      value={form.whatsappPhone}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          whatsappPhone: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder='e.g. 2348012345678 (no + prefix)'
                      className='w-full pl-10 pr-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-green-400 focus:outline-none text-sm font-mono'
                    />
                  </div>
                  <p className='text-xs text-apple-gray-400 mt-1'>
                    Include country code without +. E.g.{" "}
                    <span className='font-mono'>2348130437519</span>
                  </p>
                </div>

                {/* Partner toggle */}
                <div>
                  <div className='flex items-center justify-between'>
                    <div>
                      <label className='block text-sm font-medium text-apple-gray-700 mb-0.5'>
                        Partner Account
                      </label>
                      <p className='text-xs text-apple-gray-400'>
                        Gives this admin a read-only view of their transaction shares
                      </p>
                    </div>
                    <label className='relative inline-flex items-center cursor-pointer shrink-0'>
                      <input
                        type='checkbox'
                        checked={form.isPartner}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            isPartner: e.target.checked,
                          }))
                        }
                        className='sr-only'
                      />
                      <div
                        className={`w-10 h-6 rounded-full transition-colors ${form.isPartner ? "bg-purple-500" : "bg-apple-gray-300"}`}
                      />
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isPartner ? "left-5" : "left-1"}`}
                      />
                    </label>
                  </div>
                  {form.isPartner && (
                    <div className='mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4'>
                      <label className='block text-sm font-medium text-purple-900 mb-1.5'>
                        Partner Split (%)
                      </label>
                      <div className='flex items-center gap-3'>
                        <input
                          type='number'
                          min='0'
                          max='100'
                          step='0.01'
                          value={form.partnerSplitPercent}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              partnerSplitPercent:
                                e.target.value === "" ? "" : Number(e.target.value),
                            }))
                          }
                          className='w-28 px-3 py-2 rounded-lg border border-purple-200 bg-white text-sm font-semibold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-300'
                          aria-label='Partner split percentage'
                        />
                        <p className='text-xs text-purple-700'>
                          Applied after the 10% maintenance and 1.5% Paystack deductions.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                    {editingAdmin ? "New Password" : "Password"}{" "}
                    {!editingAdmin && <span className='text-red-500'>*</span>}
                    {editingAdmin && (
                      <span className='text-apple-gray-400 font-normal'>
                        (leave blank to keep current)
                      </span>
                    )}
                  </label>
                  <div className='relative'>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, password: e.target.value }))
                      }
                      placeholder={
                        editingAdmin
                          ? "Enter new password…"
                          : "Min. 6 characters"
                      }
                      className='w-full pl-4 pr-12 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-400 focus:outline-none text-sm'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword((v) => !v)}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 hover:text-apple-gray-600 transition-colors'>
                      {showPassword ? (
                        <EyeOff className='w-4 h-4' />
                      ) : (
                        <Eye className='w-4 h-4' />
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Per-Module Permissions ───────────────────────────── */}
                <div>
                  <div className='flex items-center justify-between mb-3'>
                    <label className='text-sm font-medium text-apple-gray-700'>
                      Module Permissions <span className='text-red-500'>*</span>
                    </label>
                    <div className='flex gap-3'>
                      <button
                        type='button'
                        onClick={grantAllModules}
                        className='text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors'>
                        Grant All
                      </button>
                      <button
                        type='button'
                        onClick={clearAllModules}
                        className='text-xs font-medium text-apple-gray-400 hover:text-apple-gray-600 transition-colors'>
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className='space-y-2'>
                    {ALL_MODULES.map((mod) => {
                      const current = form.modulePermissions[mod.id];
                      return (
                        <div
                          key={mod.id}
                          className={`p-3.5 rounded-xl border-2 transition-all ${
                            current !== "none"
                              ? "border-blue-300 bg-blue-50/50"
                              : "border-apple-gray-200 bg-white"
                          }`}>
                          <div className='flex items-center gap-3 mb-2.5'>
                            <div
                              className={`w-7 h-7 rounded-lg bg-gradient-to-r ${mod.color} flex items-center justify-center flex-shrink-0`}>
                              <div className='text-white'>{mod.icon}</div>
                            </div>
                            <div>
                              <p className='text-sm font-semibold text-apple-gray-900'>
                                {mod.label}
                              </p>
                              <p className='text-xs text-apple-gray-400'>
                                {mod.description}
                              </p>
                            </div>
                          </div>
                          {/* Permission pill group */}
                          <div className='flex rounded-lg border border-apple-gray-200 overflow-hidden text-xs w-full'>
                            {PERMISSION_LEVELS.map((pl) => (
                              <button
                                key={pl.id}
                                type='button'
                                onClick={() => setModulePerm(mod.id, pl.id)}
                                className={`flex-1 py-1.5 font-semibold border-r last:border-r-0 border-apple-gray-200 transition-colors ${
                                  current === pl.id
                                    ? pl.id === "none"
                                      ? "bg-apple-gray-700 text-white"
                                      : pl.id === "read"
                                        ? "bg-slate-500 text-white"
                                        : "bg-blue-500 text-white"
                                    : "bg-white text-apple-gray-600 hover:bg-apple-gray-50"
                                }`}>
                                {pl.short}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Hostel Access ────────────────────────────────────── */}
                <div>
                  <label className='block text-sm font-medium text-apple-gray-700 mb-1'>
                    Hostel Access
                  </label>
                  <p className='text-xs text-apple-gray-400 mb-3'>
                    Leave all unchecked to grant access to{" "}
                    <strong>all hostels</strong>. Select specific hostels to
                    restrict this admin.
                  </p>
                  {hostelsLoading ? (
                    <div className='flex items-center gap-2 text-apple-gray-400 text-sm py-2'>
                      <Loader2 className='w-4 h-4 animate-spin' />
                      Loading hostels…
                    </div>
                  ) : availableHostels.length === 0 ? (
                    <p className='text-sm text-apple-gray-400 italic'>
                      No hostels found — add hostels first.
                    </p>
                  ) : (
                    <div className='space-y-2'>
                      {/* All-hostels shortcut pill */}
                      <button
                        type='button'
                        onClick={() => setForm((p) => ({ ...p, hostels: [] }))}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          form.hostels.length === 0
                            ? "border-amber-400 bg-amber-50"
                            : "border-apple-gray-200 hover:border-amber-200 bg-white"
                        }`}>
                        <div className='w-6 h-6 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0'>
                          <Building2 className='w-3.5 h-3.5 text-white' />
                        </div>
                        <span
                          className={`text-sm font-semibold flex-1 ${
                            form.hostels.length === 0
                              ? "text-amber-900"
                              : "text-apple-gray-600"
                          }`}>
                          All Hostels (unrestricted)
                        </span>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            form.hostels.length === 0
                              ? "border-amber-500 bg-amber-500"
                              : "border-apple-gray-300"
                          }`}>
                          {form.hostels.length === 0 && (
                            <svg
                              className='w-3 h-3 text-white'
                              viewBox='0 0 12 12'
                              fill='none'>
                              <path
                                d='M2 6l3 3 5-5'
                                stroke='currentColor'
                                strokeWidth={2}
                                strokeLinecap='round'
                                strokeLinejoin='round'
                              />
                            </svg>
                          )}
                        </div>
                      </button>

                      {availableHostels.map((hostel) => {
                        const selected = form.hostels.includes(hostel.id);
                        return (
                          <button
                            key={hostel.id}
                            type='button'
                            onClick={() => toggleHostel(hostel.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                              selected
                                ? "border-amber-400 bg-amber-50"
                                : "border-apple-gray-200 hover:border-amber-200 bg-white"
                            }`}>
                            <div className='w-6 h-6 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0'>
                              <Building2 className='w-3.5 h-3.5 text-white' />
                            </div>
                            <span
                              className={`text-sm font-semibold flex-1 ${
                                selected
                                  ? "text-amber-900"
                                  : "text-apple-gray-900"
                              }`}>
                              {hostel.name}
                            </span>
                            <div
                              className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                selected
                                  ? "bg-amber-500 border-amber-500"
                                  : "border-apple-gray-300"
                              }`}>
                              {selected && (
                                <svg
                                  className='w-3 h-3 text-white'
                                  viewBox='0 0 12 12'
                                  fill='none'>
                                  <path
                                    d='M2 6l3 3 5-5'
                                    stroke='currentColor'
                                    strokeWidth={2}
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Panel footer */}
              <div className='sticky bottom-0 bg-white border-t border-apple-gray-200 px-6 py-4 flex gap-3'>
                <button
                  type='button'
                  onClick={closePanel}
                  className='flex-1 py-3 rounded-xl border-2 border-apple-gray-200 text-apple-gray-700 font-semibold text-sm hover:bg-apple-gray-50 transition-colors'>
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleSubmit}
                  disabled={submitting}
                  className='flex-1 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold text-sm rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2'>
                  {submitting ? (
                    <>
                      <Loader2 className='w-4 h-4 animate-spin' />
                      {editingAdmin ? "Saving…" : "Creating…"}
                    </>
                  ) : editingAdmin ? (
                    "Save Changes"
                  ) : (
                    "Create Admin"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Delete Confirmation ─────────────────────────────────────────── */}
        <ConfirmationModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title={`Delete @${deleteTarget?.username ?? ""}?`}
          message='This admin account will be permanently removed and they will no longer be able to log in. This action cannot be undone.'
          confirmText={deleting ? "Deleting…" : "Delete Admin"}
          type='danger'
        />
      </div>
    </ProtectedRoute>
  );
}
