"use client";
import { adminFetch } from "@/lib/apiClient";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import ConfirmationModal from "@/components/ConfirmationModal";
import { AdminPage, EmptyState, GLASS_INPUT, GLASS_INPUT_ICON, IconButton, Panel } from "@/components/admin/ui";
import {
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
  ShieldOff,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type {
  AdminModule,
  AdminPermission,
  ModulePermission,
  PartnerSplitMode,
} from "@/types";
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
  partnerSplitMode: PartnerSplitMode;
  partnerHostelSplits: Record<string, number>;
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
  partnerSplitMode: PartnerSplitMode;
  // Per-hostel split %, keyed by hostel ID. "" while an input is being cleared.
  partnerHostelSplits: Record<string, number | "">;
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
  partnerSplitMode: "whole",
  partnerHostelSplits: {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ModulePermissionBadge({ mp }: { mp: ModulePermission }) {
  const meta = ALL_MODULES.find((m) => m.id === mp.module);
  const badge = PERMISSION_BADGE[mp.permission];
  return (
    <span className='inline-flex items-center gap-1 rounded-full border border-white/85 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700'>
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

  // Ends every admin's sessions on every device, this one included: for
  // example after the superadmin password changed, or a lost phone.
  const signEveryoneOut = async () => {
    if (!window.confirm("Sign every admin out on every device, including you?")) return;
    const res = await adminFetch("/api/admin/sessions/end-all", { method: "POST" });
    if (res.ok) handleLogout();
  };

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await adminFetch("/api/admin/admins");
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
      const res = await adminFetch("/api/hostels");
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
      partnerSplitMode: admin.partnerSplitMode ?? "whole",
      partnerHostelSplits: { ...(admin.partnerHostelSplits ?? {}) },
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
    if (form.isPartner) {
      if (
        typeof form.partnerSplitPercent !== "number" ||
        form.partnerSplitPercent < 0 ||
        form.partnerSplitPercent > 100
      ) {
        setFormError("Partner split must be between 0 and 100.");
        return;
      }
      if (form.partnerSplitMode === "perHostel") {
        if (form.hostels.length === 0) {
          setFormError(
            "Per-hostel splits need specific hostels — select the partner's hostels first.",
          );
          return;
        }
        for (const hostelId of form.hostels) {
          // Untouched hostels inherit the whole split % (already validated above).
          const pct = form.partnerHostelSplits[hostelId] ?? form.partnerSplitPercent;
          if (typeof pct !== "number" || pct < 0 || pct > 100) {
            setFormError("Each hostel split must be between 0 and 100.");
            return;
          }
        }
      }
    }

    // Partner fields shared by create + edit. In per-hostel mode we send one
    // percentage per selected hostel (untouched ones inherit the whole %);
    // otherwise the map stays empty.
    const partnerHostelSplits: Record<string, number> = {};
    if (form.isPartner && form.partnerSplitMode === "perHostel") {
      for (const hostelId of form.hostels) {
        partnerHostelSplits[hostelId] =
          Number(form.partnerHostelSplits[hostelId] ?? form.partnerSplitPercent) || 0;
      }
    }
    const partnerFields = {
      isPartner: form.isPartner,
      partnerSplitPercent: form.isPartner ? form.partnerSplitPercent : 0,
      partnerSplitMode: form.isPartner ? form.partnerSplitMode : "whole",
      partnerHostelSplits,
    };

    setSubmitting(true);

    if (editingAdmin) {
      const body: Record<string, unknown> = {
        email: form.email,
        whatsappPhone: form.whatsappPhone,
        modulePermissions,
        hostels: form.hostels,
        ...partnerFields,
      };
      if (form.password) body.password = form.password;

      try {
        const res = await adminFetch(`/api/admin/admins/${editingAdmin.id}`, {
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
        const res = await adminFetch("/api/admin/admins", {
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
            ...partnerFields,
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
      const res = await adminFetch(`/api/admin/admins/${admin.id}`, {
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
      const res = await adminFetch(`/api/admin/admins/${deleteTarget.id}`, {
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
    <ProtectedRoute requireSuperAdmin>
      <AdminPage
        eyebrow='ADMINS'
        title='Admin Management'
        subtitle='Add admins, assign roles and permissions'
        actions={
          <>
            <button onClick={openAdd} className='glass-primary'>
              <Plus className='w-4 h-4' />
              Add Admin
            </button>
            <button onClick={signEveryoneOut} className='glass-button text-rose-600'>
              <ShieldOff className='w-4 h-4' />
              Sign everyone out
            </button>
          </>
        }>
        {/* Super Admin notice */}
        <section className='glass-panel'>
          <div className='flex items-start gap-4'>
            <div className='w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm'>
              <ShieldCheck className='w-5 h-5 text-white' />
            </div>
            <div className='min-w-0'>
              <p className='font-semibold text-slate-900 break-words'>
                Super Admin: {adminProfile?.username ?? "—"}
              </p>
              <p className='text-sm text-slate-500 mt-0.5'>
                The super admin has unrestricted access to all sections and
                cannot be managed here. Sub-admins below are stored in
                Firestore and can be enabled, disabled, or removed at any
                time.
              </p>
            </div>
          </div>
        </section>

        {/* Admin list */}
        <Panel
          flush
          title={
            <span className='flex items-center gap-2'>
              <Users className='w-5 h-5 text-blue-500' />
              Sub-Admins
              {!loading && <span className='slate-chip text-xs'>{admins.length}</span>}
            </span>
          }
          actions={
            <button onClick={openAdd} className='glass-button text-blue-600'>
              <Plus className='w-4 h-4' />
              New
            </button>
          }>
          {loading ? (
            <div className='flex items-center justify-center py-16 gap-3 text-slate-500'>
              <Loader2 className='w-5 h-5 animate-spin' />
              <span className='text-sm'>Loading admins…</span>
            </div>
          ) : loadError ? (
            <div className='py-12 px-4 text-center'>
              <AlertCircle className='w-8 h-8 text-rose-400 mx-auto mb-2' />
              <p className='text-rose-600 text-sm break-words'>{loadError}</p>
            </div>
          ) : admins.length === 0 ? (
            <EmptyState
              icon={
                <div className='w-16 h-16 bg-white/70 rounded-full flex items-center justify-center'>
                  <ShieldCheck className='w-8 h-8 text-slate-400' />
                </div>
              }
              title='No sub-admins yet'>
              Click &quot;Add Admin&quot; to create the first one.
            </EmptyState>
          ) : (
            <div className='divide-y divide-slate-200/60 border-t border-slate-200/60'>
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className={`px-4 py-5 transition sm:px-7 ${admin.isActive ? "" : "bg-slate-100/50"}`}>
                  <div className='flex flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4'>
                    {/* Avatar */}
                    <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0'>
                      {admin.username.slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className='flex-1 min-w-0'>
                      <div className='flex flex-wrap items-center gap-2 mb-1'>
                        <span
                          className={`min-w-0 break-all font-semibold text-slate-900 ${
                            !admin.isActive ? "opacity-50" : ""
                          }`}>
                          {admin.username}
                        </span>
                        {!admin.isActive && (
                          <span className='glass-red rounded-full px-2.5 py-1 text-xs font-semibold'>Disabled</span>
                        )}
                        {admin.isPartner && (
                          <span className='glass-purple rounded-full px-2.5 py-1 text-xs font-semibold'>
                            Partner ·{" "}
                            {admin.partnerSplitMode === "perHostel"
                              ? "per-hostel split"
                              : `${admin.partnerSplitPercent ?? 0}% split`}
                          </span>
                        )}
                      </div>

                      {admin.email && <p className='text-sm text-slate-500 mb-1 break-all'>{admin.email}</p>}

                      {admin.whatsappPhone && (
                        <p className='text-sm text-emerald-600 mb-2 flex items-center gap-1 break-all'>
                          <Phone className='w-3.5 h-3.5 shrink-0' />
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
                        <div className='flex flex-wrap items-center gap-1 mt-1'>
                          <span className='text-xs text-slate-400 mr-0.5'>Hostels:</span>
                          {admin.hostels.map((hId) => {
                            const h = availableHostels.find((ah) => ah.id === hId);
                            return (
                              <span key={hId} className='warning-chip inline-flex items-center gap-1 !py-0.5 text-xs'>
                                <Building2 className='w-3 h-3' />
                                {h?.name ?? hId}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {admin.hostels.length === 0 && (
                        <p className='text-xs text-slate-400 mt-1'>
                          <Building2 className='w-3 h-3 inline mr-0.5' />
                          All hostels
                        </p>
                      )}

                      {admin.createdBy && (
                        <p className='text-xs text-slate-400 mt-2 break-words'>
                          Created by {admin.createdBy}
                          {admin.createdAt ? ` · ${new Date(admin.createdAt).toLocaleDateString()}` : ""}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className='flex w-full items-center justify-end gap-2 sm:w-auto sm:flex-shrink-0'>
                      {/* Toggle active */}
                      <IconButton
                        label={admin.isActive ? "Disable admin" : "Enable admin"}
                        onClick={() => toggleActive(admin)}
                        tone={admin.isActive ? "success" : "default"}
                        className={admin.isActive ? "" : "!text-slate-400"}>
                        {admin.isActive ? <ToggleRight className='w-5 h-5' /> : <ToggleLeft className='w-5 h-5' />}
                      </IconButton>

                      {/* Edit */}
                      <IconButton label='Edit admin' onClick={() => openEdit(admin)} className='hover:!text-blue-600'>
                        <Pencil className='w-4 h-4' />
                      </IconButton>

                      {/* Delete */}
                      <IconButton label='Delete admin' onClick={() => setDeleteTarget(admin)} tone='danger'>
                        <Trash2 className='w-4 h-4' />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </AdminPage>

      {/* ─── Slide-in Panel (Add / Edit) ─────────────────────────────────── */}
      {panelOpen && (
        <div className='fixed inset-0 z-50 flex'>
          {/* Backdrop */}
          <div className='flex-1 bg-slate-900/30 backdrop-blur-sm' onClick={closePanel} />

          {/* Panel */}
          <div className='glass-drawer h-full w-full max-w-lg rounded-none border-y-0 border-r-0 sm:rounded-l-[32px]'>
            {/* Panel header */}
            <div className='sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/80 bg-white/80 px-4 py-4 backdrop-blur-xl sm:px-6'>
              <div className='min-w-0'>
                <h2 className='text-lg font-semibold text-slate-900'>
                  {editingAdmin ? "Edit Admin" : "Add New Admin"}
                </h2>
                <p className='text-sm text-slate-500 break-all'>
                  {editingAdmin ? `Editing @${editingAdmin.username}` : "Create a new sub-admin account"}
                </p>
              </div>
              <IconButton label='Close' onClick={closePanel}>
                <X className='w-5 h-5' />
              </IconButton>
            </div>

            <div className='flex-1 px-4 py-6 space-y-6 sm:px-6'>
              {/* Feedback */}
              {formError && (
                <div className='flex items-start gap-3 p-4 bg-rose-50/90 border border-rose-200 rounded-2xl'>
                  <AlertCircle className='w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5' />
                  <p className='text-sm text-rose-700 break-words'>{formError}</p>
                </div>
              )}
              {formSuccess && (
                <div className='flex items-start gap-3 p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl'>
                  <CheckCircle className='w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5' />
                  <p className='text-sm text-emerald-700'>{formSuccess}</p>
                </div>
              )}

              {/* Username */}
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-2'>
                  Username <span className='text-rose-500'>*</span>
                </label>
                <input
                  type='text'
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  disabled={!!editingAdmin}
                  placeholder='e.g. john_doe'
                  className={`${GLASS_INPUT} disabled:text-slate-500`}
                />
                {editingAdmin && (
                  <p className='text-xs text-slate-400 mt-1'>Username cannot be changed after creation.</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-2'>
                  Email <span className='text-slate-400 font-normal'>(optional)</span>
                </label>
                <input
                  type='email'
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder='admin@example.com'
                  className={GLASS_INPUT}
                />
              </div>

              {/* WhatsApp Phone */}
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-2'>
                  WhatsApp Phone{" "}
                  <span className='text-slate-400 font-normal'>
                    (optional — shown as support contact on hostel pages)
                  </span>
                </label>
                <div className='relative'>
                  <Phone className={`${GLASS_INPUT_ICON} !text-emerald-500`} />
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
                    className={`${GLASS_INPUT} pl-11 font-mono focus:border-emerald-400 focus:ring-emerald-100`}
                  />
                </div>
                <p className='text-xs text-slate-400 mt-1'>
                  Include country code without +. E.g. <span className='font-mono'>2348130437519</span>
                </p>
              </div>

              {/* Partner toggle */}
              <div>
                <div className='flex items-center justify-between gap-3'>
                  <div className='min-w-0'>
                    <label className='block text-sm font-medium text-slate-700 mb-0.5'>Partner Account</label>
                    <p className='text-xs text-slate-400'>
                      Gives this admin a read-only view of their transaction shares
                    </p>
                  </div>
                  <label className='relative inline-flex min-h-[40px] items-center cursor-pointer shrink-0'>
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
                      className={`w-11 h-6 rounded-full transition-colors ${form.isPartner ? "bg-purple-500" : "bg-slate-300"}`}
                    />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isPartner ? "left-6" : "left-1"}`}
                    />
                  </label>
                </div>
                {form.isPartner && (
                  <div className='mt-4 rounded-2xl border border-purple-200 bg-purple-50/80 p-4 space-y-4'>
                    {/* Split mode: one % for all hostels, or a % per hostel */}
                    <div>
                      <label className='block text-sm font-medium text-purple-900 mb-1.5'>Split Setup</label>
                      <div className='flex flex-wrap gap-1 rounded-2xl border border-purple-200 bg-white/80 p-1 text-xs font-semibold'>
                        <button
                          type='button'
                          onClick={() => setForm((p) => ({ ...p, partnerSplitMode: "whole" }))}
                          className={`min-h-[40px] flex-1 whitespace-nowrap rounded-xl px-3 py-2 transition-colors ${
                            form.partnerSplitMode === "whole" ? "bg-purple-500 text-white" : "text-purple-700"
                          }`}>
                          Same for all hostels
                        </button>
                        <button
                          type='button'
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              partnerSplitMode: "perHostel",
                            }))
                          }
                          className={`min-h-[40px] flex-1 whitespace-nowrap rounded-xl px-3 py-2 transition-colors ${
                            form.partnerSplitMode === "perHostel" ? "bg-purple-500 text-white" : "text-purple-700"
                          }`}>
                          Different per hostel
                        </button>
                      </div>
                    </div>

                    {form.partnerSplitMode === "whole" ? (
                      <div>
                        <label className='block text-sm font-medium text-purple-900 mb-1.5'>Partner Split (%)</label>
                        <div className='flex flex-wrap items-center gap-3'>
                          <input
                            type='number'
                            min='0'
                            max='100'
                            step='0.01'
                            value={form.partnerSplitPercent}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                partnerSplitPercent: e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                            className={`${GLASS_INPUT} w-28 font-semibold text-purple-900 focus:border-purple-300 focus:ring-purple-100`}
                            aria-label='Partner split percentage'
                          />
                          <p className='min-w-0 flex-1 text-xs text-purple-700'>
                            % of each transaction (from the full 100%)
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className='block text-sm font-medium text-purple-900 mb-1.5'>
                          Split per hostel (%)
                        </label>
                        {form.hostels.length === 0 ? (
                          <p className='text-xs text-purple-700'>
                            Select the partner&apos;s hostels below, then set a % for each here.
                          </p>
                        ) : (
                          <div className='space-y-2'>
                            {form.hostels.map((hostelId) => {
                              const hostel = availableHostels.find((h) => h.id === hostelId);
                              const value = form.partnerHostelSplits[hostelId] ?? form.partnerSplitPercent;
                              return (
                                <div key={hostelId} className='flex items-center justify-between gap-3'>
                                  <span className='min-w-0 text-sm text-purple-900 truncate'>
                                    {hostel?.name ?? hostelId}
                                  </span>
                                  <div className='flex items-center gap-1.5 shrink-0'>
                                    <input
                                      type='number'
                                      min='0'
                                      max='100'
                                      step='0.01'
                                      value={value}
                                      onChange={(e) =>
                                        setForm((p) => ({
                                          ...p,
                                          partnerHostelSplits: {
                                            ...p.partnerHostelSplits,
                                            [hostelId]: e.target.value === "" ? "" : Number(e.target.value),
                                          },
                                        }))
                                      }
                                      className={`${GLASS_INPUT} w-24 font-semibold text-purple-900 focus:border-purple-300 focus:ring-purple-100`}
                                      aria-label={`Split percentage for ${hostel?.name ?? hostelId}`}
                                    />
                                    <span className='text-xs text-purple-700'>%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <p className='mt-2 text-xs text-purple-700'>
                          Each hostel&apos;s % is taken from that hostel&apos;s full transaction amount.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Password */}
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-2'>
                  {editingAdmin ? "New Password" : "Password"}{" "}
                  {!editingAdmin && <span className='text-rose-500'>*</span>}
                  {editingAdmin && <span className='text-slate-400 font-normal'>(leave blank to keep current)</span>}
                </label>
                <div className='relative'>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder={editingAdmin ? "Enter new password…" : "Min. 6 characters"}
                    className={`${GLASS_INPUT} pr-12`}
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className='absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600'>
                    {showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                  </button>
                </div>
              </div>

              {/* ── Per-Module Permissions ───────────────────────────── */}
              <div>
                <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
                  <label className='text-sm font-medium text-slate-700'>
                    Module Permissions <span className='text-rose-500'>*</span>
                  </label>
                  <div className='flex gap-1'>
                    <button
                      type='button'
                      onClick={grantAllModules}
                      className='min-h-[40px] rounded-full px-3 text-xs font-medium text-blue-600 transition-colors hover:bg-white/70 hover:text-blue-800'>
                      Grant All
                    </button>
                    <button
                      type='button'
                      onClick={clearAllModules}
                      className='min-h-[40px] rounded-full px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600'>
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
                        className={`p-3.5 rounded-2xl border transition-all ${
                          current !== "none"
                            ? "border-blue-300 bg-blue-50/60"
                            : "border-white/85 bg-white/70"
                        }`}>
                        <div className='flex items-center gap-3 mb-2.5'>
                          <div
                            className={`w-7 h-7 rounded-lg bg-gradient-to-r ${mod.color} flex items-center justify-center flex-shrink-0`}>
                            <div className='text-white'>{mod.icon}</div>
                          </div>
                          <div className='min-w-0'>
                            <p className='text-sm font-semibold text-slate-900'>{mod.label}</p>
                            <p className='text-xs text-slate-400'>{mod.description}</p>
                          </div>
                        </div>
                        {/* Permission pill group */}
                        <div className='grid grid-cols-3 gap-1 rounded-full border border-white/80 bg-white/70 p-1 text-xs'>
                          {PERMISSION_LEVELS.map((pl) => (
                            <button
                              key={pl.id}
                              type='button'
                              onClick={() => setModulePerm(mod.id, pl.id)}
                              className={`min-h-[40px] rounded-full px-2 font-semibold transition-colors ${
                                current === pl.id
                                  ? pl.id === "none"
                                    ? "bg-slate-700 text-white"
                                    : pl.id === "read"
                                      ? "bg-slate-500 text-white"
                                      : "bg-blue-500 text-white"
                                  : "text-slate-600 hover:bg-white"
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
                <label className='block text-sm font-medium text-slate-700 mb-1'>Hostel Access</label>
                <p className='text-xs text-slate-400 mb-3'>
                  Leave all unchecked to grant access to <strong>all hostels</strong>. Select specific hostels to
                  restrict this admin.
                </p>
                {hostelsLoading ? (
                  <div className='flex items-center gap-2 text-slate-400 text-sm py-2'>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    Loading hostels…
                  </div>
                ) : availableHostels.length === 0 ? (
                  <p className='text-sm text-slate-400 italic'>No hostels found — add hostels first.</p>
                ) : (
                  <div className='space-y-2'>
                    {/* All-hostels shortcut pill */}
                    <button
                      type='button'
                      onClick={() => setForm((p) => ({ ...p, hostels: [] }))}
                      className={`w-full min-h-[44px] flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                        form.hostels.length === 0
                          ? "border-amber-400 bg-amber-50/90"
                          : "border-white/85 bg-white/70 hover:border-amber-200"
                      }`}>
                      <div className='w-6 h-6 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0'>
                        <Building2 className='w-3.5 h-3.5 text-white' />
                      </div>
                      <span
                        className={`min-w-0 text-sm font-semibold flex-1 ${
                          form.hostels.length === 0 ? "text-amber-900" : "text-slate-600"
                        }`}>
                        All Hostels (unrestricted)
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          form.hostels.length === 0 ? "border-amber-500 bg-amber-500" : "border-slate-300"
                        }`}>
                        {form.hostels.length === 0 && (
                          <svg className='w-3 h-3 text-white' viewBox='0 0 12 12' fill='none'>
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
                          className={`w-full min-h-[44px] flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                            selected
                              ? "border-amber-400 bg-amber-50/90"
                              : "border-white/85 bg-white/70 hover:border-amber-200"
                          }`}>
                          <div className='w-6 h-6 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0'>
                            <Building2 className='w-3.5 h-3.5 text-white' />
                          </div>
                          <span
                            className={`min-w-0 break-words text-sm font-semibold flex-1 ${
                              selected ? "text-amber-900" : "text-slate-900"
                            }`}>
                            {hostel.name}
                          </span>
                          <div
                            className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              selected ? "bg-amber-500 border-amber-500" : "border-slate-300"
                            }`}>
                            {selected && (
                              <svg className='w-3 h-3 text-white' viewBox='0 0 12 12' fill='none'>
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
            <div className='sticky bottom-0 flex gap-3 border-t border-white/80 bg-white/80 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6'>
              <button type='button' onClick={closePanel} className='glass-button flex-1'>
                Cancel
              </button>
              <button type='button' onClick={handleSubmit} disabled={submitting} className='glass-primary flex-1'>
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
    </ProtectedRoute>
  );
}
