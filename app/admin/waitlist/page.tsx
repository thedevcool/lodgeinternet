"use client";
import { adminFetch } from "@/lib/apiClient";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/Toast";
import ConfirmationModal from "@/components/ConfirmationModal";
import {
  AdminPage,
  EmptyState,
  GLASS_INPUT,
  GLASS_INPUT_ICON,
  IconButton,
  Kpi,
  Panel,
  SegToggle,
} from "@/components/admin/ui";
import {
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
  const { canWrite } = useAuthStore();
  const canEdit = canWrite("waitlist");
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
      const res = await adminFetch("/api/admin/waitlist");
      if (!res.ok) throw new Error("Failed to load waitlist");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err: any) {
      setError(err?.message || "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
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
      const res = await adminFetch(`/api/admin/waitlist/${id}`, {
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
      const res = await adminFetch(`/api/admin/waitlist/${id}`, { method: "DELETE" });
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
      <AdminPage
        eyebrow="DEMAND"
        title="Waitlist"
        subtitle="Demand signals from the public waitlist sign-up form"
        actions={
          <button onClick={exportCsv} disabled={filtered.length === 0} className="glass-button">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      >
        {error && (
          <div className="glass-alert border-rose-200 bg-rose-50/90 text-rose-700">
            <span className="min-w-0 flex-1 break-words">{error}</span>
          </div>
        )}

        {/* KPI cards. Five tiles: on the two-column phone grid the last spans
            the row rather than sitting alone in half of it. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Total signups" value={stats.total} icon={<Users className="h-4 w-4" />} tone="blue" />
          <Kpi
            label="Students / Residents"
            value={`${stats.students} / ${stats.residents}`}
            icon={<GraduationCap className="h-4 w-4" />}
            tone="purple"
          />
          <Kpi
            label="Can afford / Can manage"
            value={`${stats.canAfford} / ${stats.canManage}`}
            icon={<CheckCircle className="h-4 w-4" />}
            tone="green"
          />
          <Kpi
            label="Signups in last 7 days"
            value={stats.last7}
            icon={<Sparkles className="h-4 w-4" />}
            tone="orange"
          />
          <div className="col-span-2 lg:col-span-1">
            <Kpi
              label="Potential reach (students)"
              value={stats.potentialReach.toLocaleString()}
              icon={<Home className="h-4 w-4" />}
              tone="violet"
            />
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-5 lg:grid-cols-2">
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
        <Panel>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SegToggle<AudienceTab>
              value={audienceTab}
              onChange={setAudienceTab}
              options={(["all", "student", "resident"] as AudienceTab[]).map((t) => ({
                value: t,
                label: t === "all" ? "All" : t === "student" ? "Students" : "Residents",
              }))}
            />

            <div className="relative min-w-0 flex-1">
              <Search className={GLASS_INPUT_ICON} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email, WhatsApp, school, hostel, city…"
                className={`${GLASS_INPUT} pl-11`}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={`${GLASS_INPUT} lg:w-auto`}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="converted">Converted</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Showing {filtered.length} of {entries.length} entries
          </p>
        </Panel>

        {/* List */}
        {loading ? (
          <Panel>
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm text-slate-600">Loading the waitlist…</p>
            </div>
          </Panel>
        ) : filtered.length === 0 ? (
          <Panel>
            <EmptyState title="No matching entries." />
          </Panel>
        ) : (
          <div className="space-y-5">
            {(audienceTab === "all" || audienceTab === "student") &&
              studentGroups.length > 0 && (
                <SectionCard title="Students" subtitle={`${studentGroups.reduce((n, g) => n + g.total, 0)} entries`}>
                  <div className="space-y-2">
                    {studentGroups.map((group) => {
                      const schoolKey = `school:${group.school}`;
                      const open = expanded.has(schoolKey);
                      return (
                        <div key={schoolKey} className="overflow-hidden rounded-2xl border border-white/80 bg-white/50">
                          <button
                            onClick={() => toggleGroup(schoolKey)}
                            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-white/70 sm:gap-3 sm:px-4"
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            <GraduationCap className="h-4 w-4 shrink-0 text-purple-600" />
                            <span className="min-w-0 flex-1 break-words font-semibold text-slate-900">{group.school}</span>
                            <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                              {group.total}
                            </span>
                          </button>

                          {open && (
                            <div className="space-y-2 px-2 pb-2 sm:px-4 sm:pb-3">
                              {group.hostels.map((h) => {
                                const hostelKey = `${schoolKey}:hostel:${h.hostel}`;
                                const hOpen = expanded.has(hostelKey);
                                return (
                                  <div key={hostelKey} className="overflow-hidden rounded-xl border border-white/80 bg-white/70">
                                    <button
                                      onClick={() => toggleGroup(hostelKey)}
                                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white sm:gap-3"
                                    >
                                      {hOpen ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                      )}
                                      <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">{h.hostel}</span>
                                      <span className="flex flex-wrap items-center justify-end gap-1">
                                        {(() => {
                                          const reach = hostelMaxOccupants.get(
                                            `${group.school}|${h.hostel}`,
                                          );
                                          return reach ? (
                                            <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pink-700">
                                              ~{reach.toLocaleString()} occupants
                                            </span>
                                          ) : null;
                                        })()}
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                          {h.entries.length}
                                        </span>
                                      </span>
                                    </button>
                                    {hOpen && (
                                      <div className="divide-y divide-slate-100">
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
                        <div key={cityKey} className="overflow-hidden rounded-2xl border border-white/80 bg-white/50">
                          <button
                            onClick={() => toggleGroup(cityKey)}
                            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-white/70 sm:gap-3 sm:px-4"
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            <Home className="h-4 w-4 shrink-0 text-blue-600" />
                            <span className="min-w-0 flex-1 break-words font-semibold text-slate-900">{group.city}</span>
                            <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {group.entries.length}
                            </span>
                          </button>
                          {open && (
                            <div className="divide-y divide-slate-100 border-t border-white/80 bg-white/70 px-2 pb-2 sm:px-4 sm:pb-3">
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
      </AdminPage>

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
    </ProtectedRoute>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

/** An audience group (Students / Residents): a kit Panel with a count. */
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
    <Panel title={title} actions={subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}>
      {children}
    </Panel>
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
    <section className={`glass-panel min-w-0 ${className ?? ""}`}>
      <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
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
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        No data yet
      </div>
    );
  }
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4 min-[400px]:flex-row min-[400px]:gap-6">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0 -rotate-90">
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
      <div className="w-full min-w-0 flex-1 space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{s.label}</span>
            <span className="text-sm font-semibold text-slate-900">{s.value}</span>
            <span className="text-xs text-slate-500">
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
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        No data yet
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-600">
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="shrink-0 font-semibold text-slate-900">{row.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${accent}`}
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
    <div className="px-2 py-3 sm:px-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-full flex-1">
          <div className="mb-1 flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <span className="min-w-0 max-w-full truncate text-sm font-semibold text-slate-900">{entry.email}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                entry.affordability === "yes"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {entry.affordability === "yes" ? "Can afford" : "Can manage"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[entry.status]}`}>
              {STATUS_LABELS[entry.status]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[32px] items-center gap-1 font-medium text-blue-600 hover:text-blue-700">
              {entry.whatsappPhone}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-slate-300">·</span>
            <span>Joined {createdLabel}</span>
          </div>
          {entry.audienceType === "student" ? (
            <p className="mt-1 break-words text-xs text-slate-600">
              {entry.hostelName}, {entry.schoolName} — {entry.schoolAddress}
              {entry.hostelOccupants ? (
                <span className="text-slate-500">
                  {" "}
                  · ~{entry.hostelOccupants.toLocaleString()} in hostel
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 break-words text-xs text-slate-600">
              {entry.address}, {entry.estate}, {entry.city}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <select
            value={entry.status}
            onChange={(e) => onStatusChange(entry.id, e.target.value as WaitlistEntry["status"])}
            disabled={!canEdit}
            aria-label="Status"
            className={`${GLASS_INPUT} w-auto py-2 text-xs`}
          >
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {canEdit && (
            <IconButton label="Delete entry" tone="danger" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
