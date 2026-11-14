"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Wifi } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import { GLASS_INPUT } from "@/components/admin/ui";

/**
 * The Wi-Fi access points the Lodge app recognises as this hostel
 * (GET/POST/DELETE /api/admin/hostels/access-points).
 *
 * An address entered here is trusted at once. Ones customers confirmed show
 * how many confirmed them; three customers registered at the hostel make one
 * trusted. Remove any that look wrong. An access point's address (BSSID) is in
 * the controller's device list, or a phone's Wi-Fi details, e.g. 3c:84:6a:11:22:33.
 */

type AccessPoint = { bssid: string; source: "admin" | "crowd" | "controller"; confirmations: number; createdBy?: string | null };

export default function HostelAccessPoints({ hostel }: { hostel: string }) {
  const [points, setPoints] = useState<AccessPoint[] | null>(null);
  const [bssid, setBssid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    adminFetch(`/api/admin/hostels/access-points?hostel=${encodeURIComponent(hostel)}`)
      .then((r) => r.json())
      .then((d) => setPoints(d.accessPoints ?? []))
      .catch(() => setError("Couldn't load the access points."));

  useEffect(() => {
    load();
  }, [hostel]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/hostels/access-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostel, bssid: bssid.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't add it.");
      setBssid("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add it.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (point: AccessPoint) => {
    await adminFetch(`/api/admin/hostels/access-points?hostel=${encodeURIComponent(hostel)}&bssid=${encodeURIComponent(point.bssid)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-500">Wi-Fi access points (for the app)</label>
      {points === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : points.length === 0 ? (
        <p className="text-xs text-slate-400">None yet. The app learns them as students confirm, or add them here.</p>
      ) : (
        <ul className="space-y-1">
          {points.map((point) => (
            <li key={point.bssid} className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm">
              <Wifi className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="font-mono">{point.bssid}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                {point.source === "admin" ? `added by ${point.createdBy ?? "admin"}` : point.source === "crowd"
                  ? `${point.confirmations} confirmed${point.confirmations >= 3 ? " · trusted" : ""}` : "from the controller"}
              </span>
              <button type="button" className="glass-button !min-h-[32px] !px-2" aria-label={`Remove ${point.bssid}`} onClick={() => remove(point)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input className={`${GLASS_INPUT} flex-1 font-mono`} value={bssid} onChange={(e) => setBssid(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" />
        <button type="button" className="glass-button" disabled={busy || !bssid.trim()} onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
