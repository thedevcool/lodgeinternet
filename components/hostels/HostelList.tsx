"use client";

import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import Monogram from "@/components/ui/Monogram";
import Badge from "@/components/ui/Badge";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import type { Hostel } from "@/types";

/**
 * A list of hostels.
 *   Phones:  iOS grouped rows (tile · name · location · chevron).
 *   Desktop: the Figma "Select hostel" cards (name · ● Active · 📍 location ·
 *            full-width View Plans button).
 */
export default function HostelList({
  hostels,
  hrefFor,
  locationFor,
}: {
  hostels: Hostel[];
  hrefFor: (h: Hostel) => string;
  locationFor: (h: Hostel) => string | undefined;
}) {
  return (
    <>
      <GroupedList className="md:hidden">
        {hostels.map((h) => (
          <ListRow
            key={h.id}
            href={hrefFor(h)}
            leading={<Monogram name={h.name} />}
            title={h.name}
            subtitle={locationFor(h) ?? "Internet plans available"}
          />
        ))}
      </GroupedList>

      <div className="ui-stagger hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
        {hostels.map((h) => {
          const location = locationFor(h);
          return (
            <div key={h.id} className="flex flex-col rounded-card bg-surface p-5 shadow-card">
              <div className="flex items-start gap-3.5">
                <Monogram name={h.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="ui-headline truncate text-ink">{h.name}</p>
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  </div>
                  {location && (
                    <p className="ui-subhead mt-1 flex items-center gap-1 text-ink-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{location}</span>
                    </p>
                  )}
                </div>
              </div>
              <Link
                href={hrefFor(h)}
                className="mt-5 inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-accent text-[15px] font-semibold text-white transition active:scale-[0.97] hover:bg-accent/90"
              >
                View Plans <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
