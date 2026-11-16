"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Gift, Printer, RefreshCw, Users } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { AdminPage, EmptyState, GLASS_INPUT, Modal, Panel, SegToggle } from "@/components/admin/ui";
import {
  STATUS_CHIP,
  describeSync,
  endOfDayIso,
  formatDay,
  formatMoment,
  isSwitchedOn,
  isoToDateInput,
  lastDay,
  startOfDayIso,
  statusLabel,
  toDateInput,
  type BonusSyncReport,
  type GiveawayHostel,
  type GiveawayOverview,
} from "@/lib/giveaway";

/**
 * /admin/giveaways — welcome codes: the free code a newly set-up hostel gives
 * each resident who creates an account (backend: app/routers/
 * admin_giveaways.py). Superadmin only, because it gives stock away.
 *
 * Four things happen here:
 *  - the bonus words, which tell the sync which voucher groups on a
 *    controller are free codes and must never be sold;
 *  - each hostel's switch, dates, who may claim and ceiling;
 *  - fetching the codes: "Sync codes" on a switched-on hostel reads its
 *    controller's bonus groups (and nothing for sale), and switching a hostel
 *    on does the same straight away. The codes are the controller's, so every
 *    switched-on hostel on it gives from the same ones;
 *  - each hostel's poster (its QR code opens the claim) and its claims.
 *
 * The codes themselves are uploaded on the controller, not here.
 */

type Claim = { claimedAt: string | null; email: string; code: string; gives: string; group: string };

/** What the last "Sync codes" on this page found, shown under the hostel it was pressed on. */
type SyncResult = { hostelId: string; ok: boolean; found: string; skipped: string[] };

export default function AdminGiveawaysPage() {
  const searchParams = useSearchParams();
  // The Controllers page links here with ?hostel=<id> to open one hostel.
  const hostelFromLink = searchParams?.get("hostel") || "";

  const [overview, setOverview] = useState<GiveawayOverview | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<GiveawayHostel | null>(null);
  const [claimsFor, setClaimsFor] = useState<GiveawayHostel | null>(null);
  const [openedFromLink, setOpenedFromLink] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const load = useCallback(() => {
    setError("");
    adminFetch("/api/admin/giveaways")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the welcome codes");
        setOverview(data);
      })
      .catch((err) => setError(err.message || "Could not load the welcome codes"));
  }, []);

  useEffect(load, [load]);

  // Fetch the welcome codes from a hostel's controller and say what came back.
  const syncCodes = async (hostel: GiveawayHostel) => {
    setSyncing(hostel.hostelId);
    setSyncResult(null);
    try {
      const res = await adminFetch(`/api/admin/giveaways/${encodeURIComponent(hostel.hostelId)}/sync`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not fetch the codes");
      const words = { bonus: overview?.bonusWords ?? [], blocked: overview?.blockedWords ?? [] };
      const said = describeSync(data.report as BonusSyncReport, hostel.controller || "the controller", words);
      setSyncResult({ hostelId: hostel.hostelId, ...said });
    } catch (err: any) {
      setSyncResult({ hostelId: hostel.hostelId, ok: false, found: err.message || "Could not fetch the codes", skipped: [] });
    } finally {
      setSyncing(null);
      // Reload either way: the counts on every hostel of that controller moved.
      load();
    }
  };

  useEffect(() => {
    if (!overview || openedFromLink || !hostelFromLink) return;
    const target = overview.hostels.find((h) => h.hostelId === hostelFromLink);
    if (target) setEditing(target);
    setOpenedFromLink(true);
  }, [overview, hostelFromLink, openedFromLink]);

  const onControllers = overview?.hostels.filter((h) => h.controllerId) ?? [];
  const standalone = overview?.hostels.filter((h) => !h.controllerId) ?? [];

  return (
    <ProtectedRoute requireSuperAdmin>
      <AdminPage eyebrow="GROWTH" title="Welcome codes" subtitle="A free code for each new resident of a newly set-up hostel" width="narrow">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700 break-words">
            {error}{" "}
            <button type="button" onClick={load} className="glass-link">
              Try again
            </button>
          </div>
        ) : !overview ? (
          <Panel>
            <EmptyState title="Loading welcome codes…" />
          </Panel>
        ) : (
          <>
            <BonusCodes overview={overview} onSaved={load} />

            <Panel
              eyebrow="HOSTELS"
              title="Who is giving codes"
              description="Switch a hostel on and set its dates: its controller's codes are fetched straight away. Then print its poster. Residents scan the poster to claim."
            >
              {onControllers.length === 0 ? (
                <EmptyState title="No hostel is on a controller yet.">
                  Add a hostel to a controller on the Controllers page first: that is where its bonus codes come from.
                </EmptyState>
              ) : (
                <ul className="space-y-3">
                  {onControllers.map((hostel) => (
                    <HostelRow
                      key={hostel.hostelId}
                      hostel={hostel}
                      syncing={syncing === hostel.hostelId}
                      syncBusy={syncing !== null}
                      syncResult={syncResult?.hostelId === hostel.hostelId ? syncResult : null}
                      onSync={() => syncCodes(hostel)}
                      onEdit={() => setEditing(hostel)}
                      onClaims={() => setClaimsFor(hostel)}
                    />
                  ))}
                </ul>
              )}
              {standalone.length > 0 && (
                <p className="mt-4 text-sm text-slate-500">
                  Not on a controller, so no welcome codes yet: {standalone.map((h) => h.hostel).join(", ")}.
                </p>
              )}
            </Panel>
          </>
        )}

        {editing && (
          <SettingsModal
            hostel={editing}
            onClose={() => setEditing(null)}
            onSaved={(switchedOn) => {
              const hostel = editing;
              setEditing(null);
              // Switching a hostel on fetches its controller's codes at once,
              // so it never sits "on" with codes waiting on the controller.
              if (switchedOn) void syncCodes(hostel);
              else load();
            }}
          />
        )}
        {claimsFor && <ClaimsModal hostel={claimsFor} onClose={() => setClaimsFor(null)} />}
      </AdminPage>
    </ProtectedRoute>
  );
}

