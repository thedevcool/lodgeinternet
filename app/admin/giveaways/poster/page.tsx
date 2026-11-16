"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { adminFetch } from "@/lib/apiClient";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { EmptyState, Panel } from "@/components/admin/ui";
import { BrandGlyph } from "@/components/ui/BrandMark";
import { formatDay, type GiveawayHostel, type GiveawayOverview } from "@/lib/giveaway";

/**
 * /admin/giveaways/poster?hostel=<id> — the poster a hostel's residents scan
 * to claim their welcome code. Print it (or save it as a PDF) and put it up
 * in the hostel.
 *
 * The QR code is the hostel's secret poster link on this website
 * (/welcome/<token>). It is drawn in the browser; nothing is sent anywhere.
 * When printing, globals.css hides the admin frame and everything marked
 * `print:hidden`, so the sheet carries the poster alone.
 */

export default function GiveawayPosterPage() {
  const hostelId = useSearchParams()?.get("hostel") || "";
  const [hostel, setHostel] = useState<GiveawayHostel | null>(null);
  const [gives, setGives] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch("/api/admin/giveaways")
      .then(async (res) => {
        const data: GiveawayOverview & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the poster");
        const found = data.hostels.find((h) => h.hostelId === hostelId) ?? null;
        setHostel(found);
        setGives(data.controllers.find((c) => c.id === found?.controllerId)?.gives ?? null);
        setLoaded(true);
      })
      .catch((err) => setError(err.message || "Could not load the poster"));
  }, [hostelId]);

  const settings = hostel?.giveaway ?? null;
  // The address a phone opens when it scans the poster.
  const link = settings && typeof window !== "undefined" ? `${window.location.origin}${settings.posterPath}` : "";

  return (
    <ProtectedRoute requireSuperAdmin>
      <div className="analytics-shell min-h-screen px-4 py-5 print:min-h-0 print:bg-white print:p-0">
        <div className="mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href="/admin/giveaways" className="glass-button">
            <ArrowLeft size={16} /> Welcome codes
          </Link>
          {settings && (
            <button type="button" onClick={() => window.print()} className="glass-primary">
              <Printer size={16} /> Print or save as PDF
            </button>
          )}
        </div>

        {error ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700 break-words">{error}</div>
        ) : !loaded ? (
          <div className="mx-auto max-w-xl">
            <Panel>
              <EmptyState title="Loading the poster…" />
            </Panel>
          </div>
        ) : !hostel || !settings ? (
          <div className="mx-auto max-w-xl">
            <Panel>
              <EmptyState title="This hostel has no welcome codes set up yet.">
                Set it up on the Welcome codes page, then come back for its poster.
              </EmptyState>
            </Panel>
          </div>
        ) : (
          <>
            {hostel.status !== "open" && (
              <p className="glass-alert mx-auto mb-4 max-w-xl print:hidden">
                This hostel&apos;s welcome codes are not open right now, so anyone scanning this poster will be told so.
              </p>
            )}
            <Poster hostel={hostel.hostel} link={link} gives={gives} endsAt={settings.endsAt} />
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}

/** The sheet itself: black on white so it prints cleanly on any printer. */
function Poster({ hostel, link, gives, endsAt }: { hostel: string; link: string; gives: string | null; endsAt: string | null }) {
  return (
    <section
      aria-label={`Welcome code poster for ${hostel}`}
      className="mx-auto flex max-w-xl flex-col items-center rounded-[28px] bg-white px-6 py-10 text-center text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,.12)] print:max-w-none print:rounded-none print:px-0 print:py-6 print:shadow-none"
    >
      <div className="flex items-center gap-3">
        <BrandGlyph className="h-11 w-11" />
        <span className="text-xl font-semibold tracking-tight">Lodge Internet</span>
      </div>

      <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-blue-700">Welcome to {hostel}</p>
      <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Your first data code is free</h1>
      {gives && <p className="mt-3 text-xl font-semibold text-slate-700">{gives}</p>}

      <div className="mt-8 rounded-3xl border-4 border-slate-900 p-4">
        {link && <QRCodeSVG value={link} size={260} level="M" marginSize={0} title={`Claim a welcome code at ${hostel}`} />}
      </div>

      <ol className="mt-8 w-full max-w-sm space-y-3 text-left text-lg">
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white">1</span>
          <span>Scan the code with your phone&apos;s camera.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white">2</span>
          <span>Create your Lodge Internet account.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white">3</span>
          <span>Get your free code and connect.</span>
        </li>
      </ol>

      <p className="mt-8 text-sm text-slate-600">
        One code per person, for {hostel} residents.{endsAt ? ` Ends ${formatDay(endsAt)}.` : ""}
      </p>
      <p className="mt-2 break-all font-mono text-xs text-slate-500">{link}</p>
    </section>
  );
}
