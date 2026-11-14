"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/States";
import { displayName } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import type { Hostel } from "@/types";

/**
 * The live hostel list, where a post writes `{{hostels}}`. Posts never type a
 * hostel's name (backend/app/blog/WRITING.md): this list comes from the same
 * directory as /hostels, so it's always current, and a student who searches
 * for their hostel lands on its plans page in one tap.
 */
export default function BlogHostels() {
  const dir = useHostelDirectory();

  if (dir.loading) {
    return (
      <div className="mt-5 space-y-2" aria-label="Loading hostels">
        <Skeleton className="h-12 w-full rounded-inner" />
        <Skeleton className="h-12 w-full rounded-inner" />
        <Skeleton className="h-12 w-full rounded-inner" />
      </div>
    );
  }
  if (!dir.data) {
    return (
      <p className="mt-5 text-[17px] leading-[1.65] text-ink-2">
        <Link href="/hostels" className="font-medium text-accent-ink underline underline-offset-2">
          See every hostel we serve
        </Link>
      </p>
    );
  }

  const byName = (a: Hostel, b: Hostel) => a.name.localeCompare(b.name);
  const groups = dir.data.collages
    .map((c) => ({ id: c.id, title: displayName(c.name), hostels: [...(dir.hostelsByCollage.get(c.id) ?? [])].sort(byName) }))
    .filter((g) => g.hostels.length > 0)
    .sort((a, b) => a.title.localeCompare(b.title));
  const standalone = dir.data.hostels.filter((h) => !h.collageId).sort(byName);
  if (standalone.length) groups.push({ id: "other", title: "Other hostels", hostels: standalone });

  return (
    <div className="mt-5 space-y-5">
      {groups.map((group) => (
        <section key={group.id}>
          <p className="ui-footnote font-semibold uppercase tracking-[0.04em] text-ink-3">{group.title}</p>
          <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-card bg-surface shadow-card">
            {group.hostels.map((hostel) => (
              <li key={hostel.id}>
                <Link href={dir.plansPathFor(hostel)} className="flex min-h-[48px] items-center gap-3 px-4 py-3 hover:bg-ink/[0.03]">
                  <span className="ui-body min-w-0 flex-1 text-ink">{displayName(hostel.name)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
