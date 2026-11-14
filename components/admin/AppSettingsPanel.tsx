"use client";

import { useEffect, useState } from "react";
import { Smartphone, Plus, Trash2 } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { Panel, GLASS_INPUT } from "@/components/admin/ui";

/**
 * The mobile app's switches (superadmin only, GET/PUT /api/admin/app-config).
 *
 * Every phone reads these when the app opens, so a change reaches customers
 * within minutes with no app release: features appear only when switched on
 * (no "coming soon" in the app), the oldest app version still allowed to buy,
 * the support contacts the app shows, and the store pages "Update the app"
 * opens. An empty contact is simply not shown in the app.
 */

type Features = {
  purchasesInApp: boolean;
  hostelMap: boolean;
  hostelDetection: boolean;
  notifications: boolean;
  liveSupport: boolean;
  lodgeDispatch: boolean;
};

type AppConfig = {
  features: Features;
  minAppVersion: string;
  support: { whatsappAgents: { name: string; phone: string }[]; telegramUsername: string; email: string };
  storeUrls: { ios: string; android: string };
  updatedAt: string | null;
  updatedBy: string | null;
};

const SWITCHES: { key: keyof Features; label: string; help: string }[] = [
  { key: "purchasesInApp", label: "Buying in the app", help: "Off: the app shows codes but sends buyers to the website. The fallback if App Review objects to card payments." },
  { key: "hostelMap", label: "Hostels map", help: "The map of hostels on the Hostels tab." },
  { key: "hostelDetection", label: "Find the hostel from the Wi-Fi", help: "Uses the access points on the Hostels page." },
  { key: "notifications", label: "Notifications", help: "Payments, codes ready, codes running low, back in stock." },
  { key: "liveSupport", label: "Live support chat", help: "Not built yet. Leave off until it exists." },
  { key: "lodgeDispatch", label: "Lodge Dispatch", help: "Not built yet. Leave off until it exists." },
];

export default function AppSettingsPanel() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/app-config")
      .then((r) => r.json())
      .then((data: AppConfig) => setConfig(data))
      .catch(() => setFeedback({ ok: false, text: "Couldn't load the app settings." }));
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminFetch("/api/admin/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: config.features,
          minAppVersion: config.minAppVersion,
          support: config.support,
          storeUrls: config.storeUrls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setFeedback({ ok: true, text: "Saved. Phones pick this up within a few minutes." });
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || "Couldn't save." });
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<AppConfig>) => setConfig((c) => (c ? { ...c, ...patch } : c));
  const agents = config?.support.whatsappAgents ?? [];

  return (
    <Panel>
      <div className='flex items-center gap-3 mb-5'>
        <div className='shrink-0 p-2.5 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl'>
          <Smartphone className='w-5 h-5 text-white' />
        </div>
        <div className='min-w-0'>
          <h2 className='text-lg font-semibold text-slate-900'>Mobile app</h2>
          <p className='text-sm text-slate-500'>What every phone running the Lodge app is told when it opens</p>
        </div>
      </div>

      {!config ? (
        <p className='text-sm text-slate-500'>{feedback?.text ?? "Loading…"}</p>
      ) : (
        <div className='space-y-6'>
          <div className='space-y-2'>
            {SWITCHES.map(({ key, label, help }) => (
              <label key={key} className='flex items-start justify-between gap-4 p-3 bg-white/60 border border-white/80 rounded-2xl'>
                <span className='min-w-0'>
                  <span className='block text-sm font-semibold text-slate-900'>{label}</span>
                  <span className='block text-xs text-slate-500 mt-0.5'>{help}</span>
                </span>
                <input
                  type='checkbox'
                  className='mt-1 h-5 w-5 shrink-0 accent-blue-600'
                  checked={config.features[key]}
                  onChange={(e) => set({ features: { ...config.features, [key]: e.target.checked } })}
                />
              </label>
            ))}
          </div>

          <div>
            <label className='block text-sm font-semibold text-slate-900 mb-1'>Oldest app version allowed to buy</label>
            <p className='text-xs text-slate-500 mb-2'>Older apps are asked to update and can&apos;t pay until they do. Codes already bought still show.</p>
            <input className={GLASS_INPUT} value={config.minAppVersion} onChange={(e) => set({ minAppVersion: e.target.value })} placeholder='1.0.0' />
          </div>

          <div>
            <p className='text-sm font-semibold text-slate-900 mb-2'>Support contacts in the app</p>
            <div className='space-y-2'>
              {agents.map((agent, i) => (
                <div key={i} className='flex flex-wrap gap-2'>
                  <input className={`${GLASS_INPUT} flex-1 min-w-[8rem]`} value={agent.name} placeholder='Name'
                    onChange={(e) => set({ support: { ...config.support, whatsappAgents: agents.map((a, j) => (j === i ? { ...a, name: e.target.value } : a)) } })} />
                  <input className={`${GLASS_INPUT} flex-1 min-w-[10rem]`} value={agent.phone} placeholder='2348012345678' inputMode='numeric'
                    onChange={(e) => set({ support: { ...config.support, whatsappAgents: agents.map((a, j) => (j === i ? { ...a, phone: e.target.value.replace(/\D/g, "") } : a)) } })} />
                  <button type='button' className='glass-button' aria-label={`Remove ${agent.name || "contact"}`}
                    onClick={() => set({ support: { ...config.support, whatsappAgents: agents.filter((_, j) => j !== i) } })}>
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              ))}
              <button type='button' className='glass-button text-sm'
                onClick={() => set({ support: { ...config.support, whatsappAgents: [...agents, { name: "", phone: "" }] } })}>
                <Plus className='w-4 h-4' /> Add a WhatsApp contact
              </button>
            </div>
            <div className='grid gap-2 mt-3 sm:grid-cols-2'>
              <input className={GLASS_INPUT} value={config.support.telegramUsername} placeholder='Telegram username (optional)'
                onChange={(e) => set({ support: { ...config.support, telegramUsername: e.target.value } })} />
              <input className={GLASS_INPUT} value={config.support.email} placeholder='Support email (optional)'
                onChange={(e) => set({ support: { ...config.support, email: e.target.value } })} />
            </div>
          </div>

          <div>
            <p className='text-sm font-semibold text-slate-900 mb-1'>Store pages</p>
            <p className='text-xs text-slate-500 mb-2'>Fill in once the app is listed. Until then the app&apos;s update screen shows no button.</p>
            <div className='grid gap-2 sm:grid-cols-2'>
              <input className={GLASS_INPUT} value={config.storeUrls.ios} placeholder='https://apps.apple.com/app/…'
                onChange={(e) => set({ storeUrls: { ...config.storeUrls, ios: e.target.value } })} />
              <input className={GLASS_INPUT} value={config.storeUrls.android} placeholder='https://play.google.com/store/apps/details?id=…'
                onChange={(e) => set({ storeUrls: { ...config.storeUrls, android: e.target.value } })} />
            </div>
          </div>

          {feedback && (
            <p className={`text-sm ${feedback.ok ? "text-green-700" : "text-red-600"}`}>{feedback.text}</p>
          )}
          <button onClick={save} disabled={saving} className='glass-primary w-full sm:w-auto'>
            {saving ? "Saving…" : "Save app settings"}
          </button>
          {config.updatedAt && (
            <p className='text-xs text-slate-400'>Last changed by {config.updatedBy ?? "admin"} · {new Date(config.updatedAt).toLocaleString()}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
