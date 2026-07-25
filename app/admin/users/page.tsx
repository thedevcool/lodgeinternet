"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import {
  LogOut,
  ArrowLeft,
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
  Tv,
  Wifi,
  Receipt,
  Mail,
  AlertTriangle,
  Trash2,
  Phone,
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
}

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
  const { logout } = useAuthStore();
  const router = useRouter();

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

  // History modal
  const [historyUser, setHistoryUser] = useState<UserRow | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "data" | "tv">(
    "all",
  );

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  useEffect(() => {
    apiFetch("/api/hostels")
      .then((r) => r.json())
      .then((d) => setHostels(d.hostels || []))
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedHostel) params.set("hostel", selectedHostel);
      if (search.trim()) params.set("search", search.trim());
      const res = await apiFetch(`/api/admin/users?${params.toString()}`);
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

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => loadUsers(), 350);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  const openHistory = async (user: UserRow) => {
    setHistoryUser(user);
    setPurchases([]);
    setHistoryFilter("all");
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users?history=${user.id}`);
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
      const res = await apiFetch("/api/admin/users", {
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
      const res = await apiFetch(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, {
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
      const res = await apiFetch("/api/admin/send-registration-reminder", {
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

  return (
    <ProtectedRoute module='users'>
      <div className='min-h-screen bg-apple-gray-50'>
        {/* Header */}
        <header className='bg-white shadow-sm sticky top-0 z-10'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <button
                  onClick={() => router.push("/admin/dashboard")}
                  className='flex items-center gap-1.5 text-sm text-apple-gray-600 hover:text-apple-gray-900 transition-colors'>
                  <ArrowLeft className='w-4 h-4' />
                  Dashboard
                </button>
                <span className='text-apple-gray-300'>|</span>
                <Logo variant='dark' />
                <h1 className='text-xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-white bg-clip-text text-transparent'>
                  User Management
                </h1>
              </div>
              <div className='flex items-center gap-3'>
                <button
                  onClick={loadUsers}
                  disabled={loading}
                  className='p-2 text-apple-gray-500 hover:text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors disabled:opacity-40'
                  title='Refresh'>
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                  />
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

        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5'>
          {/* Stats Row */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
            {[
              {
                label: "Total Users",
                value: totalUsers,
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                label: "Active & Verified",
                value: activeUsers,
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                label: "Unverified",
                value: unverifiedUsers,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                label: "Disabled",
                value: disabledUsers,
                color: "text-red-600",
                bg: "bg-red-50",
              },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-2xl px-5 py-4`}>
                <p className='text-xs font-semibold text-apple-gray-500 uppercase tracking-wide mb-1'>
                  {s.label}
                </p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* View Tabs */}
          <div className='flex items-center gap-2'>
            <button
              onClick={() => setUserTab("all")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                userTab === "all"
                  ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-sm"
                  : "bg-white text-apple-gray-600 hover:bg-apple-gray-100 shadow-sm"
              }`}>
              All Users
            </button>
            <button
              onClick={() => setUserTab("needs-setup")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                userTab === "needs-setup"
                  ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm"
                  : "bg-white text-apple-gray-600 hover:bg-apple-gray-100 shadow-sm"
              }`}>
              <AlertTriangle className='w-4 h-4' />
              Needs Setup
              {needsSetupUsers.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${userTab === "needs-setup" ? "bg-white/30" : "bg-amber-100 text-amber-700"}`}>
                  {needsSetupUsers.length}
                </span>
              )}
            </button>
          </div>

          {/* Filters */}
          <div className='bg-white rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row gap-3'>
            {/* Search */}
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400' />
              <input
                type='text'
                placeholder='Search by name, email, phone or hostel…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='w-full pl-9 pr-9 py-2.5 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-sm text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all'
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 hover:text-apple-gray-600'>
                  <X className='w-4 h-4' />
                </button>
              )}
            </div>

            {/* Hostel Tabs — hidden in needs-setup view */}
            {userTab === "all" && (
              <div className='flex items-center gap-2 flex-wrap'>
                <button
                  onClick={() => setSelectedHostel("")}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    selectedHostel === ""
                      ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-sm"
                      : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                  }`}>
                  All
                </button>
                {hostels.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHostel(h.name)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                      selectedHostel === h.name
                        ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-sm"
                        : "bg-apple-gray-100 text-apple-gray-600 hover:bg-apple-gray-200"
                    }`}>
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Needs Setup — bulk send banner */}
          {userTab === "needs-setup" && needsSetupUsers.length > 0 && (
            <div className='bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
              <div className='flex items-start gap-3'>
                <AlertTriangle className='w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-amber-800'>
                    {needsSetupUsers.length} user{needsSetupUsers.length !== 1 ? "s" : ""} without a hostel
                  </p>
                  <p className='text-xs text-amber-600 mt-0.5'>
                    Send them a registration reminder with a link to complete their setup.
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-3 flex-shrink-0'>
                {reminderFeedback && (
                  <span className={`text-xs font-medium ${reminderFeedback.type === "success" ? "text-green-700" : "text-red-600"}`}>
                    {reminderFeedback.text}
                  </span>
                )}
                <button
                  onClick={() => sendReminder("all")}
                  disabled={sendingReminder === "bulk"}
                  className='flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50'>
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
          <div className='bg-white rounded-2xl shadow-sm overflow-hidden'>
            {loading ? (
              <div className='flex items-center justify-center py-20 gap-3 text-apple-gray-500'>
                <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' />
                <span className='text-sm'>Loading users…</span>
              </div>
            ) : (userTab === "needs-setup" ? needsSetupUsers : users).length === 0 ? (
              <div className='flex flex-col items-center justify-center py-20 text-apple-gray-500'>
                <Users className='w-12 h-12 mb-3 text-apple-gray-300' />
                <p className='text-sm font-medium'>
                  {userTab === "needs-setup" ? "All users have a hostel set up" : "No users found"}
                </p>
                {userTab === "all" && (search || selectedHostel) && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setSelectedHostel("");
                    }}
                    className='mt-2 text-sm text-blue-600 hover:text-blue-700'>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className='divide-y divide-apple-gray-100'>
                {(userTab === "needs-setup" ? needsSetupUsers : users).map((user) => {
                  const isBusy = togglingId === user.id || deletingId === user.id;
                  const fb = feedback?.id === user.id ? feedback : null;
                  return (
                    <div
                      key={user.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 hover:bg-apple-gray-50 transition-colors ${!user.isActive ? "opacity-60" : ""}`}>
                      {/* Left: avatar + info */}
                      <div className='flex items-start sm:items-center gap-3 min-w-0'>
                        <UserInitials
                          name={user.displayName}
                          email={user.email}
                        />
                        <div className='min-w-0'>
                          <div className='flex items-center gap-2 flex-wrap'>
                            <p className='text-sm font-semibold text-apple-gray-900 truncate'>
                              {user.displayName || user.email.split("@")[0]}
                            </p>
                            {user.emailVerified ? (
                              <span className='inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium'>
                                <CheckCircle className='w-3 h-3' /> Verified
                              </span>
                            ) : (
                              <span className='inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium'>
                                <Clock className='w-3 h-3' /> Unverified
                              </span>
                            )}
                            {!user.isActive && (
                              <span className='inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium'>
                                <XCircle className='w-3 h-3' /> Disabled
                              </span>
                            )}
                          </div>
                          <p className='text-xs text-apple-gray-500 mt-0.5 truncate'>
                            {user.email}
                          </p>
                          <div className='flex items-center gap-3 mt-1 flex-wrap'>
                            {user.hostelId && (
                              <span className='inline-flex items-center gap-1 text-xs text-apple-gray-500'>
                                <Building2 className='w-3 h-3' />
                                {user.hostelId}
                              </span>
                            )}
                            {user.phone && (
                              <span className='inline-flex items-center gap-1 text-xs text-apple-gray-500'>
                                <Phone className='w-3 h-3' />
                                {user.phone}
                              </span>
                            )}
                            <span className='inline-flex items-center gap-1 text-xs text-apple-gray-400'>
                              <Clock className='w-3 h-3' />
                              Last active: {fmtRelative(user.lastActivityAt)}
                            </span>
                            <span className='text-xs text-apple-gray-400'>
                              Joined: {fmtDate(user.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className='flex items-center gap-2 sm:flex-shrink-0 self-end sm:self-auto'>
                        {fb && (
                          <span
                            className={`text-xs font-medium ${fb.type === "success" ? "text-green-600" : "text-red-500"}`}>
                            {fb.text}
                          </span>
                        )}

                        {/* Send Registration Reminder (Needs Setup only) */}
                        {userTab === "needs-setup" && (
                          <button
                            onClick={() => sendReminder([user.id])}
                            disabled={sendingReminder === user.id}
                            title='Send registration reminder email'
                            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all disabled:opacity-50'>
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
                          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-apple-gray-100 text-apple-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-apple-gray-200'
                          title='View payment history'>
                          <History className='w-3.5 h-3.5' />
                          History
                        </button>

                        {/* Enable / Disable */}
                        <button
                          onClick={() => handleToggle(user, !user.isActive)}
                          disabled={isBusy}
                          title={
                            user.isActive ? "Disable account" : "Enable account"
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            user.isActive
                              ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                              : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                          }`}>
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
                          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed'>
                          {deletingId === user.id ? (
                            <div className='w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin' />
                          ) : (
                            <Trash2 className='w-3.5 h-3.5' />
                          )}
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!loading && (userTab === "needs-setup" ? needsSetupUsers : users).length > 0 && (
            <p className='text-center text-xs text-apple-gray-400'>
              {userTab === "needs-setup"
                ? `${needsSetupUsers.length} user${needsSetupUsers.length !== 1 ? "s" : ""} without a hostel`
                : `Showing ${users.length} user${users.length !== 1 ? "s" : ""}${selectedHostel ? ` in ${selectedHostel}` : ""}${search ? ` matching "${search}"` : ""}`}
            </p>
          )}
        </div>
      </div>

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
            <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
              <div className='bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col'>
                {/* Modal Header */}
                <div className='flex items-center justify-between p-5 pb-4 border-b border-apple-gray-100'>
                  <div className='flex items-center gap-3 min-w-0'>
                    <div className='p-2.5 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex-shrink-0'>
                      <Receipt className='w-5 h-5 text-white' />
                    </div>
                    <div className='min-w-0'>
                      <h3 className='text-base font-semibold text-apple-gray-900'>
                        Payment History
                      </h3>
                      <p className='text-xs text-apple-gray-500 mt-0.5 truncate max-w-[200px]'>
                        {historyUser.displayName ||
                          historyUser.email.split("@")[0]}{" "}
                        · {historyUser.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setHistoryUser(null)}
                    className='p-2 text-apple-gray-400 hover:text-apple-gray-600 hover:bg-apple-gray-100 rounded-xl transition-colors flex-shrink-0'>
                    <X className='w-5 h-5' />
                  </button>
                </div>

                {/* Type filter tabs — shown for ALL users once purchases load */}
                {!historyLoading && purchases.length > 0 && (
                  <div className='px-4 pt-3 pb-2 flex items-center gap-2 border-b border-apple-gray-100'>
                    {(["all", "data", "tv"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setHistoryFilter(f)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          historyFilter === f
                            ? f === "tv"
                              ? "bg-purple-100 text-purple-700"
                              : f === "data"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-sm"
                            : "bg-apple-gray-100 text-apple-gray-500 hover:bg-apple-gray-200"
                        }`}>
                        {f === "tv" && <Tv className='w-3 h-3' />}
                        {f === "data" && <Wifi className='w-3 h-3' />}
                        {f === "all" ? "All" : f === "tv" ? "TV" : "Data"}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            historyFilter === f
                              ? "bg-white/30"
                              : "bg-apple-gray-200"
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
                        const hostelsInRefs = [
                          ...new Set(
                            enriched.map((p) => p.refHostel).filter(Boolean),
                          ),
                        ];
                        if (hostelsInRefs.length === 0) return null;
                        return (
                          <div className='ml-auto flex items-center gap-1.5 flex-wrap justify-end'>
                            {hostelsInRefs.map((h) => (
                              <span
                                key={h}
                                className='inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium border border-amber-100'>
                                <Building2 className='w-3 h-3' />
                                {h}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                  </div>
                )}

                {/* Modal Body */}
                <div className='flex-1 overflow-y-auto p-4'>
                  {historyLoading ? (
                    <div className='flex items-center justify-center py-16 gap-3 text-apple-gray-500'>
                      <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' />
                      <span className='text-sm'>Loading history…</span>
                    </div>
                  ) : purchases.length === 0 ? (
                    <div className='flex flex-col items-center justify-center py-16 text-apple-gray-400'>
                      <Receipt className='w-10 h-10 mb-3 text-apple-gray-200' />
                      <p className='text-sm font-medium'>
                        No payment history found
                      </p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className='flex flex-col items-center justify-center py-12 text-apple-gray-400'>
                      <p className='text-sm'>No {historyFilter} transactions</p>
                      <button
                        onClick={() => setHistoryFilter("all")}
                        className='mt-2 text-xs text-blue-600 hover:text-blue-700'>
                        Show all
                      </button>
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      {filtered.map((p) => (
                        <div
                          key={p.id}
                          className='flex items-start gap-3 p-4 bg-apple-gray-50 rounded-2xl'>
                          <div
                            className={`p-2 rounded-xl flex-shrink-0 ${p.isTv ? "bg-purple-100" : "bg-blue-100"}`}>
                            {p.isTv ? (
                              <Tv className='w-4 h-4 text-purple-600' />
                            ) : (
                              <Wifi className='w-4 h-4 text-blue-600' />
                            )}
                          </div>
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-start justify-between gap-2'>
                              <div className='min-w-0'>
                                <p className='text-sm font-semibold text-apple-gray-900'>
                                  {p.planName}
                                </p>
                                <div className='flex items-center gap-2 flex-wrap mt-0.5'>
                                  <p className='text-xs text-apple-gray-500'>
                                    {p.isTv
                                      ? "TV Subscription"
                                      : `Data — ${p.planType}`}
                                    {p.hostel ? ` · ${p.hostel}` : ""}
                                  </p>
                                  {/* For unverified: show hostel badge from ref when hostel field is missing */}
                                  {isUnverified && p.refHostel && !p.hostel && (
                                    <span className='inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium border border-amber-100'>
                                      <Building2 className='w-2.5 h-2.5' />
                                      {p.refHostel}
                                    </span>
                                  )}
                                </div>
                                {p.status && (
                                  <span
                                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                      p.status === "active"
                                        ? "bg-green-100 text-green-700"
                                        : p.status === "expired"
                                          ? "bg-red-100 text-red-600"
                                          : "bg-amber-100 text-amber-700"
                                    }`}>
                                    {p.status.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                              <div className='text-right flex-shrink-0'>
                                <p className='text-sm font-bold text-apple-gray-900'>
                                  ₦{p.price.toLocaleString()}
                                </p>
                                <p className='text-xs text-apple-gray-400 mt-0.5'>
                                  {fmtDateTime(p.createdAt)}
                                </p>
                              </div>
                            </div>
                            {p.paymentRef && (
                              <p className='text-xs text-apple-gray-400 mt-1.5 font-mono truncate'>
                                Ref: {p.paymentRef}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                {purchases.length > 0 && (
                  <div className='px-6 py-4 border-t border-apple-gray-100 flex items-center justify-between'>
                    <p className='text-xs text-apple-gray-500'>
                      {filtered.length} of {purchases.length} transaction
                      {purchases.length !== 1 ? "s" : ""}
                    </p>
                    <p className='text-sm font-bold text-apple-gray-900'>
                      Total: ₦
                      {filtered
                        .reduce((s, p) => s + p.price, 0)
                        .toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* ── Delete User Modal (danger) ──────────────────────────────────── */}
      {deleteModal && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-3xl shadow-2xl max-w-md w-full p-8'>
            <div className='flex items-center justify-center mb-4'>
              <div className='w-14 h-14 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center'>
                <Trash2 className='w-7 h-7 text-white' />
              </div>
            </div>
            <h3 className='text-xl font-semibold text-apple-gray-900 text-center mb-2'>
              Delete Account?
            </h3>
            <p className='text-sm text-apple-gray-600 text-center mb-1 font-semibold break-all'>
              {deleteModal.email}
            </p>
            <p className='text-sm text-apple-gray-500 text-center mb-5'>
              This permanently removes the user and all their footprints. This cannot be undone.
            </p>

            <div className='bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5'>
              <p className='text-xs font-semibold text-red-700 mb-2 flex items-center gap-1.5'>
                <AlertTriangle className='w-3.5 h-3.5' />
                Will be wiped:
              </p>
              <ul className='text-xs text-red-700 space-y-1 list-disc pl-5'>
                <li>Firebase Auth account (immediate sign-out)</li>
                <li>User profile (hostel, name, verification)</li>
                <li>All TV subscriptions for this email</li>
                <li>All data plan purchases for this email</li>
              </ul>
            </div>

            <div className='mb-5'>
              <label
                htmlFor='delete-confirm'
                className='block text-xs font-semibold text-apple-gray-700 mb-2'>
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
                className='w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm font-mono'
              />
            </div>

            <div className='flex gap-3'>
              <button
                onClick={() => {
                  setDeleteModal(null);
                  setDeleteConfirmText("");
                }}
                disabled={deletingId === deleteModal.id}
                className='flex-1 py-3 rounded-2xl border border-apple-gray-200 text-apple-gray-700 font-semibold hover:bg-apple-gray-50 transition-colors text-sm disabled:opacity-50'>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={
                  deletingId === deleteModal.id ||
                  deleteConfirmText.trim().toLowerCase() !==
                    deleteModal.email.toLowerCase()
                }
                className='flex-1 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-sm disabled:opacity-40 disabled:cursor-not-allowed'>
                {deletingId === deleteModal.id ? (
                  <span className='flex items-center justify-center gap-2'>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                    Deleting...
                  </span>
                ) : (
                  "Delete forever"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Disable Confirmation Modal ──────────────────────────────────── */}
      {confirmModal && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8'>
            <div className='flex items-center justify-center mb-4'>
              <div className='w-14 h-14 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center'>
                <ShieldOff className='w-7 h-7 text-white' />
              </div>
            </div>
            <h3 className='text-xl font-semibold text-apple-gray-900 text-center mb-2'>
              Disable Account?
            </h3>
            <p className='text-sm text-apple-gray-600 text-center mb-1 font-semibold'>
              {confirmModal.user.displayName || confirmModal.user.email}
            </p>
            <p className='text-sm text-apple-gray-500 text-center mb-6'>
              This user will be blocked from signing in immediately.
            </p>
            <div className='flex gap-3'>
              <button
                onClick={() => setConfirmModal(null)}
                className='flex-1 py-3 rounded-2xl border border-apple-gray-200 text-apple-gray-700 font-semibold hover:bg-apple-gray-50 transition-colors text-sm'>
                Cancel
              </button>
              <button
                onClick={() => doToggle(confirmModal.user.id, false)}
                className='flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-sm'>
                Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
