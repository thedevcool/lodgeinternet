"use client";
import { adminFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { AdminPage, Panel, Modal, GLASS_INPUT } from "@/components/admin/ui";
import {
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
  const { adminProfile } = useAuthStore();
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

  useEffect(() => {
    adminFetch("/api/admin/settings")
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
      const res = await adminFetch("/api/admin/settings", {
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
    <ProtectedRoute module="settings">
      <AdminPage eyebrow="SYSTEM" title="Site Settings" width="narrow">
        {/* Super-admin only notice */}
        {!isSuperAdmin && (
          <div className='glass-alert !flex-nowrap'>
            <AlertTriangle className='w-5 h-5 flex-shrink-0 text-amber-500' />
            <span className='min-w-0'>Site settings are only modifiable by the Super Admin.</span>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div
            className={`flex items-start gap-3 px-4 py-4 rounded-2xl text-sm border sm:px-5 ${
              feedback.type === "success"
                ? "bg-green-50/90 border-green-200 text-green-800"
                : "bg-red-50/90 border-red-200 text-red-700"
            }`}>
            {feedback.type === "success" ? (
              <CheckCircle className='w-5 h-5 flex-shrink-0 text-green-500 mt-0.5' />
            ) : (
              <AlertTriangle className='w-5 h-5 flex-shrink-0 text-red-500 mt-0.5' />
            )}
            <span className='min-w-0 break-words'>{feedback.text}</span>
          </div>
        )}

        {/* ── Lockdown Card ─────────────────────────────────────── */}
        <Panel>
          <div className='flex items-center gap-3 mb-5'>
            <div className='shrink-0 p-2.5 bg-gradient-to-br from-red-400 to-red-600 rounded-xl'>
              <Lock className='w-5 h-5 text-white' />
            </div>
            <div className='min-w-0'>
              <h2 className='text-lg font-semibold text-slate-900'>
                Site Lockdown
              </h2>
              <p className='text-sm text-slate-500'>
                Instantly close the website and the WhatsApp bot together
              </p>
            </div>
          </div>

          {loading ? (
            <div className='flex items-center gap-3 py-4'>
              <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' />
              <span className='text-sm text-slate-500'>
                Loading settings…
              </span>
            </div>
          ) : (
            <>
              {/* Toggle pill */}
              <div className='flex items-center justify-between gap-3 p-4 bg-white/60 border border-white/80 rounded-2xl mb-5'>
                <div className='min-w-0'>
                  <p className='font-semibold text-slate-900 text-sm'>
                    Lockdown Status
                  </p>
                  <p
                    className={`text-xs font-medium mt-0.5 ${settings?.lockdownEnabled ? "text-red-600" : "text-green-600"}`}>
                    {settings?.lockdownEnabled
                      ? "ACTIVE — site is locked"
                      : "INACTIVE — site is live"}
                  </p>
                  {settings?.updatedAt && (
                    <p className='text-xs text-slate-400 mt-1 break-words'>
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
                <label className='block text-sm font-semibold text-slate-900 mb-2'>
                  Maintenance Message
                </label>
                <p className='text-xs text-slate-500 mb-3'>
                  Shown to visitors on the maintenance page, and sent by the
                  WhatsApp bot to anyone who messages while the site is locked.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={!isSuperAdmin}
                  rows={3}
                  placeholder="We're currently performing scheduled maintenance. We'll be back shortly."
                  className={`${GLASS_INPUT} resize-none disabled:cursor-not-allowed`}
                />
                {isSuperAdmin && (
                  <button
                    onClick={saveMessageOnly}
                    disabled={
                      saving || message.trim() === settings?.lockdownMessage
                    }
                    className='glass-primary mt-3 w-full sm:w-auto'>
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
                <div className='mt-5 flex items-start gap-3 px-4 py-3 bg-red-50/90 border border-red-200 rounded-2xl text-red-700 text-sm'>
                  <Lock className='w-4 h-4 flex-shrink-0 mt-0.5' />
                  <span className='min-w-0'>
                    <strong>Lockdown is active.</strong> Visitors are being
                    redirected to the maintenance page and the WhatsApp bot is
                    replying with the message below instead of serving. Admins,
                    payment webhooks and scheduled jobs are unaffected, so
                    purchases already in flight still complete.
                  </span>
                </div>
              )}
              {!settings?.lockdownEnabled && (
                <div className='mt-5 flex items-start gap-3 px-4 py-3 bg-green-50/90 border border-green-200 rounded-2xl text-green-700 text-sm'>
                  <Unlock className='w-4 h-4 flex-shrink-0 mt-0.5' />
                  <span className='min-w-0'>
                    <strong>Site is live.</strong> Visitors and the WhatsApp
                    bot both have normal access.
                  </span>
                </div>
              )}
            </>
          )}
        </Panel>
      </AdminPage>

      {/* ── Confirmation Modal ───────────────────────────────────────── */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        size='sm'
        title='Enable Site Lockdown?'
        icon={
          <div className='w-9 h-9 bg-gradient-to-br from-red-400 to-red-600 rounded-xl flex items-center justify-center'>
            <Lock className='w-5 h-5 text-white' />
          </div>
        }
        footer={
          <>
            <button
              onClick={() => setShowConfirm(false)}
              className='glass-button'>
              Cancel
            </button>
            <button
              onClick={() => toggleLockdown(true)}
              disabled={saving}
              className='glass-danger'>
              {saving ? "Enabling…" : "Yes, Lock Site"}
            </button>
          </>
        }>
        <p className='text-sm text-slate-600'>
          Visitors will immediately be redirected to the maintenance page,
          and the WhatsApp bot will stop serving and reply with your message
          instead. Admin access, payment webhooks and scheduled jobs keep
          working, so purchases already in flight still complete.
        </p>
      </Modal>
    </ProtectedRoute>
  );
}
