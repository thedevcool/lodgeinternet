"use client";
import { adminFetch } from "@/lib/apiClient";

import { useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AdminPage, Panel, GLASS_INPUT } from "@/components/admin/ui";

type MigrationStatus = "idle" | "running" | "success" | "error";

interface MigrationResult {
  message?: string;
  error?: string;
  [key: string]: any;
}

interface Migration {
  id: string;
  title: string;
  description: string;
  details: string[];
  endpoint: string;
  method: "POST";
  color: string;
  bgColor: string;
  borderColor: string;
  destructive?: boolean;
}

const MIGRATIONS: Migration[] = [
  {
    id: "migrate-hostel",
    title: "Migrate Hostel Field",
    description:
      "Assign the default hostel ('Ayoni') to all records that are missing a hostel tag.",
    details: [
      "Updates dataCodes with no hostel \u2192 sets hostel: 'Ayoni'",
      "Updates dataPurchases with missing/invalid hostel or paymentRef",
      "Updates tvSubscriptions with missing/invalid hostel or paymentRef",
    ],
    endpoint: "/api/admin/migrate-hostel",
    method: "POST",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    id: "migrate-mac-addresses",
    title: "Migrate MAC Addresses",
    description:
      "Clear hashed MAC addresses that cannot be recovered and mark those subscriptions for re-entry.",
    details: [
      "Scans all tvSubscriptions for hashed MAC addresses (64-char hex strings)",
      "Sets macAddressHash to null so the admin knows re-entry is needed",
      "Adds a migrationNote field explaining what happened",
    ],
    endpoint: "/api/admin/migrate-mac-addresses",
    method: "POST",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    destructive: false,
  },
  {
    id: "migrate-unlimited",
    title: "Rename Daily Unlimited → Unlimited",
    description:
      'Replaces all "daily-unlimited" values with "unlimited" across the database.',
    details: [
      'Updates hostels → planTypes array: "daily-unlimited" → "unlimited"',
      'Updates dataPlans → planType field: "daily-unlimited" → "unlimited"',
      'Updates dataPurchases → planType field: "daily-unlimited" → "unlimited"',
    ],
    endpoint: "/api/admin/migrate-unlimited",
    method: "POST",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
];

export default function MigrationsPage() {
  const { canWrite } = useAuthStore();
  const canEdit = canWrite("migrations");
  const [statuses, setStatuses] = useState<Record<string, MigrationStatus>>({});
  const [results, setResults] = useState<Record<string, MigrationResult>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // ── Migration password gate ──────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setVerifying(true);
    setPasswordError("");
    try {
      const res = await adminFetch("/api/admin/verify-migration-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Incorrect password");
      setUnlocked(true);
    } catch (err: any) {
      setPasswordError(err.message || "Incorrect password");
    } finally {
      setVerifying(false);
    }
  };

  const runMigration = async (migration: Migration) => {
    setConfirmId(null);
    setStatuses((s) => ({ ...s, [migration.id]: "running" }));
    setResults((r) => {
      const next = { ...r };
      delete next[migration.id];
      return next;
    });

    try {
      const res = await adminFetch(migration.endpoint, {
        method: migration.method,
        headers: { "x-migration-password": passwordInput },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Migration failed");
      setStatuses((s) => ({ ...s, [migration.id]: "success" }));
      setResults((r) => ({ ...r, [migration.id]: data }));
    } catch (err: any) {
      setStatuses((s) => ({ ...s, [migration.id]: "error" }));
      setResults((r) => ({ ...r, [migration.id]: { error: err.message } }));
    }
  };

  // ── Password gate screen ────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <ProtectedRoute module="migrations">
        <AdminPage eyebrow="SYSTEM" title="Migrations" width="narrow">
          <Panel className="mx-auto w-full max-w-sm">
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                <Lock className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Migrations
              </h2>
              <p className="text-sm text-slate-500 text-center mt-1">
                Enter the migration password to access this module.
              </p>
            </div>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Migration password"
                  autoFocus
                  className={`${GLASS_INPUT} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p className="text-sm text-rose-600 font-medium break-words">
                  {passwordError}
                </p>
              )}
              <button
                type="submit"
                disabled={verifying || !passwordInput.trim()}
                className="glass-primary w-full"
              >
                {verifying ? "Verifying…" : "Unlock"}
              </button>
            </form>
          </Panel>
        </AdminPage>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute module="migrations">
      <AdminPage
        eyebrow="SYSTEM"
        title="Migrations"
        subtitle="Run database migrations and data fixes"
        width="narrow"
      >
        {/* Warning Banner */}
        <div className="glass-alert !flex-nowrap !items-start">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900 mb-1">
              Run with caution
            </p>
            <p className="text-sm text-amber-800 leading-relaxed">
              Migrations make bulk changes to the database. They are designed
              to be idempotent (safe to run multiple times), but you should
              only run them when you have made a schema or logic change that
              requires back-filling existing records.
            </p>
          </div>
        </div>

        {/* Migration Cards */}
        {MIGRATIONS.map((migration) => {
          const status = statuses[migration.id] ?? "idle";
          const result = results[migration.id];
          const isRunning = status === "running";

          return (
            <Panel
              key={migration.id}
              flush
              className={`border-2 ${
                status === "success"
                  ? "border-green-200"
                  : status === "error"
                    ? "border-red-200"
                    : migration.borderColor
              } transition-colors`}
            >
              {/* Card Header */}
              <div className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                      <h2 className="min-w-0 break-words text-lg font-semibold text-slate-900">
                        {migration.title}
                      </h2>
                      {/* Status Badge */}
                      {status === "running" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Running…
                        </span>
                      )}
                      {status === "success" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" />
                          Success
                        </span>
                      )}
                      {status === "error" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <XCircle className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                      {status === "idle" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          <Clock className="w-3 h-3" />
                          Ready
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-4 break-words">
                      {migration.description}
                    </p>
                    <ul className="space-y-1">
                      {migration.details.map((detail, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-slate-600"
                        >
                          <span
                            className={`font-bold mt-0.5 ${migration.color}`}
                          >
                            •
                          </span>
                          <span className="min-w-0 break-words">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Run Button */}
                  <div className="w-full sm:w-auto sm:flex-shrink-0">
                    {!canEdit ? (
                      <span className="text-xs text-slate-400 italic px-3 py-2">
                        Read-only
                      </span>
                    ) : confirmId === migration.id ? (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => runMigration(migration)}
                          className="glass-primary w-full"
                        >
                          Confirm Run
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="glass-button w-full"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(migration.id)}
                        disabled={isRunning}
                        className="glass-primary w-full sm:w-auto"
                      >
                        {isRunning ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        {isRunning ? "Running…" : "Run Migration"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Result Area */}
              {result && (
                <div
                  className={`border-t px-4 py-4 sm:px-6 ${
                    status === "success"
                      ? "bg-green-50/80 border-green-100"
                      : "bg-red-50/80 border-red-100"
                  }`}
                >
                  {status === "success" ? (
                    <div className="min-w-0">
                      <p className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        Migration completed successfully
                      </p>
                      {result.message && (
                        <p className="text-sm text-green-700 mb-3 break-words">
                          {result.message}
                        </p>
                      )}
                      {/* Show numeric stats if present */}
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(result)
                          .filter(
                            ([key, val]) =>
                              typeof val === "number" && key !== "status",
                          )
                          .map(([key, val]) => (
                            <div
                              key={key}
                              className="bg-green-100 rounded-lg px-3 py-1.5 text-xs font-medium text-green-800"
                            >
                              <span className="capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}
                              </span>
                              : <strong>{String(val)}</strong>
                            </div>
                          ))}
                      </div>
                      {result.errors && result.errors.length > 0 && (
                        <details className="mt-3">
                          <summary className="text-xs font-medium text-amber-700 cursor-pointer py-2">
                            {result.errors.length} partial error(s) — click to
                            expand
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {result.errors.map((e: string, i: number) => (
                              <li
                                key={i}
                                className="text-xs text-red-600 font-mono break-all"
                              >
                                {e}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-red-700">
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold">Migration failed</p>
                        <p className="text-sm mt-1 break-words">{result.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          );
        })}
      </AdminPage>
    </ProtectedRoute>
  );
}
