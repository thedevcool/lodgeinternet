"use client";

import { useState, type ReactNode } from "react";
import { Building2, SearchX } from "lucide-react";
import Container from "@/components/ui/Container";
import PageHeader, { type Crumb } from "@/components/ui/PageHeader";
import SearchField from "@/components/ui/SearchField";
import Badge from "@/components/ui/Badge";
import WhatsAppCard from "@/components/ui/WhatsAppCard";
import { EmptyState, ListSkeleton, Skeleton } from "@/components/ui/States";
import type { BackLink } from "@/components/client/PageChrome";
import HostelList from "./HostelList";
import type { Hostel } from "@/types";

/**
 * A location's hostels (Figma "Modare frame"): breadcrumb, large title,
 * hostel count, in-location search (useful — one location has 17 hostels),
 * the hostels, then the WhatsApp card.
 */
export default function LocationView({
  title,
  crumbs,
  back,
  hostels,
  hrefFor,
  whatsappPrefill,
  emptyText = "No hostels here yet.",
}: {
  title: string;
  crumbs: Crumb[];
  back: BackLink;
  hostels: Hostel[];
  hrefFor: (h: Hostel) => string;
  whatsappPrefill: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = [...hostels]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((h) => !q || h.name.toLowerCase().includes(q));

  return (
    <Container wide>
      <PageHeader
        title={title}
        crumbs={crumbs}
        back={back}
        subtitle="Choose your hostel to view available internet plans."
        aside={
          hostels.length > 0 ? (
            <Badge tone="accent" dot>
              {hostels.length} hostel{hostels.length === 1 ? "" : "s"}
            </Badge>
          ) : undefined
        }
      />

      {hostels.length === 0 ? (
        <EmptyState icon={<Building2 />} title={emptyText} message="Check back soon — or reach us on WhatsApp." />
      ) : (
        <>
          {hostels.length > 4 && (
            <SearchField value={query} onChange={setQuery} placeholder="Search your hostel" className="mb-5 md:max-w-md" />
          )}
          {shown.length === 0 ? (
            <EmptyState icon={<SearchX />} title={`No hostel called “${query.trim()}”`} message="Check the spelling and try again." />
          ) : (
            <HostelList hostels={shown} hrefFor={hrefFor} locationFor={() => title} />
          )}
        </>
      )}

      <WhatsAppCard
        className="mt-10 md:max-w-xl"
        title="Get Lodge Internet faster on WhatsApp"
        message="We’re here to help — pick a plan and get your code right in the chat."
        prefill={whatsappPrefill}
      />
    </Container>
  );
}

/** Placeholder while the location resolves (keeps the layout from jumping). */
export function LocationSkeleton({ children }: { children?: ReactNode }) {
  return (
    <Container wide>
      <div className="pb-6 pt-2 md:pb-8 md:pt-10">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-9 w-56" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      </div>
      {children ?? <ListSkeleton rows={5} />}
    </Container>
  );
}