/* ── Bonus codes and the words that mark them ── */

function BonusCodes({ overview, onSaved }: { overview: GiveawayOverview; onSaved: () => void }) {
  const [words, setWords] = useState(overview.bonusWords.join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const withCodes = overview.controllers.filter((c) => c.bonusAvailable > 0 || c.bonusClaimed > 0 || c.lastBonusSync);
  const skipWords = { bonus: overview.bonusWords, blocked: overview.blockedWords };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/giveaways/bonus-words", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: words.split(",").map((w) => w.trim()).filter(Boolean) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the bonus words");
      setWords((data.words as string[]).join(", "));
      setMessage({ ok: true, text: "Saved. It takes effect at the next sync." });
      onSaved();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || "Could not save the bonus words" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      eyebrow="BONUS CODES"
      title="Codes ready to give out"
      description={
        <>
          Upload them on the controller as a voucher group named like a plan, with a bonus word in the name, for example{" "}
          <span className="break-all font-mono text-slate-700">BONUS|2GB|3|1|0</span> (name, data, devices, days, price 0).
          Then press Sync codes on a hostel below. A group with a bonus word is never sold.
        </>
      }
    >
      {withCodes.length === 0 ? (
        <EmptyState icon={<Gift size={22} />} title="No bonus codes on any controller yet.">
          Create a bonus voucher group on a controller, switch a hostel on below, then press Sync codes on it.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {withCodes.map((controller) => {
            // What the latest fetch skipped stays here until the next one, so
            // a group whose name doesn't fit is seen and not guessed at.
            const last = controller.lastBonusSync;
            const skipped = last ? describeSync(last, controller.name, skipWords).skipped : [];
            return (
              <li key={controller.id} className="glass-card">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-900">{controller.name}</p>
                    <p className="text-sm text-slate-500">{controller.gives || "None ready to give out"}</p>
                  </div>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{controller.bonusAvailable}</span> ready ·{" "}
                    {controller.bonusClaimed} claimed
                  </p>
                </div>
                {last && <p className="mt-1 text-xs text-slate-500">Codes last fetched {formatMoment(last.ranAt)}</p>}
                {skipped.map((line) => (
                  <p key={line} className="mt-2 break-words rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {line}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={save} className="mt-5 space-y-2">
        <label htmlFor="bonus-words" className="block text-sm font-semibold text-slate-800">
          Bonus words
        </label>
        <p className="text-sm text-slate-500">
          A voucher group with any of these words in its name is a welcome code. Separate words with commas.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="bonus-words"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            placeholder={overview.defaultBonusWords.join(", ")}
            className={`${GLASS_INPUT} min-w-0 sm:flex-1`}
          />
          <button type="submit" disabled={saving} className="glass-primary">
            {saving ? "Saving…" : "Save words"}
          </button>
        </div>
        {message && (
          <p className={`rounded-xl px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.text}
          </p>
        )}
      </form>
    </Panel>
  );
}

/* ── One hostel ── */

function HostelRow({
  hostel,
  syncing,
  syncBusy,
  syncResult,
  onSync,
  onEdit,
  onClaims,
}: {
  hostel: GiveawayHostel;
  /** This hostel's fetch is running. */
  syncing: boolean;
  /** Some hostel's fetch is running: one at a time. */
  syncBusy: boolean;
  syncResult: SyncResult | null;
  onSync: () => void;
  onEdit: () => void;
  onClaims: () => void;
}) {
  const settings = hostel.giveaway;
  const ceiling = settings?.maxCodes ? ` of ${settings.maxCodes}` : "";
  return (
    <li className="glass-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold text-slate-900">{hostel.hostel}</p>
          <p className="text-sm text-slate-500">
            {hostel.controller} · {hostel.bonusAvailable} bonus code{hostel.bonusAvailable === 1 ? "" : "s"} ready
          </p>
        </div>
        <span className={`text-xs ${STATUS_CHIP[hostel.status]}`}>{statusLabel(hostel)}</span>
      </div>
      {settings && (
        <p className="mt-2 text-sm text-slate-600">
          {formatDay(settings.startsAt)} to {formatDay(settings.endsAt)} ·{" "}
          {settings.openTo === "new" ? "new accounts only" : "everyone at the hostel"} · {hostel.claimed}
          {ceiling} claimed
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className="glass-button">
          {settings ? "Change" : "Set up"}
        </button>
        {isSwitchedOn(hostel) && (
          <button type="button" onClick={onSync} disabled={syncBusy} className="glass-button">
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Fetching codes…" : "Sync codes"}
          </button>
        )}
        {settings && (
          <Link href={`/admin/giveaways/poster?hostel=${encodeURIComponent(hostel.hostelId)}`} className="glass-button">
            <Printer size={16} /> Poster
          </Link>
        )}
        {hostel.claimed > 0 && (
          <button type="button" onClick={onClaims} className="glass-button">
            <Users size={16} /> Claims
          </button>
        )}
      </div>
      {syncResult && (
        <div role="status" className="mt-3 space-y-2 text-sm">
          <p className={`break-words rounded-xl px-3 py-2 ${syncResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {syncResult.found}
          </p>
          {syncResult.skipped.map((line) => (
            <p key={line} className="break-words rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              {line}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

/* ── A hostel's settings ── */

function SettingsModal({
  hostel,
  onClose,
  onSaved,
}: {
  hostel: GiveawayHostel;
  onClose: () => void;
  /** `switchedOn`: the hostel was saved with its switch on. */
  onSaved: (switchedOn: boolean) => void;
}) {
  const current = hostel.giveaway;
  const today = toDateInput(new Date());
  const [enabled, setEnabled] = useState(current ? current.enabled : true);
  const [firstDay, setFirstDay] = useState(isoToDateInput(current?.startsAt ?? null) || today);
  const [finalDay, setFinalDay] = useState(isoToDateInput(current?.endsAt ?? null) || lastDay(today, 7));
  const [openTo, setOpenTo] = useState<"new" | "everyone">(current?.openTo ?? "new");
  const [maxCodes, setMaxCodes] = useState(current?.maxCodes ? String(current.maxCodes) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/giveaways/${encodeURIComponent(hostel.hostelId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          startsAt: firstDay ? startOfDayIso(firstDay) : null,
          endsAt: finalDay ? endOfDayIso(finalDay) : null,
          openTo,
          maxCodes: maxCodes.trim() ? Number(maxCodes) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      onSaved(enabled);
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const replacePoster = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/giveaways/${encodeURIComponent(hostel.hostelId)}/poster`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not replace the poster link");
      onSaved(false);
    } catch (err: any) {
      setError(err.message || "Could not replace the poster link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      title={<span className="break-words">Welcome codes at {hostel.hostel}</span>}
      footer={
        <>
          <button type="button" className="glass-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="glass-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-5 text-sm text-slate-600">
        <p className={hostel.bonusAvailable > 0 ? "rounded-xl bg-blue-50 px-3 py-2 text-blue-800" : "rounded-xl bg-amber-50 px-3 py-2 text-amber-800"}>
          {hostel.bonusAvailable > 0
            ? `${hostel.controller} holds ${hostel.bonusAvailable} bonus code${hostel.bonusAvailable === 1 ? "" : "s"} ready to give out.`
            : `${hostel.controller} has no bonus codes here yet. Saving with the switch on fetches them from the controller.`}
        </p>

        <label className="flex min-h-[44px] items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 shrink-0 rounded border-slate-300"
          />
          <span className="font-semibold text-slate-900">Give welcome codes at this hostel</span>
        </label>

        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-800">First day</span>
              <input type="date" value={firstDay} onChange={(e) => setFirstDay(e.target.value)} className={GLASS_INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-800">Last day</span>
              <input type="date" value={finalDay} min={firstDay} onChange={(e) => setFinalDay(e.target.value)} className={GLASS_INPUT} />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="glass-button" disabled={!firstDay} onClick={() => setFinalDay(lastDay(firstDay, 7))}>
              One week
            </button>
            <button type="button" className="glass-button" disabled={!firstDay} onClick={() => setFinalDay(lastDay(firstDay, 14))}>
              Two weeks
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 font-semibold text-slate-800">Who can claim</p>
          <SegToggle
            value={openTo}
            onChange={setOpenTo}
            options={[
              { value: "new", label: "New accounts only" },
              { value: "everyone", label: "Everyone at the hostel" },
            ]}
          />
          <p className="mt-2">
            {openTo === "new"
              ? "Only accounts created on or after the first day. An account that moved in from another hostel doesn't count."
              : "Any resident with a confirmed account, however old."}{" "}
            Either way it is one code per account and per phone number.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block font-semibold text-slate-800">Most codes to give out here</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={maxCodes}
            onChange={(e) => setMaxCodes(e.target.value)}
            placeholder="No limit"
            className={GLASS_INPUT}
          />
          <span className="mt-1 block">Leave empty to give until the controller&apos;s bonus codes run out.</span>
        </label>

        {current && (
          <div className="rounded-2xl border border-white/80 bg-white/60 p-3">
            <p className="font-semibold text-slate-800">Poster link</p>
            <p className="mt-1">
              If the poster&apos;s photo is being passed around, replace its link. Every poster printed before stops working,
              so print a new one.
            </p>
            <button type="button" className="glass-button mt-2 text-rose-700" onClick={replacePoster} disabled={busy}>
              Replace the poster link
            </button>
          </div>
        )}

        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}

/* ── A hostel's claims ── */

function ClaimsModal({ hostel, onClose }: { hostel: GiveawayHostel; onClose: () => void }) {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch(`/api/admin/giveaways/${encodeURIComponent(hostel.hostelId)}/claims`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the claims");
        setClaims(data.claims);
      })
      .catch((err) => setError(err.message || "Could not load the claims"));
  }, [hostel.hostelId]);

  return (
    <Modal open onClose={onClose} title={<span className="break-words">Claims at {hostel.hostel}</span>}>
      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : !claims ? (
        <EmptyState title="Loading claims…" />
      ) : claims.length === 0 ? (
        <EmptyState title="Nobody has claimed here yet." />
      ) : (
        <ul className="divide-y divide-white/80 text-sm">
          {claims.map((claim, index) => (
            <li key={`${claim.code}-${index}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="break-all font-medium text-slate-900">{claim.email}</p>
                <p className="text-slate-500">{claim.gives}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-slate-700">{claim.code}</p>
                <p className="text-xs text-slate-500">{claim.claimedAt ? new Date(claim.claimedAt).toLocaleString() : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
