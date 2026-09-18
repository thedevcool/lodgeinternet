"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapPinOff } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { displayName } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import { whatsappBotUrl } from "@/lib/whatsapp";
import { useCustomer } from "@/components/client/CustomerProvider";
import Container from "@/components/ui/Container";
import SearchField from "@/components/ui/SearchField";
import Monogram from "@/components/ui/Monogram";
import WhatsAppCard from "@/components/ui/WhatsAppCard";
import WhatsAppIcon from "@/components/ui/WhatsAppIcon";
import { ButtonLink } from "@/components/ui/Button";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/States";
import HeroPhones from "@/components/home/HeroPhones";
import { AboutBand, HowItWorks, SectionTitle } from "@/components/home/HomeSections";
import type { Hostel } from "@/types";

/**
 * Home — "find your hostel" first (hero → search → locations), then the
 * Figma marketing sections. Signed-in customers with a verified profile see
 * only their own hostel, exactly as before.
 */

type VerifiedProfile = { hostelId: string; hostelSlug: string; emailVerified: boolean };

/** A row in the locations list: a school, a location, or a standalone hostel. */
type Entry = {
  key: string;
  kind: "school" | "location" | "hostel";
  name: string;
  href: string;
  subtitle: string;
  empty?: boolean; // location with no hostels yet
};

