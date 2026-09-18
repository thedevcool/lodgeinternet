"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { displayName, toHostelSlug } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Monogram from "@/components/ui/Monogram";
import WhatsAppCard from "@/components/ui/WhatsAppCard";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { EmptyState, ErrorState } from "@/components/ui/States";
import LocationView, { LocationSkeleton } from "@/components/hostels/LocationView";
import { GraduationCap } from "lucide-react";

/**
 * /{slug} resolves, in this order (unchanged):
 *   1. a school   → its colleges
 *   2. a location → its hostels
 *   3. a standalone hostel → redirect to /{slug}/plans
 *   4. anything else → redirect home
 */
export default function LocationPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const dir = useHostelDirectory();

  const school = dir.data?.schools.find((s) => s.slug === params.slug);
  const collage = school ? undefined : dir.data?.collages.find((c) => c.slug === params.slug);
  const flatHostel =
    school || collage
      ? undefined
      : dir.data?.hostels.find((h) => toHostelSlug(h.name) === params.slug && !h.collageId);

  // Redirect cases (3 and 4) — only once the data has loaded.
  useEffect(() => {
    if (!dir.data || school || collage) return;
    router.replace(flatHostel ? `/${params.slug}/plans` : "/");
  }, [dir.data, school, collage, flatHostel, params.slug, router]);

  if (dir.error) return <ErrorState onRetry={dir.retry} />;
  if (!dir.data || (!school && !collage)) return <LocationSkeleton />;

  // ── School → colleges ─────────────────────────────────────────────────────
  if (school) {
    const colleges = [...(dir.collagesBySchool.get(school.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const name = displayName(school.name);
    return (
      <Container wide>
        <PageHeader
          title={name}
          crumbs={[{ label: "Properties", href: "/hostels" }, { label: name }]}
          back={{ href: "/", label: "Locations" }}
          subtitle="Choose your college to see its hostels."
        />
        {colleges.length === 0 ? (
          <EmptyState icon={<GraduationCap />} title="No colleges in this school yet." />
        ) : (
          <GroupedList className="md:max-w-2xl">
            {colleges.map((c) => {
              const n = dir.hostelsByCollage.get(c.id)?.length ?? 0;
              return (
                <ListRow
                  key={c.id}
                  href={`/${school.slug}/${c.slug}`}
                  leading={<Monogram name={c.name} kind="location" />}
                  title={displayName(c.name)}
                  subtitle={n === 0 ? "Coming soon" : `${n} hostel${n === 1 ? "" : "s"}`}
                />
              );
            })}
          </GroupedList>
        )}
        <WhatsAppCard className="mt-10 md:max-w-xl" prefill={`Hi Lodge Internet — ${school.name}`} />
      </Container>
    );
  }

  // ── Location → hostels ────────────────────────────────────────────────────
  const loc = collage!;
  const name = displayName(loc.name);
  return (
    <LocationView
      title={name}
      crumbs={[{ label: "Properties", href: "/hostels" }, { label: name }]}
      back={{ href: "/", label: "Locations" }}
      hostels={dir.hostelsByCollage.get(loc.id) ?? []}
      // Same URL as before: /{location}/{hostel}/plans
      hrefFor={(h) => `/${params.slug}/${toHostelSlug(h.name)}/plans`}
      whatsappPrefill={`Hi Lodge Internet — ${loc.name}`}
      emptyText="No hostels in this location yet."
    />
  );
}
