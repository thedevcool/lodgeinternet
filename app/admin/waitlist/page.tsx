"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/Toast";
import ConfirmationModal from "@/components/ConfirmationModal";
import {
  LogOut,
  GraduationCap,
  Home,
  Users,
  CheckCircle,
  Sparkles,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
} from "lucide-react";

interface WaitlistEntry {
  id: string;
  email: string;
  whatsappPhone: string;
  audienceType: "student" | "resident";
  affordability: "yes" | "manage";
  schoolName: string | null;
  hostelName: string | null;
  schoolAddress: string | null;
  hostelOccupants: number | null;
  address: string | null;
  estate: string | null;
  city: string | null;
  status: "new" | "contacted" | "converted" | "dismissed";
  notes: string;
  createdAt: string | null;
}

type AudienceTab = "all" | "student" | "resident";
type StatusFilter = "all" | "new" | "contacted" | "converted" | "dismissed";

const STATUS_LABELS: Record<WaitlistEntry["status"], string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  dismissed: "Dismissed",
};

const STATUS_STYLES: Record<WaitlistEntry["status"], string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-amber-100 text-amber-700",
  converted: "bg-green-100 text-green-700",
  dismissed: "bg-apple-gray-200 text-apple-gray-700",
};

export default function AdminWaitlistPage() {
  const { logout, canWrite } = useAuthStore();
  const canEdit = canWrite("waitlist");
  const router = useRouter();
  const { addToast } = useToast();

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [audienceTab, setAudienceTab] = useState<AudienceTab>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    id: string | null;
    label: string;
  }>({ isOpen: false, id: null, label: "" });

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/waitlist");
      if (!res.ok) throw new Error("Failed to load waitlist");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err: any) {
      setError(err?.message || "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/admin/login");
  };

  // ───────── Filtering ─────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (audienceTab !== "all" && e.audienceType !== audienceTab) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        e.email,
        e.whatsappPhone,
        e.schoolName,
        e.hostelName,
        e.schoolAddress,
        e.address,
        e.estate,
        e.city,
        e.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, audienceTab, statusFilter, search]);

  // ───────── Aggregates ─────────
  const stats = useMemo(() => {
    const total = entries.length;
    const students = entries.filter((e) => e.audienceType === "student").length;
    const residents = entries.filter((e) => e.audienceType === "resident").length;
    const canAfford = entries.filter((e) => e.affordability === "yes").length;
    const canManage = entries.filter((e) => e.affordability === "manage").length;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const last7 = entries.filter(
      (e) => e.createdAt && new Date(e.createdAt).getTime() >= sevenDaysAgo,
    ).length;

    // Potential reach = sum of the largest reported occupant count for each
    // unique (school, hostel) pair. Multiple students from one hostel will
    // give similar but not identical numbers; the max is the most honest
    // single signal of demand size for that hostel.
    const hostelMax = new Map<string, number>();
    for (const e of entries) {
      if (e.audienceType !== "student" || !e.hostelOccupants) continue;
      const key = `${e.schoolName ?? ""}|${e.hostelName ?? ""}`;
      hostelMax.set(key, Math.max(hostelMax.get(key) ?? 0, e.hostelOccupants));
    }
    const potentialReach = [...hostelMax.values()].reduce((n, v) => n + v, 0);

    return { total, students, residents, canAfford, canManage, last7, potentialReach };
  }, [entries]);

  // Max reported occupants for each (school, hostel) — used in the grouped list header.
  // Keys match the fallback strings used in `studentGroups` so the badge lookup hits.
  const hostelMaxOccupants = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.audienceType !== "student" || !e.hostelOccupants) continue;
      const school = e.schoolName || "Unknown school";
      const hostel = e.hostelName || "Unknown hostel";
      const key = `${school}|${hostel}`;
      map.set(key, Math.max(map.get(key) ?? 0, e.hostelOccupants));
    }
    return map;
  }, [entries]);

  // Top schools / hostels / cities — for charts and grouping
  const topSchools = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.audienceType !== "student" || !e.schoolName) continue;
      counts.set(e.schoolName, (counts.get(e.schoolName) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [entries]);

  const topHostels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.audienceType !== "student" || !e.hostelName) continue;
      const key = e.schoolName ? `${e.hostelName} — ${e.schoolName}` : e.hostelName;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [entries]);

  const topCities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.audienceType !== "resident" || !e.city) continue;
      counts.set(e.city, (counts.get(e.city) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [entries]);

  // School → hostel → entries grouping for the Student view
  const studentGroups = useMemo(() => {
    const tree = new Map<string, Map<string, WaitlistEntry[]>>();
    for (const e of filtered) {
      if (e.audienceType !== "student") continue;
      const school = e.schoolName || "Unknown school";
      const hostel = e.hostelName || "Unknown hostel";
      if (!tree.has(school)) tree.set(school, new Map());
      const hostelMap = tree.get(school)!;
      if (!hostelMap.has(hostel)) hostelMap.set(hostel, []);
      hostelMap.get(hostel)!.push(e);
    }
    return [...tree.entries()]
      .map(([school, hostelMap]) => ({
        school,
        total: [...hostelMap.values()].reduce((n, arr) => n + arr.length, 0),
        hostels: [...hostelMap.entries()]
          .map(([hostel, list]) => ({ hostel, entries: list }))
          .sort((a, b) => b.entries.length - a.entries.length),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const residentGroups = useMemo(() => {
    const map = new Map<string, WaitlistEntry[]>();
    for (const e of filtered) {
      if (e.audienceType !== "resident") continue;
      const key = e.city || "Unknown city";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()]
      .map(([city, list]) => ({ city, entries: list }))
      .sort((a, b) => b.entries.length - a.entries.length);
  }, [filtered]);

  // ───────── Actions ─────────
  const updateStatus = async (id: string, status: WaitlistEntry["status"]) => {
    if (!canEdit) return;
    // optimistic
    const prev = entries;
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, status } : e)));
    try {
      const res = await apiFetch(`/api/admin/waitlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      addToast({ type: "success", title: "Updated", message: `Status set to ${STATUS_LABELS[status]}.` });
    } catch (err: any) {
      setEntries(prev);
      addToast({ type: "error", title: "Update failed", message: err?.message || "Try again." });
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/waitlist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete entry");
      setEntries((es) => es.filter((e) => e.id !== id));
      addToast({ type: "success", title: "Deleted", message: "Entry removed." });
    } catch (err: any) {
      addToast({ type: "error", title: "Delete failed", message: err?.message || "Try again." });
    }
  };

  const exportCsv = () => {
    const rows = [
      [
        "Created",
        "Audience",
        "Email",
        "WhatsApp",
        "School",
        "Hostel",
        "School address",
        "Hostel occupants",
        "Address",
        "Estate",
        "City",
        "Affordability",
        "Status",
        "Notes",
      ],
      ...filtered.map((e) => [
        e.createdAt || "",
        e.audienceType,
        e.email,
        e.whatsappPhone,
        e.schoolName || "",
        e.hostelName || "",
        e.schoolAddress || "",
        e.hostelOccupants ?? "",
        e.address || "",
        e.estate || "",
        e.city || "",
        e.affordability,
        e.status,
        e.notes,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? "");
            if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleGroup = (key: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ProtectedRoute module="waitlist">
      <div className="min-h-screen bg-apple-gray-100">
        {/* Header */}
        <header className="bg-white border-b border-apple-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center">
                <Logo />
              </Link>
              <div className="flex items-center gap-2 sm:gap-4">
                <Link
                  href="/admin/dashboard"
                  className="hidden sm:block text-apple-gray-600 hover:text-apple-gray-800 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-apple-gray-700 hover:text-apple-gray-900 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Title + actions */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-apple-gray-900 mb-2">
                Waitlist
              </h1>
              <p className="text-apple-gray-600">
                Demand signals from the public waitlist sign-up form
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-apple-gray-300 text-apple-gray-700 font-semibold rounded-xl hover:bg-apple-gray-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <KpiCard label="Total signups" value={stats.total} icon={<Users className="w-5 h-5 text-blue-600" />} tone="blue" />
            <KpiCard
              label="Students / Residents"
              value={`${stats.students} / ${stats.residents}`}
              icon={<GraduationCap className="w-5 h-5 text-purple-600" />}
              tone="purple"
            />
            <KpiCard
              label="Can afford / Can manage"
              value={`${stats.canAfford} / ${stats.canManage}`}
              icon={<CheckCircle className="w-5 h-5 text-green-600" />}
              tone="green"
            />
            <KpiCard
              label="Signups in last 7 days"
              value={stats.last7}
              icon={<Sparkles className="w-5 h-5 text-amber-600" />}
              tone="amber"
            />
            <KpiCard
              label="Potential reach (students)"
              value={stats.potentialReach.toLocaleString()}
              icon={<Home className="w-5 h-5 text-pink-600" />}
              tone="pink"
            />
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <ChartCard title="Audience split">
              <DonutChart
                segments={[
                  { label: "Student", value: stats.students, color: "#a78bfa" },
                  { label: "Resident", value: stats.residents, color: "#60a5fa" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Affordability split">
              <DonutChart
                segments={[
                  { label: "Can afford", value: stats.canAfford, color: "#34d399" },
                  { label: "Can manage", value: stats.canManage, color: "#fbbf24" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Top schools">
              <BarChart rows={topSchools} accent="from-blue-400 to-purple-400" />
            </ChartCard>
            <ChartCard title="Top hostels">
              <BarChart rows={topHostels} accent="from-blue-400 to-purple-400" />
            </ChartCard>
            {topCities.length > 0 && (
              <ChartCard title="Top cities (residents)" className="lg:col-span-2">
                <BarChart rows={topCities} accent="from-green-400 to-emerald-500" />
              </ChartCard>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-4 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex gap-1.5 bg-apple-gray-100 p-1 rounded-xl">
                {(["all", "student", "resident"] as AudienceTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAudienceTab(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      audienceTab === t
                        ? "bg-white text-apple-gray-900 shadow-sm"
                        : "text-apple-gray-600 hover:text-apple-gray-900"
                    }`}
                  >
                    {t === "all" ? "All" : t === "student" ? "Students" : "Residents"}
                  </button>
                ))}
              </div>

              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, WhatsApp, school, hostel, city…"
                  className="w-full pl-9 pr-4 py-2.5 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-sm text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2.5 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-sm text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="converted">Converted</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <p className="text-xs text-apple-gray-500 mt-3">
              Showing {filtered.length} of {entries.length} entries
            </p>
          </div>

          {/* List */}
          {loading ? (
            <div className="bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-12 text-center">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-apple-gray-600">Loading the waitlist…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-12 text-center">
              <p className="text-apple-gray-600">No matching entries.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(audienceTab === "all" || audienceTab === "student") &&
                studentGroups.length > 0 && (
                  <SectionCard title="Students" subtitle={`${studentGroups.reduce((n, g) => n + g.total, 0)} entries`}>
                    <div className="space-y-2">
                      {studentGroups.map((group) => {
                        const schoolKey = `school:${group.school}`;
                        const open = expanded.has(schoolKey);
                        return (
                          <div key={schoolKey} className="bg-apple-gray-50 rounded-2xl border border-apple-gray-100 overflow-hidden">
                            <button
                              onClick={() => toggleGroup(schoolKey)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-apple-gray-100 transition-colors"
                            >
                              {open ? (
                                <ChevronDown className="w-4 h-4 text-apple-gray-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-apple-gray-500" />
                              )}
                              <GraduationCap className="w-4 h-4 text-purple-600" />
                              <span className="flex-1 font-semibold text-apple-gray-900">{group.school}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                                {group.total}
                              </span>
                            </button>

                            {open && (
                              <div className="px-4 pb-3 space-y-2">
                                {group.hostels.map((h) => {
                                  const hostelKey = `${schoolKey}:hostel:${h.hostel}`;
                                  const hOpen = expanded.has(hostelKey);
                                  return (
                                    <div key={hostelKey} className="bg-white rounded-xl border border-apple-gray-200 overflow-hidden">
                                      <button
                                        onClick={() => toggleGroup(hostelKey)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-apple-gray-50 transition-colors"
                                      >
                                        {hOpen ? (
                                          <ChevronDown className="w-4 h-4 text-apple-gray-500" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4 text-apple-gray-500" />
                                        )}
                                        <span className="flex-1 text-sm font-medium text-apple-gray-900">{h.hostel}</span>
                                        {(() => {
                                          const reach = hostelMaxOccupants.get(
                                            `${group.school}|${h.hostel}`,
                                          );
                                          return reach ? (
                                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold bg-pink-100 text-pink-700">
                                              ~{reach.toLocaleString()} occupants
                                            </span>
                                          ) : null;
                                        })()}
                                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                                          {h.entries.length}
                                        </span>
                                      </button>
                                      {hOpen && (
                                        <div className="divide-y divide-apple-gray-100">
                                          {h.entries.map((entry) => (
                                            <EntryRow
                                              key={entry.id}
                                              entry={entry}
                                              canEdit={canEdit}
                                              onStatusChange={updateStatus}
                                              onDelete={() =>
                                                setConfirmDelete({ isOpen: true, id: entry.id, label: entry.email })
                                              }
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}

              {(audienceTab === "all" || audienceTab === "resident") &&
                residentGroups.length > 0 && (
                  <SectionCard
                    title="Residents"
                    subtitle={`${residentGroups.reduce((n, g) => n + g.entries.length, 0)} entries`}
                  >
                    <div className="space-y-2">
                      {residentGroups.map((group) => {
                        const cityKey = `city:${group.city}`;
                        const open = expanded.has(cityKey);
                        return (
                          <div key={cityKey} className="bg-apple-gray-50 rounded-2xl border border-apple-gray-100 overflow-hidden">
                            <button
                              onClick={() => toggleGroup(cityKey)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-apple-gray-100 transition-colors"
                            >
                              {open ? (
                                <ChevronDown className="w-4 h-4 text-apple-gray-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-apple-gray-500" />
                              )}
                              <Home className="w-4 h-4 text-blue-600" />
                              <span className="flex-1 font-semibold text-apple-gray-900">{group.city}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                                {group.entries.length}
                              </span>
                            </button>
                            {open && (
                              <div className="px-4 pb-3 bg-white border-t border-apple-gray-100 divide-y divide-apple-gray-100">
                                {group.entries.map((entry) => (
                                  <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    canEdit={canEdit}
                                    onStatusChange={updateStatus}
                                    onDelete={() =>
                                      setConfirmDelete({ isOpen: true, id: entry.id, label: entry.email })
                                    }
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}
            </div>
          )}
        </main>

        <ConfirmationModal
          isOpen={confirmDelete.isOpen}
          onClose={() => setConfirmDelete({ isOpen: false, id: null, label: "" })}
          onConfirm={() => {
            if (confirmDelete.id) deleteEntry(confirmDelete.id);
          }}
          title="Delete waitlist entry"
          message={`Permanently remove ${confirmDelete.label} from the waitlist? This cannot be undone.`}
          type="danger"
          confirmText="Delete"
        />
      </div>
    </ProtectedRoute>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "blue" | "purple" | "green" | "amber" | "pink";
}) {
  const tile =
    tone === "blue"
      ? "bg-blue-100"
      : tone === "purple"
        ? "bg-purple-100"
        : tone === "green"
          ? "bg-green-100"
          : tone === "pink"
            ? "bg-pink-100"
            : "bg-amber-100";
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${tile}`}>{icon}</div>
        <p className="text-xs text-apple-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-apple-gray-900">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-apple-gray-200 p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-apple-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-apple-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ChartCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-5 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold text-apple-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-apple-gray-500">
        No data yet
      </div>
    );
  }
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="w-32 h-32 -rotate-90">
        <circle cx={70} cy={70} r={radius} fill="none" stroke="#f5f5f7" strokeWidth={18} />
        {segments.map((s) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const seg = (
            <circle
              key={s.label}
              cx={70}
              cy={70}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={18}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="space-y-2 flex-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-sm text-apple-gray-700 flex-1">{s.label}</span>
            <span className="text-sm font-semibold text-apple-gray-900">{s.value}</span>
            <span className="text-xs text-apple-gray-500">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({
  rows,
  accent,
}: {
  rows: { name: string; count: number }[];
  accent: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-apple-gray-500">
        No data yet
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.name}>
          <div className="flex items-center justify-between text-xs text-apple-gray-600 mb-1">
            <span className="truncate pr-2">{row.name}</span>
            <span className="font-semibold text-apple-gray-900">{row.count}</span>
          </div>
          <div className="h-2 bg-apple-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${accent} rounded-full`}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  canEdit,
  onStatusChange,
  onDelete,
}: {
  entry: WaitlistEntry;
  canEdit: boolean;
  onStatusChange: (id: string, status: WaitlistEntry["status"]) => void;
  onDelete: () => void;
}) {
  const waLink = `https://wa.me/${entry.whatsappPhone.replace(/[^\d]/g, "")}`;
  const created = entry.createdAt ? new Date(entry.createdAt) : null;
  const createdLabel = created
    ? created.toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <div className="px-3 py-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-apple-gray-900 truncate">{entry.email}</span>
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${
                entry.affordability === "yes"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {entry.affordability === "yes" ? "Can afford" : "Can manage"}
            </span>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[entry.status]}`}>
              {STATUS_LABELS[entry.status]}
            </span>
          </div>
          <div className="text-xs text-apple-gray-500 space-x-2">
            <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium">
              {entry.whatsappPhone}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-apple-gray-300">·</span>
            <span>Joined {createdLabel}</span>
          </div>
          {entry.audienceType === "student" ? (
            <p className="text-xs text-apple-gray-600 mt-1">
              {entry.hostelName}, {entry.schoolName} — {entry.schoolAddress}
              {entry.hostelOccupants ? (
                <span className="text-apple-gray-500">
                  {" "}
                  · ~{entry.hostelOccupants.toLocaleString()} in hostel
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-apple-gray-600 mt-1">
              {entry.address}, {entry.estate}, {entry.city}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={entry.status}
            onChange={(e) => onStatusChange(entry.id, e.target.value as WaitlistEntry["status"])}
            disabled={!canEdit}
            className="text-xs px-2.5 py-1.5 bg-apple-gray-50 border border-apple-gray-200 rounded-lg text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {canEdit && (
            <button
              onClick={onDelete}
              className="p-1.5 text-apple-gray-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
              aria-label="Delete entry"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
