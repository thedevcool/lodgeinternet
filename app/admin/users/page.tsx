"use client";
import { adminFetch } from "@/lib/apiClient";

import { useEffect, useState, useCallback, useRef } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import WalletModal from "@/components/admin/WalletModal";
import { useAuthStore } from "@/store/authStore";
import {
  AdminPage,
  EmptyState,
  GLASS_INPUT,
  GLASS_INPUT_ICON,
  IconButton,
  Kpi,
  Modal,
  Panel,
  TabBar,
} from "@/components/admin/ui";
import {
  Search,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Building2,
  ShieldCheck,
  ShieldOff,
  X,
  History,
  ChevronDown,
  Tv,
  Wifi,
  Receipt,
  Mail,
  AlertTriangle,
  Trash2,
  Wallet,
} from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  hostelId: string;
  hostelSlug: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastActivityAt: string | null;
  /** Closed their account and asked to be erased (Refunds & deletions). */
  deletionRequested?: boolean;
}

interface Controller {
  id: string;
  name: string;
  memberHostels: string[];
}

type StatusFilter = "all" | "verified" | "unverified" | "disabled" | "deletion";

const STATUS_FILTERS: { value: StatusFilter; label: string; test: (u: UserRow) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "verified", label: "Verified", test: (u) => u.emailVerified && u.isActive },
  { value: "unverified", label: "Unverified", test: (u) => !u.emailVerified },
  { value: "disabled", label: "Disabled", test: (u) => !u.isActive && !u.deletionRequested },
  { value: "deletion", label: "Deletion requested", test: (u) => !!u.deletionRequested },
];

const NO_HOSTEL = "No hostel";

interface Purchase {
  id: string;
  type: "data" | "tv";
  planName: string;
  planType: string;
  price: number;
  paymentRef: string;
  hostel: string;
  status?: string;
  createdAt: string | null;
}

interface Hostel {
  id: string;
  name: string;
}

/**
 * Parse a payment ref like "AYONI-DEVICE-20260221-85376H"
 * Returns the hostel prefix and plan type segment.
 */
