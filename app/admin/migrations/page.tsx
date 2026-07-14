"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import {
  LogOut,
  ArrowLeft,
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
  const { logout, canWrite } = useAuthStore();
  const canEdit = canWrite("migrations");
  const router = useRouter();
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
      const res = await apiFetch("/api/admin/verify-migration-password", {
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

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
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
      const res = await fetch(migration.endpoint, {
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
        <div className="min-h-screen bg-apple-gray-50 flex items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-8">
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                  <Lock className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-xl font-bold text-apple-gray-900">
                  Migrations
                </h1>
                <p className="text-sm text-apple-gray-500 text-center mt-1">
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
                    className="w-full pl-4 pr-12 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-purple-400 focus:outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-sm text-red-600 font-medium">
                    {passwordError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={verifying || !passwordInput.trim()}
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Unlock"}
                </button>
              </form>
              <button
                onClick={() => router.push("/admin/dashboard")}
                className="mt-4 w-full text-center text-sm text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
              >
                ← Back to dashboard
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute module="migrations">
      <div className="min-h-screen bg-apple-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/admin/dashboard")}
                  className="p-2 hover:bg-apple-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-apple-gray-600" />
                </button>
                <Logo variant="dark" />
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent">
                    Migrations
                  </h1>
                  <p className="text-sm text-apple-gray-600">
                    Run database migrations and data fixes
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Warning Banner */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-900 mb-1">
                Run with caution
              </p>
              <p className="text-sm text-yellow-800 leading-relaxed">
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
              <div
                key={migration.id}
                className={`bg-white rounded-2xl shadow-sm border-2 ${
                  status === "success"
                    ? "border-green-200"
                    : status === "error"
                      ? "border-red-200"
                      : migration.borderColor
                } overflow-hidden transition-colors`}
              >
                {/* Card Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-semibold text-apple-gray-900">
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
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-apple-gray-100 text-apple-gray-600">
                            <Clock className="w-3 h-3" />
                            Ready
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-apple-gray-600 mb-4">
                        {migration.description}
                      </p>
                      <ul className="space-y-1">
                        {migration.details.map((detail, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-apple-gray-600"
                          >
                            <span
                              className={`font-bold mt-0.5 ${migration.color}`}
                            >
                              •
                            </span>
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Run Button */}
                    <div className="flex-shrink-0">
                      {!canEdit ? (
                        <span className="text-xs text-apple-gray-400 italic px-3 py-2">
                          Read-only
                        </span>
                      ) : confirmId === migration.id ? (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => runMigration(migration)}
                            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
                          >
                            Confirm Run
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-5 py-2.5 bg-apple-gray-100 text-apple-gray-700 text-sm font-semibold rounded-xl hover:bg-apple-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(migration.id)}
                          disabled={isRunning}
                          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-sm ${
                            isRunning
                              ? "bg-apple-gray-100 text-apple-gray-400 cursor-not-allowed"
                              : "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90 hover:shadow-lg"
                          }`}
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
                    className={`border-t px-6 py-4 ${
                      status === "success"
                        ? "bg-green-50 border-green-100"
                        : "bg-red-50 border-red-100"
                    }`}
                  >
                    {status === "success" ? (
                      <div>
                        <p className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Migration completed successfully
                        </p>
                        {result.message && (
                          <p className="text-sm text-green-700 mb-3">
                            {result.message}
                          </p>
                        )}
                        {/* Show numeric stats if present */}
                        <div className="flex flex-wrap gap-3">
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
                            <summary className="text-xs font-medium text-amber-700 cursor-pointer">
                              {result.errors.length} partial error(s) — click to
                              expand
                            </summary>
                            <ul className="mt-2 space-y-1">
                              {result.errors.map((e: string, i: number) => (
                                <li
                                  key={i}
                                  className="text-xs text-red-600 font-mono"
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
                        <div>
                          <p className="font-semibold">Migration failed</p>
                          <p className="text-sm mt-1">{result.error}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ProtectedRoute>
  );
}