export default function HomePage() {
  const dir = useHostelDirectory();
  const { user, ready } = useCustomer();
  const [profile, setProfile] = useState<VerifiedProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [query, setQuery] = useState("");
  const wa = whatsappBotUrl("Hi Lodge Internet");

  // ── Signed-in customers: load the profile (only verified ones are "locked in")
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setProfile(null);
      setProfileChecked(true);
      return;
    }
    let cancelled = false;
    setProfileChecked(false);
    (async () => {
      try {
        const idToken = await user.getIdToken().catch(() => "");
        const res = await apiFetch(`/api/auth/user?userId=${user.uid}`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProfile(data.profile?.emailVerified ? data.profile : null);
        }
      } catch {
        // Profile fetch failed — show the normal directory.
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, ready]);

  const myHostel: Hostel | undefined = profile ? dir.data?.hostels.find((h) => h.name === profile.hostelId) : undefined;

  // ── Top-level list: schools, standalone locations, standalone hostels ─────
  const entries = useMemo<Entry[]>(() => {
    if (!dir.data) return [];
    const schools: Entry[] = dir.data.schools.map((s) => {
      const n = dir.collagesBySchool.get(s.id)?.length ?? 0;
      return { key: `s-${s.id}`, kind: "school", name: displayName(s.name), href: `/${s.slug}`, subtitle: n === 0 ? "Coming soon" : plural(n, "college"), empty: n === 0 };
    });
    const locations: Entry[] = dir.data.collages
      .filter((c) => !c.schoolId)
      .map((c) => {
        const n = dir.hostelsByCollage.get(c.id)?.length ?? 0;
        return { key: `c-${c.id}`, kind: "location", name: displayName(c.name), href: `/${c.slug}`, subtitle: n === 0 ? "Coming soon" : plural(n, "hostel"), empty: n === 0 };
      });
    const hostels: Entry[] = dir.data.hostels
      .filter((h) => !h.collageId)
      .map((h) => ({ key: `h-${h.id}`, kind: "hostel", name: h.name, href: dir.plansPathFor(h), subtitle: "View plans" }));

    const byName = (a: Entry, b: Entry) => Number(a.empty) - Number(b.empty) || a.name.localeCompare(b.name);
    return [...schools.sort(byName), ...locations.sort(byName), ...hostels.sort(byName)];
  }, [dir]);

  // ── Search: locations (including colleges) and every hostel ──────────────
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q || !dir.data) return null;
    const locations: Entry[] = [
      ...entries.filter((e) => e.kind === "school" && e.name.toLowerCase().includes(q)),
      ...dir.data.collages
        .filter((c) => displayName(c.name).toLowerCase().includes(q))
        .map((c) => {
          const n = dir.hostelsByCollage.get(c.id)?.length ?? 0;
          return { key: `c-${c.id}`, kind: "location" as const, name: displayName(c.name), href: dir.locationPathFor(c), subtitle: plural(n, "hostel"), empty: n === 0 };
        }),
    ];
    const hostels: Entry[] = dir.data.hostels
      .filter((h) => h.name.toLowerCase().includes(q))
      .map((h) => {
        const parent = h.collageId ? dir.collageById.get(h.collageId) : undefined;
        return { key: `h-${h.id}`, kind: "hostel", name: h.name, href: dir.plansPathFor(h), subtitle: parent ? displayName(parent.name) : "View plans" };
      });
    return { locations, hostels };
  }, [q, dir, entries]);

  const waitingForProfile = Boolean(user) && !profileChecked;

  return (
    <Container wide>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="grid items-center gap-10 pt-4 md:grid-cols-[1.05fr_1fr] md:pt-14 lg:gap-16">
        <div>
          <h1 className="ui-display text-ink">
            Reliable Internet &amp; TV. <span className="text-accent-ink">Instant Access.</span>
          </h1>
          <p className="ui-body mt-4 max-w-md text-ink-2 md:mt-5 md:text-[19px] md:leading-7">
            Pick your hostel, choose a plan, get connected in seconds.
          </p>
          <div className="mt-8 hidden flex-wrap gap-3 md:flex">
            <ButtonLink href="#find">Get Started</ButtonLink>
            {wa && (
              <ButtonLink href={wa} external variant="gray">
                <WhatsAppIcon className="h-5 w-5 text-wa-ink" /> Talk on WhatsApp
              </ButtonLink>
            )}
          </div>
        </div>
        <HeroPhones className="hidden md:block" />
      </section>

      {/* ── Find your connection ─────────────────────────────────────────── */}
      <section id="find" className="scroll-mt-20 pt-8 md:pt-24">
        {dir.loading || waitingForProfile ? (
          <ListSkeleton rows={5} />
        ) : dir.error ? (
          <ErrorState onRetry={dir.retry} />
        ) : myHostel ? (
          <YourHostelCard hostel={myHostel} href={dir.plansPathFor(myHostel)} location={locationName(myHostel, dir.collageById)} />
        ) : (
          <>
            <SectionTitle eyebrow="Find your connection" title="Select your hostel" />
            <SearchField value={query} onChange={setQuery} placeholder="Search locations or hostels" className="md:max-w-xl" />

            <div className="mt-5">
              {results ? (
                <SearchResults locations={results.locations} hostels={results.hostels} query={query} />
              ) : entries.length === 0 ? (
                <EmptyState icon={<MapPinOff />} title="No hostels available yet" message="Please contact support." />
              ) : (
                <EntryList entries={entries} />
              )}
            </div>
          </>
        )}
      </section>

      <section className="pt-14 md:pt-28">
        <HowItWorks />
      </section>

      <section className="pt-14 md:hidden">
        <WhatsAppCard title="Get Lodge Internet faster on WhatsApp" prefill="Hi Lodge Internet, I'd like to check available plans" />
      </section>

      <section className="pt-14 md:pt-28">
        <AboutBand />
      </section>
    </Container>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Mobile: iOS grouped rows. Desktop: the Figma card grid. */
function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <>
      <GroupedList className="md:hidden">
        {entries.map((e) => (
          <ListRow
            key={e.key}
            href={e.href}
            leading={<Monogram name={e.name} kind={e.kind} />}
            title={e.name}
            subtitle={e.subtitle}
          />
        ))}
      </GroupedList>

      <div className="ui-stagger hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <Link
            key={e.key}
            href={e.href}
            className="group flex items-center gap-4 rounded-card bg-surface p-5 shadow-card transition duration-300 ease-ios hover:-translate-y-0.5 hover:shadow-float"
          >
            <Monogram name={e.name} kind={e.kind} />
            <div className="min-w-0 flex-1">
              <p className="ui-headline truncate text-ink">{e.name}</p>
              {e.empty ? (
                <p className="ui-subhead mt-0.5 text-ink-3">Coming soon</p>
              ) : (
                <p className="ui-subhead mt-0.5 text-accent-ink">
                  {e.kind === "hostel" ? "View plans available" : e.subtitle} <span aria-hidden>→</span>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function SearchResults({ locations, hostels, query }: { locations: Entry[]; hostels: Entry[]; query: string }) {
  if (locations.length === 0 && hostels.length === 0) {
    return <EmptyState icon={<MapPinOff />} title={`No results for “${query.trim()}”`} message="Check the spelling, or browse all locations." />;
  }
  return (
    <div className="space-y-6 md:max-w-xl">
      {locations.length > 0 && (
        <GroupedList header="Locations">
          {locations.map((e) => (
            <ListRow key={e.key} href={e.href} leading={<Monogram name={e.name} kind={e.kind} size="sm" />} title={e.name} subtitle={e.subtitle} />
          ))}
        </GroupedList>
      )}
      {hostels.length > 0 && (
        <GroupedList header="Hostels">
          {hostels.map((e) => (
            <ListRow key={e.key} href={e.href} leading={<Monogram name={e.name} size="sm" />} title={e.name} subtitle={e.subtitle} />
          ))}
        </GroupedList>
      )}
    </div>
  );
}

function YourHostelCard({ hostel, href, location }: { hostel: Hostel; href: string; location?: string }) {
  return (
    <div className="rounded-card bg-surface p-6 shadow-card sm:p-8 md:max-w-xl">
      <p className="ui-eyebrow text-accent-ink">Your hostel</p>
      <div className="mt-4 flex items-center gap-4">
        <Monogram name={hostel.name} size="lg" />
        <div className="min-w-0">
          <p className="ui-title-2 truncate text-ink">{hostel.name}</p>
          <p className="ui-subhead mt-0.5 text-ink-2">{location ?? "You’re locked in — tap to view your plans"}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <ButtonLink href={href}>Buy data</ButtonLink>
        <ButtonLink href="/dashboard" variant="gray">
          My codes
        </ButtonLink>
      </div>
    </div>
  );
}

function locationName(hostel: Hostel, collageById: Map<string, { name: string }>) {
  const parent = hostel.collageId ? collageById.get(hostel.collageId) : undefined;
  return parent ? displayName(parent.name) : undefined;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