function parseRef(ref: string): {
  refHostel: string;
  refType: "TV" | "DEVICE" | "UNLIMITED" | "";
} {
  if (!ref) return { refHostel: "", refType: "" };
  const parts = ref.split("-");
  if (parts.length < 2) return { refHostel: "", refType: "" };
  const refHostel = parts[0].toUpperCase();
  const seg = parts[1].toUpperCase();
  const refType: "TV" | "DEVICE" | "UNLIMITED" | "" =
    seg === "TV"
      ? "TV"
      : seg === "DEVICE"
        ? "DEVICE"
        : seg === "UNLIMITED"
          ? "UNLIMITED"
          : "";
  return { refHostel, refType };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

function UserInitials({ name, email }: { name: string; email: string }) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : email.slice(0, 2).toUpperCase();
  return (
    <div className='w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0'>
      {initials}
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [selectedHostel, setSelectedHostel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    id: string;
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    user: UserRow;
    action: boolean;
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<UserRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tab: "all" | "needs-setup"
  const [userTab, setUserTab] = useState<"all" | "needs-setup">("all");

  // Reminder email state
  const [sendingReminder, setSendingReminder] = useState<string | null>(null); // userId or "bulk"
  const [reminderFeedback, setReminderFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Wallet modal (superadmin only: wallets are money)
  const isSuperAdmin = useAuthStore((s) => !!s.adminProfile?.isSuperAdmin);
  const [walletUser, setWalletUser] = useState<UserRow | null>(null);

  // Filters beyond search + hostel: controller (superadmin; others can't
  // list controllers) narrows the hostels, and a status chip narrows users.
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [selectedController, setSelectedController] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Cards open on demand, so a long list stays scannable.
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const toggleUser = (id: string) =>
    setExpandedUsers((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // History modal
  const [historyUser, setHistoryUser] = useState<UserRow | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "data" | "tv">(
    "all",
  );

  useEffect(() => {
    adminFetch("/api/hostels")
      .then((r) => r.json())
      .then((d) => setHostels(d.hostels || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    adminFetch("/api/admin/controllers")
      .then((r) => (r.ok ? r.json() : { controllers: [] }))
      .then((d) => setControllers(d.controllers || []))
      .catch(() => {});
  }, [isSuperAdmin]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedHostel) params.set("hostel", selectedHostel);
      if (search.trim()) params.set("search", search.trim());
      const res = await adminFetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, [selectedHostel, search]);

  useEffect(() => {
    loadUsers();
  }, [selectedHostel, loadUsers]);

  // Debounced search. Skips its own first run: the effect above already
  // loaded once on mount, and without this guard every page load fired the
  // same request twice, 350ms apart.
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true;
      return;
    }
    const t = setTimeout(() => loadUsers(), 350);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  const openHistory = async (user: UserRow) => {
    setHistoryUser(user);
    setPurchases([]);
    setHistoryFilter("all");
    setHistoryLoading(true);
    try {
      const res = await adminFetch(`/api/admin/users?history=${user.id}`);
      const data = await res.json();
      if (res.ok) setPurchases(data.purchases || []);
    } catch {
      // show empty
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggle = async (user: UserRow, newActive: boolean) => {
    if (!newActive) {
      setConfirmModal({ user, action: newActive });
      return;
    }
    await doToggle(user.id, newActive);
  };

  const doToggle = async (userId: string, isActive: boolean) => {
    setConfirmModal(null);
    setTogglingId(userId);
    setFeedback(null);
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isActive } : u)),
      );
      setFeedback({
        id: userId,
        type: "success",
        text: isActive ? "Account enabled" : "Account disabled",
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({
        id: userId,
        type: "error",
        text: err.message || "Failed to update",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    const user = deleteModal;
    setDeletingId(user.id);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setDeleteModal(null);
      setDeleteConfirmText("");

      const parts: string[] = [];
      if (data.tvSubscriptionsDeleted)
        parts.push(`${data.tvSubscriptionsDeleted} TV subscription${data.tvSubscriptionsDeleted === 1 ? "" : "s"}`);
      if (data.dataPurchasesDeleted)
        parts.push(`${data.dataPurchasesDeleted} data purchase${data.dataPurchasesDeleted === 1 ? "" : "s"}`);
      const detail = parts.length ? ` (${parts.join(", ")} removed)` : "";

      setFeedback({
        id: user.id,
        type: "success",
        text: `Deleted ${user.email}${detail}.`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setFeedback({
        id: user.id,
        type: "error",
        text: err.message || "Failed to delete user",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const sendReminder = async (userIds: string[] | "all") => {
    const key = userIds === "all" ? "bulk" : userIds[0];
    setSendingReminder(key);
    setReminderFeedback(null);
    try {
      const body = userIds === "all" ? {} : { userIds };
      const res = await adminFetch("/api/admin/send-registration-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setReminderFeedback({
        type: "success",
        text:
          userIds === "all"
            ? `Sent to ${data.sent} user${data.sent !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} failed)` : ""}.`
            : "Reminder sent.",
      });
    } catch (err: any) {
      setReminderFeedback({
        type: "error",
        text: err.message || "Failed to send reminder.",
      });
    } finally {
      setSendingReminder(null);
      setTimeout(() => setReminderFeedback(null), 5000);
    }
  };

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.isActive && u.emailVerified).length;
  const disabledUsers = users.filter((u) => !u.isActive).length;
  const unverifiedUsers = users.filter((u) => !u.emailVerified).length;
  const needsSetupUsers = users.filter(
    (u) => !u.hostelId || u.hostelId === "Unknown",
  );

  const controller = controllers.find((c) => c.id === selectedController);
  // The hostel menu offers only the chosen controller's hostels.
  const hostelOptions = controller ? hostels.filter((h) => controller.memberHostels.includes(h.name)) : hostels;
  const statusTest = STATUS_FILTERS.find((f) => f.value === statusFilter)?.test ?? (() => true);
  const inScope = (u: UserRow) => !controller || selectedHostel !== "" || controller.memberHostels.includes(u.hostelId);
  const scopedUsers = (userTab === "needs-setup" ? needsSetupUsers : users).filter(inScope);
  const listUsers = scopedUsers.filter(statusTest);

  // Grouped by hostel (alphabetical, "No hostel" last), each group newest first.
  const groups = Object.entries(
    listUsers.reduce<Record<string, UserRow[]>>((acc, u) => {
      const key = u.hostelId && u.hostelId !== "Unknown" ? u.hostelId : NO_HOSTEL;
      (acc[key] ||= []).push(u);
      return acc;
    }, {}),
  ).sort(([a], [b]) => (a === NO_HOSTEL ? 1 : b === NO_HOSTEL ? -1 : a.localeCompare(b)));

  return (
    <ProtectedRoute module='users'>
      <AdminPage
        eyebrow='USERS'
        title='User Management'
        actions={
          <IconButton label='Refresh' onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </IconButton>
        }>
        {/* Stats Row */}
        <div className='kpi-grid lg:!grid-cols-4 2xl:!grid-cols-4'>
          <Kpi label='Total Users' value={totalUsers} tone='blue' />
          <Kpi label='Active & Verified' value={activeUsers} tone='green' />
          <Kpi label='Unverified' value={unverifiedUsers} tone='orange' />
          <Kpi label='Disabled' value={disabledUsers} tone='red' />
        </div>

        {/* View Tabs */}
        <TabBar
          value={userTab}
          onChange={setUserTab}
          tabs={[
            { value: "all", label: "All Users" },
            {
              value: "needs-setup",
              label: "Needs Setup",
              icon: <AlertTriangle className='w-4 h-4' />,
              count: needsSetupUsers.length,
            },
          ]}
        />

        {/* Filters */}
        <Panel>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
            {/* Search */}
            <div className='relative min-w-0 flex-1'>
              <Search className={GLASS_INPUT_ICON} />
              <input
                type='text'
                placeholder='Search by name, email, phone or hostel…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${GLASS_INPUT} pl-11 pr-11`}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label='Clear search'
                  className='absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:text-slate-600'>
                  <X className='w-4 h-4' />
                </button>
              )}
            </div>

            {/* Controller → hostel (the hostel list narrows to the controller's). */}
            {userTab === "all" && (
              <div className='flex flex-col gap-3 sm:flex-row lg:shrink-0'>
                {isSuperAdmin && controllers.length > 0 && (
                  <select
                    aria-label='Controller'
                    value={selectedController}
                    onChange={(e) => {
                      setSelectedController(e.target.value);
                      setSelectedHostel("");
                    }}
                    className={`${GLASS_INPUT} sm:w-48`}>
                    <option value=''>All controllers</option>
                    {controllers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label='Hostel'
                  value={selectedHostel}
                  onChange={(e) => setSelectedHostel(e.target.value)}
                  className={`${GLASS_INPUT} sm:w-56`}>
                  <option value=''>{controller ? `All ${controller.name} hostels` : "All hostels"}</option>
                  {hostelOptions.map((h) => (
                    <option key={h.id} value={h.name}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Status chips, with how many each would show. */}
          <div className='ui-scroll-x -mx-4 mt-3 px-4 sm:mx-0 sm:overflow-visible sm:px-0'>
            <div className='flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap'>
              {STATUS_FILTERS.map((f) => {
                const count = scopedUsers.filter(f.test).length;
                if (f.value === "deletion" && count === 0) return null;
                return (
                  <button
                    key={f.value}
                    type='button'
                    onClick={() => setStatusFilter(f.value)}
                    className={`min-h-[36px] shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                      statusFilter === f.value
                        ? "bg-slate-900 text-white shadow-sm"
                        : "border border-white/80 bg-white/70 text-slate-600 hover:bg-white"
                    }`}>
                    {f.label} <span className='opacity-60'>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Needs Setup — bulk send banner */}
        {userTab === "needs-setup" && needsSetupUsers.length > 0 && (
          <div className='glass-alert justify-between'>
            <div className='flex min-w-0 flex-1 basis-64 items-start gap-3'>
              <AlertTriangle className='w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5' />
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-amber-800'>
                  {needsSetupUsers.length} user{needsSetupUsers.length !== 1 ? "s" : ""} without a hostel
                </p>
                <p className='text-xs text-amber-700 mt-0.5'>
                  Send them a registration reminder with a link to complete their setup.
                </p>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              {reminderFeedback && (
                <span className={`text-xs font-medium ${reminderFeedback.type === "success" ? "text-emerald-700" : "text-rose-600"}`}>
                  {reminderFeedback.text}
                </span>
              )}
              <button
                onClick={() => sendReminder("all")}
                disabled={sendingReminder === "bulk"}
                className='inline-flex min-h-[40px] items-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(245,158,11,.25)] transition hover:bg-amber-600 disabled:opacity-50'>
                {sendingReminder === "bulk" ? (
                  <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                ) : (
                  <Mail className='w-4 h-4' />
                )}
                Send to All
              </button>
            </div>
          </div>
        )}

        {/* User List */}
        <Panel flush>
          {loading ? (
            <div className='flex items-center justify-center py-20 gap-3 text-slate-500'>
              <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' />
              <span className='text-sm'>Loading users…</span>
            </div>
          ) : listUsers.length === 0 ? (
            <EmptyState
              icon={<Users className='w-12 h-12 text-slate-300' />}
              title={userTab === "needs-setup" ? "All users have a hostel set up" : "No users found"}>
              {userTab === "all" && (search || selectedHostel || selectedController || statusFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedHostel("");
                    setSelectedController("");
                    setStatusFilter("all");
                  }}
                  className='glass-link min-h-[40px]'>
                  Clear filters
                </button>
              )}
            </EmptyState>
          ) : (
            <div>
              {groups.map(([hostel, members]) => (
                <section key={hostel}>
                  <div className='flex items-center justify-between gap-3 border-b border-slate-200/60 bg-white/40 px-4 py-2.5 sm:px-7'>
                    <p className='flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500'>
                      <Building2 className='h-3.5 w-3.5 shrink-0' />
                      <span className='truncate'>{hostel}</span>
                    </p>
                    <span className='text-xs font-semibold text-slate-400'>{members.length}</span>
                  </div>
                  <div className='divide-y divide-slate-200/60'>
                    {members.map((user) => {
                      const isBusy = togglingId === user.id || deletingId === user.id;
                      const fb = feedback?.id === user.id ? feedback : null;
                      const open = expandedUsers.has(user.id);
                      return (
                        <div key={user.id} className={!user.isActive ? "opacity-70" : ""}>
                          {/* Collapsed: who, where and status. Tap for details and actions. */}
                          <button
                            type='button'
                            onClick={() => toggleUser(user.id)}
                            aria-expanded={open}
                            className='flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/50 sm:px-7'>
                            <UserInitials name={user.displayName} email={user.email} />
                            <div className='min-w-0 flex-1'>
                              <div className='flex flex-wrap items-center gap-2'>
                                <p className='min-w-0 max-w-full truncate text-sm font-semibold text-slate-900'>
                                  {user.displayName || user.email.split("@")[0]}
                                </p>
                                {user.deletionRequested ? (
                                  <span className='glass-red inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'>
                                    <Trash2 className='w-3 h-3' /> Deletion requested
                                  </span>
                                ) : !user.isActive ? (
                                  <span className='glass-red inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'>
                                    <XCircle className='w-3 h-3' /> Disabled
                                  </span>
                                ) : user.emailVerified ? (
                                  <span className='status-chip inline-flex items-center gap-1 text-xs'>
                                    <CheckCircle className='w-3 h-3' /> Verified
                                  </span>
                                ) : (
                                  <span className='warning-chip inline-flex items-center gap-1 text-xs'>
                                    <Clock className='w-3 h-3' /> Unverified
                                  </span>
                                )}
                              </div>
                              <p className='mt-0.5 truncate text-xs text-slate-500'>{user.email}</p>
                            </div>
                            <span className='hidden shrink-0 text-xs text-slate-400 sm:inline'>
                              {fmtRelative(user.lastActivityAt)}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                              aria-hidden
                            />
                          </button>

                          {/* Expanded: the details and actions as before. */}
                          {open && (
                            <div className='space-y-3 px-4 pb-4 sm:px-7 sm:pl-[4.75rem]'>
                              <dl className='grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2'>
                                <div className='flex gap-2'>
                                  <dt className='text-slate-400'>Phone</dt>
                                  <dd className='text-slate-700'>{user.phone || "—"}</dd>
                                </div>
                                <div className='flex gap-2'>
                                  <dt className='text-slate-400'>Hostel</dt>
                                  <dd className='text-slate-700'>{user.hostelId || "—"}</dd>
                                </div>
                                <div className='flex gap-2'>
                                  <dt className='text-slate-400'>Last active</dt>
                                  <dd className='text-slate-700'>{fmtRelative(user.lastActivityAt)}</dd>
                                </div>
                                <div className='flex gap-2'>
                                  <dt className='text-slate-400'>Joined</dt>
                                  <dd className='text-slate-700'>{fmtDate(user.createdAt)}</dd>
                                </div>
                              </dl>
                              <div className='flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end'>
                                {fb && (
                                  <span
                                    className={`w-full text-xs font-medium lg:w-auto ${fb.type === "success" ? "text-emerald-600" : "text-rose-500"}`}>
                                    {fb.text}
                                  </span>
                                )}
          
                                {/* Send Registration Reminder (Needs Setup only) */}
                                {userTab === "needs-setup" && (
                                  <button
                                    onClick={() => sendReminder([user.id])}
                                    disabled={sendingReminder === user.id}
                                    title='Send registration reminder email'
                                    className='glass-button px-3 text-amber-700'>
                                    {sendingReminder === user.id ? (
                                      <div className='w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin' />
                                    ) : (
                                      <Mail className='w-3.5 h-3.5' />
                                    )}
                                    Send Email
                                  </button>
                                )}
          
                                {/* Payment History */}
                                <button
                                  onClick={() => openHistory(user)}
                                  className='glass-button px-3 text-slate-700 hover:text-blue-600'
                                  title='View payment history'>
                                  <History className='w-3.5 h-3.5' />
                                  History
                                </button>
          
                                {isSuperAdmin && (
                                  <button
                                    onClick={() => setWalletUser(user)}
                                    className='glass-button px-3 text-slate-700 hover:text-emerald-700'
                                    title='View and correct this customer’s wallet'>
                                    <Wallet className='w-3.5 h-3.5' />
                                    Wallet
                                  </button>
                                )}
          
                                {/* Enable / Disable */}
                                <button
                                  onClick={() => handleToggle(user, !user.isActive)}
                                  disabled={isBusy}
                                  title={user.isActive ? "Disable account" : "Enable account"}
                                  className={`glass-button px-3 ${user.isActive ? "text-rose-600" : "text-emerald-700"}`}>
                                  {togglingId === user.id ? (
                                    <div className='w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' />
                                  ) : user.isActive ? (
                                    <ShieldOff className='w-3.5 h-3.5' />
                                  ) : (
                                    <ShieldCheck className='w-3.5 h-3.5' />
                                  )}
                                  {user.isActive ? "Disable" : "Enable"}
                                </button>
          
                                {/* Delete */}
                                <button
                                  onClick={() => {
                                    setDeleteConfirmText("");
                                    setDeleteModal(user);
                                  }}
                                  disabled={isBusy}
                                  title='Delete account and all footprints'
                                  className='glass-danger px-4'>
                                  {deletingId === user.id ? (
                                    <div className='w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin' />
                                  ) : (
                                    <Trash2 className='w-3.5 h-3.5' />
                                  )}
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Panel>

        {!loading && listUsers.length > 0 && (
          <p className='text-center text-xs text-slate-400'>
            {userTab === "needs-setup"
              ? `${needsSetupUsers.length} user${needsSetupUsers.length !== 1 ? "s" : ""} without a hostel`
              : `Showing ${users.length} user${users.length !== 1 ? "s" : ""}${selectedHostel ? ` in ${selectedHostel}` : ""}${search ? ` matching "${search}"` : ""}`}
          </p>
        )}
      </AdminPage>

      {walletUser && (
        <WalletModal userId={walletUser.id} email={walletUser.email} onClose={() => setWalletUser(null)} />
      )}

      {/* ── Payment History Modal ───────────────────────────────────────── */}
      {historyUser &&
        (() => {
          const isUnverified = !historyUser.emailVerified;

          // For unverified users, enrich each purchase with ref-derived hostel + type
          const enriched = purchases.map((p) => {
            const { refHostel, refType } = parseRef(p.paymentRef);
            const isTv = p.type === "tv" || refType === "TV";
            return { ...p, refHostel, refType, isTv };
          });

          // Apply type filter
          const filtered = enriched.filter((p) => {
            if (historyFilter === "data") return !p.isTv;
            if (historyFilter === "tv") return p.isTv;
            return true;
          });

          return (
            <Modal
              open
              onClose={() => setHistoryUser(null)}
              size='xl'
              icon={
                <div className='p-2.5 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl'>
                  <Receipt className='w-5 h-5 text-white' />
                </div>
              }
              title={
                <div className='min-w-0'>
                  <h3 className='text-base font-semibold text-slate-900'>Payment History</h3>
                  <p className='text-xs font-normal text-slate-500 mt-0.5 break-all'>
                    {historyUser.displayName || historyUser.email.split("@")[0]} · {historyUser.email}
                  </p>
                </div>
              }
              footer={
                purchases.length > 0 ? (
                  <div className='flex flex-wrap items-center justify-between gap-2 sm:w-full'>
                    <p className='text-xs text-slate-500'>
                      {filtered.length} of {purchases.length} transaction
                      {purchases.length !== 1 ? "s" : ""}
                    </p>
                    <p className='text-sm font-bold text-slate-900'>
                      Total: ₦{filtered.reduce((s, p) => s + p.price, 0).toLocaleString()}
                    </p>
                  </div>
                ) : undefined
              }>
              {/* Type filter tabs — shown for ALL users once purchases load */}
              {!historyLoading && purchases.length > 0 && (
                <div className='mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200/60 pb-3'>
                  {(["all", "data", "tv"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f)}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                        historyFilter === f
                          ? f === "tv"
                            ? "bg-purple-100 text-purple-700"
                            : f === "data"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-900 text-white shadow-sm"
                          : "border border-white/80 bg-white/70 text-slate-500 hover:bg-white"
                      }`}>
                      {f === "tv" && <Tv className='w-3 h-3' />}
                      {f === "data" && <Wifi className='w-3 h-3' />}
                      {f === "all" ? "All" : f === "tv" ? "TV" : "Data"}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          historyFilter === f ? "bg-white/30" : "bg-slate-200/80"
                        }`}>
                        {f === "all"
                          ? enriched.length
                          : f === "tv"
                            ? enriched.filter((p) => p.isTv).length
                            : enriched.filter((p) => !p.isTv).length}
                      </span>
                    </button>
                  ))}

                  {/* For unverified: unique hostels detected from refs */}
                  {isUnverified &&
                    (() => {
                      const hostelsInRefs = [...new Set(enriched.map((p) => p.refHostel).filter(Boolean))];
                      if (hostelsInRefs.length === 0) return null;
                      return (
                        <div className='flex flex-wrap items-center gap-1.5 sm:ml-auto sm:justify-end'>
                          {hostelsInRefs.map((h) => (
                            <span key={h} className='warning-chip inline-flex items-center gap-1 text-xs'>
                              <Building2 className='w-3 h-3' />
                              {h}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                </div>
              )}

              {historyLoading ? (
                <div className='flex items-center justify-center py-16 gap-3 text-slate-500'>
                  <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' />
                  <span className='text-sm'>Loading history…</span>
                </div>
              ) : purchases.length === 0 ? (
                <EmptyState icon={<Receipt className='w-10 h-10 text-slate-300' />} title='No payment history found' />
              ) : filtered.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-12 text-slate-400'>
                  <p className='text-sm'>No {historyFilter} transactions</p>
                  <button onClick={() => setHistoryFilter("all")} className='glass-link mt-1 min-h-[40px] text-xs'>
                    Show all
                  </button>
                </div>
              ) : (
                <div className='space-y-3'>
                  {filtered.map((p) => (
                    <div key={p.id} className='glass-card flex items-start gap-3'>
                      <div className={`p-2 rounded-xl flex-shrink-0 ${p.isTv ? "bg-purple-100" : "bg-blue-100"}`}>
                        {p.isTv ? <Tv className='w-4 h-4 text-purple-600' /> : <Wifi className='w-4 h-4 text-blue-600' />}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='flex flex-wrap items-start justify-between gap-2'>
                          <div className='min-w-0'>
                            <p className='text-sm font-semibold text-slate-900 break-words'>{p.planName}</p>
                            <div className='flex items-center gap-2 flex-wrap mt-0.5'>
                              <p className='text-xs text-slate-500'>
                                {p.isTv ? "TV Subscription" : `Data — ${p.planType}`}
                                {p.hostel ? ` · ${p.hostel}` : ""}
                              </p>
                              {/* For unverified: show hostel badge from ref when hostel field is missing */}
                              {isUnverified && p.refHostel && !p.hostel && (
                                <span className='warning-chip inline-flex items-center gap-1 !px-1.5 !py-0.5 text-xs'>
                                  <Building2 className='w-2.5 h-2.5' />
                                  {p.refHostel}
                                </span>
                              )}
                            </div>
                            {p.status && (
                              <span
                                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  p.status === "active"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : p.status === "expired"
                                      ? "bg-rose-100 text-rose-600"
                                      : "bg-amber-100 text-amber-700"
                                }`}>
                                {p.status.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          <div className='text-right flex-shrink-0'>
                            <p className='text-sm font-bold text-slate-900'>₦{p.price.toLocaleString()}</p>
                            <p className='text-xs text-slate-400 mt-0.5'>{fmtDateTime(p.createdAt)}</p>
                          </div>
                        </div>
                        {p.paymentRef && (
                          <p className='text-xs text-slate-400 mt-1.5 font-mono break-all'>Ref: {p.paymentRef}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          );
        })()}

      {/* ── Delete User Modal (danger) ──────────────────────────────────── */}
      {deleteModal && (
        <Modal
          open
          size='md'
          dismissible={deletingId !== deleteModal.id}
          onClose={() => {
            setDeleteModal(null);
            setDeleteConfirmText("");
          }}
          icon={
            <div className='w-10 h-10 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center'>
              <Trash2 className='w-5 h-5 text-white' />
            </div>
          }
          title='Delete Account?'
          footer={
            <>
              <button
                onClick={() => {
                  setDeleteModal(null);
                  setDeleteConfirmText("");
                }}
                disabled={deletingId === deleteModal.id}
                className='glass-button'>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={
                  deletingId === deleteModal.id ||
                  deleteConfirmText.trim().toLowerCase() !== deleteModal.email.toLowerCase()
                }
                className='glass-danger'>
                {deletingId === deleteModal.id ? (
                  <span className='flex items-center justify-center gap-2'>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                    Deleting...
                  </span>
                ) : (
                  "Delete forever"
                )}
              </button>
            </>
          }>
          <p className='text-sm text-slate-700 mb-1 font-semibold break-all'>{deleteModal.email}</p>
          <p className='text-sm text-slate-500 mb-5'>
            This permanently removes the user and all their footprints. This cannot be undone.
          </p>

          <div className='bg-rose-50/90 border border-rose-200 rounded-2xl px-4 py-3 mb-5'>
            <p className='text-xs font-semibold text-rose-700 mb-2 flex items-center gap-1.5'>
              <AlertTriangle className='w-3.5 h-3.5' />
              Will be wiped:
            </p>
            <ul className='text-xs text-rose-700 space-y-1 list-disc pl-5'>
              <li>Sign-in account (immediate sign-out)</li>
              <li>User profile (hostel, name, verification)</li>
              <li>All TV subscriptions for this email</li>
              <li>All data plan purchases for this email</li>
            </ul>
          </div>

          <div>
            <label htmlFor='delete-confirm' className='block text-xs font-semibold text-slate-700 mb-2'>
              Type the user&apos;s email to confirm
            </label>
            <input
              id='delete-confirm'
              type='text'
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoFocus
              autoComplete='off'
              placeholder={deleteModal.email}
              className={`${GLASS_INPUT} font-mono focus:border-rose-400 focus:ring-rose-100`}
            />
          </div>
        </Modal>
      )}

      {/* ── Disable Confirmation Modal ──────────────────────────────────── */}
      {confirmModal && (
        <Modal
          open
          size='sm'
          onClose={() => setConfirmModal(null)}
          icon={
            <div className='w-10 h-10 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center'>
              <ShieldOff className='w-5 h-5 text-white' />
            </div>
          }
          title='Disable Account?'
          footer={
            <>
              <button onClick={() => setConfirmModal(null)} className='glass-button'>
                Cancel
              </button>
              <button onClick={() => doToggle(confirmModal.user.id, false)} className='glass-danger'>
                Disable
              </button>
            </>
          }>
          <p className='text-sm text-slate-700 mb-1 font-semibold break-words'>
            {confirmModal.user.displayName || confirmModal.user.email}
          </p>
          <p className='text-sm text-slate-500'>This user will be blocked from signing in immediately.</p>
        </Modal>
      )}
    </ProtectedRoute>
  );
}
