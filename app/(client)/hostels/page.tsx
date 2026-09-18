"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { displayName } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import SearchField from "@/components/ui/SearchField";
import Badge from "@/components/ui/Badge";
import { Chip, ChipRow } from "@/components/ui/Chips";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/States";
import HostelList from "@/components/hostels/HostelList";
import type { Hostel } from "@/types";

/**
 * /hostels — every hostel, grouped by location (Figma "Select hostel").
 * Chips filter by location; search matches hostel and location names.
 */
type Group = { id: string; title: string; href?: string; hostels: Hostel[] };

export default function HostelsPage() {
  const dir = useHostelDirectory();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  // One group per location that has hostels, plus standalone hostels at the end.
  const groups = useMemo<Group[]>(() => {
    if (!dir.data) return [];
    const byName = (a: Hostel, b: Hostel) => a.name.localeCompare(b.name);
    const located: Group[] = dir.data.collages
      .map((c) => ({
        id: c.id,
        title: displayName(c.name),
        href: dir.locationPathFor(c),
        hostels: [...(dir.hostelsByCollage.get(c.id) ?? [])].sort(byName),
      }))
      .filter((g) => g.hostels.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
    const standalone = dir.data.hostels.filter((h) => !h.collageId).sort(byName);
    return standalone.length ? [...located, { id: "other", title: "Other hostels", hostels: standalone }] : located;
  }, [dir]);

  const q = query.trim().toLowerCase();
  const visible = groups
    .filter((g) => filter === "all" || g.id === filter)
    .map((g) => ({
      ...g,
      // a location-name match shows the whole location; otherwise match hostels
      hostels: !q || g.title.toLowerCase().includes(q) ? g.hostels : g.hostels.filter((h) => h.name.toLowerCase().includes(q)),
    }))
    .filter((g) => g.hostels.length > 0);

  return (
    <Container wide>
      <PageHeader
        title="Select your hostel"
        subtitle="Choose your hostel to view available internet plans."
        crumbs={[{ label: "Home", href: "/" }, { label: "Hostels" }]}
      />

      {dir.loading ? (
        <ListSkeleton rows={6} />
      ) : dir.error ? (
        <ErrorState onRetry={dir.retry} />
      ) : (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <ChipRow className="md:flex-1">
              <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>
              {groups.map((g) => (
                <Chip key={g.id} selected={filter === g.id} onClick={() => setFilter(g.id)}>
                  {g.title}
                </Chip>
              ))}
            </ChipRow>
            <SearchField value={query} onChange={setQuery} placeholder="Search for your hostel" className="md:w-80 md:shrink-0" />
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={<SearchX />} title="No hostels match" message="Try another name, or pick “All”." />
          ) : (
            <div className="mt-8 space-y-10">
              {visible.map((g) => (
                <section key={g.id} aria-labelledby={`grp-${g.id}`}>
                  <div className="mb-3 flex items-center gap-2.5 border-b border-hairline pb-3 md:mb-5">
                    <h2 id={`grp-${g.id}`} className="ui-title-3 text-ink">
                      {g.href ? (
                        <Link href={g.href} className="hover:text-accent-ink">
                          {g.title}
                        </Link>
                      ) : (
                        g.title
                      )}
                    </h2>
                    <Badge tone="accent">
                      {g.hostels.length} active hostel{g.hostels.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <HostelList
                    hostels={g.hostels}
                    hrefFor={dir.plansPathFor}
                    locationFor={() => (g.id === "other" ? undefined : g.title)}
                  />
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </Container>
  );
}
