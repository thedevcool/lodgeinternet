"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import {
  LogOut,
  ArrowLeft,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface SiteSettings {
  lockdownEnabled: boolean;
  lockdownMessage: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export default function AdminSettingsPage() {
  const { logout, adminProfile } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  useEffect(() => {
    apiFetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: SiteSettings) => {
        setSettings(data);
        setMessage(data.lockdownMessage);
      })
      .catch(() =>
        setFeedback({ type: "error", text: "Failed to load settings." }),
      )
      .finally(() => setLoading(false));
  }, []);

  const toggleLockdown = async (enable: boolean) => {
    if (enable && !showConfirm) {
      // Require explicit confirmation before enabling lockdown
      setShowConfirm(true);
      return;
    }
    setShowConfirm(false);
    await saveSettings(enable);
  };

  const saveSettings = async (lockdownEnabled: boolean) => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lockdownEnabled,
          lockdownMessage: message.trim() || settings?.lockdownMessage,
          updatedBy: adminProfile?.username ?? "admin",
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok)
        throw new Error(data.error || `Server error (${res.status})`);

      setSettings((prev) =>
        prev
          ? {
              ...prev,
              lockdownEnabled,
              updatedBy: adminProfile?.username ?? "admin",
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );

      if (data.redisAvailable === false) {
        setFeedback({
          type: "error",
          text: "Settings saved, but Redis is not configured — lockdown enforcement will NOT work until UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.",
        });
      } else {
        setFeedback({
          type: "success",
          text: lockdownEnabled
            ? "Site lockdown is now ACTIVE. All visitors are seeing the maintenance page."
            : "Site lockdown has been lifted. The site is live again.",
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err.message || "Failed to save settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveMessageOnly = async () => {
    if (!settings) return;
    await saveSettings(settings.lockdownEnabled);
  };

  return (
    <ProtectedRoute>
      <div className='min-h-screen bg-apple-gray-50'>
        {/* Header */}
        <header className='bg-white shadow-sm sticky top-0 z-10'>
          <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
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
                <div>
                  <h1 className='text-xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-white bg-clip-text text-transparent'>
                    Site Settings
                  </h1>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                <LogOut className='w-4 h-4' />
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6'>
          {/* Super-admin only notice */}
          {!isSuperAdmin && (
            <div className='bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3 text-amber-800 text-sm'>
              <AlertTriangle className='w-5 h-5 flex-shrink-0 text-amber-500' />
              Site settings are only modifiable by the Super Admin.
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div
              className={`flex items-start gap-3 px-5 py-4 rounded-2xl text-sm border ${
                feedback.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
              {feedback.type === "success" ? (
                <CheckCircle className='w-5 h-5 flex-shrink-0 text-green-500 mt-0.5' />
              ) : (
                <AlertTriangle className='w-5 h-5 flex-shrink-0 text-red-500 mt-0.5' />
              )}
              {feedback.text}
            </div>
          )}

          {/* ── Lockdown Card ─────────────────────────────────────── */}
          <div className='bg-white rounded-3xl shadow-sm p-6'>
            <div className='flex items-center gap-3 mb-5'>
              <div className='p-2.5 bg-gradient-to-br from-red-400 to-red-600 rounded-xl'>
                <Lock className='w-5 h-5 text-white' />
              </div>
              <div>
                <h2 className='text-lg font-semibold text-apple-gray-900'>
                  Site Lockdown
                </h2>
                <p className='text-sm text-apple-gray-500'>
                  Instantly block all visitors and show a maintenance page
                </p>
              </div>
            </div>

            {loading ? (
              <div className='flex items-center gap-3 py-4'>
                <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' />
                <span className='text-sm text-apple-gray-500'>
                  Loading settings…
                </span>
              </div>
            ) : (
              <>
                {/* Toggle pill */}
                <div className='flex items-center justify-between p-4 bg-apple-gray-50 rounded-2xl mb-5'>
                  <div>
                    <p className='font-semibold text-apple-gray-900 text-sm'>
                      Lockdown Status
                    </p>
                    <p
                      className={`text-xs font-medium mt-0.5 ${settings?.lockdownEnabled ? "text-red-600" : "text-green-600"}`}>
                      {settings?.lockdownEnabled
                        ? "ACTIVE — site is locked"
                        : "INACTIVE — site is live"}
                    </p>
                    {settings?.updatedAt && (
                      <p className='text-xs text-apple-gray-400 mt-1'>
                        Last changed by {settings.updatedBy ?? "admin"} ·{" "}
                        {new Date(settings.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Toggle switch */}
                  <button
                    disabled={saving || !isSuperAdmin}
                    onClick={() => toggleLockdown(!settings?.lockdownEnabled)}
                    className={`relative inline-flex h-8 w-16 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      settings?.lockdownEnabled
                        ? "bg-gradient-to-r from-red-500 to-red-600"
                        : "bg-gradient-to-r from-green-400 to-green-500"
                    }`}
                    title={isSuperAdmin ? undefined : "Super admin only"}>
                    <span
                      className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        settings?.lockdownEnabled
                          ? "translate-x-8"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Lockdown message */}
                <div>
                  <label className='block text-sm font-semibold text-apple-gray-900 mb-2'>
                    Maintenance Message
                  </label>
                  <p className='text-xs text-apple-gray-500 mb-3'>
                    This message is shown to visitors while the site is locked.
                  </p>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={!isSuperAdmin}
                    rows={3}
                    placeholder="We're currently performing scheduled maintenance. We'll be back shortly."
                    className='w-full px-4 py-3 border border-apple-gray-200 rounded-2xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed text-sm'
                  />
                  {isSuperAdmin && (
                    <button
                      onClick={saveMessageOnly}
                      disabled={
                        saving || message.trim() === settings?.lockdownMessage
                      }
                      className='mt-3 px-5 py-2.5 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm'>
                      {saving ? (
                        <span className='flex items-center gap-2'>
                          <span className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                          Saving…
                        </span>
                      ) : (
                        "Save Message"
                      )}
                    </button>
                  )}
                </div>

                {/* Status indicator banner */}
                {settings?.lockdownEnabled && (
                  <div className='mt-5 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm'>
                    <Lock className='w-4 h-4 flex-shrink-0' />
                    <span>
                      <strong>Lockdown is active.</strong> All visitors are
                      being redirected to the maintenance page. Admin routes
                      remain accessible.
                    </span>
                  </div>
                )}
                {!settings?.lockdownEnabled && (
                  <div className='mt-5 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-sm'>
                    <Unlock className='w-4 h-4 flex-shrink-0' />
                    <span>
                      <strong>Site is live.</strong> All visitors have normal
                      access.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ───────────────────────────────────────── */}
      {showConfirm && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8'>
            <div className='flex items-center justify-center mb-4'>
              <div className='w-14 h-14 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center'>
                <Lock className='w-7 h-7 text-white' />
              </div>
            </div>
            <h3 className='text-xl font-semibold text-apple-gray-900 text-center mb-2'>
              Enable Site Lockdown?
            </h3>
            <p className='text-sm text-apple-gray-600 text-center mb-6'>
              All visitors will immediately be redirected to the maintenance
              page. Only admin routes will remain accessible.
            </p>
            <div className='flex gap-3'>
              <button
                onClick={() => setShowConfirm(false)}
                className='flex-1 py-3 rounded-2xl border border-apple-gray-200 text-apple-gray-700 font-semibold hover:bg-apple-gray-50 transition-colors text-sm'>
                Cancel
              </button>
              <button
                onClick={() => toggleLockdown(true)}
                disabled={saving}
                className='flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm'>
                {saving ? "Enabling…" : "Yes, Lock Site"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
