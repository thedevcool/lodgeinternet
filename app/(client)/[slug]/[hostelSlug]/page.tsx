"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { displayName, toHostelSlug } from "@/lib/hostelSlug";
import { useHostelDirectory } from "@/lib/useHostelDirectory";
import { ErrorState } from "@/components/ui/States";
import LocationView, { LocationSkeleton } from "@/components/hostels/LocationView";

/**
 * /{schoolSlug}/{collegeSlug} — a college's hostels.
 *
 * NOTE: the segment is named [hostelSlug] but here it holds the COLLEGE slug.
 * It can't be renamed: the sibling route [hostelSlug]/plans shares this
 * dynamic segment, and Next requires one name per level.
 */
export default function CollegePage({ params }: { params: { slug: string; hostelSlug: string } }) {
  const router = useRouter();
  const dir = useHostelDirectory();

  const school = dir.data?.schools.find((s) => s.slug === params.slug);
  const college = school
    ? dir.data?.collages.find((c) => c.slug === params.hostelSlug && c.schoolId === school.id)
    : undefined;

  // Unknown school/college → home (unchanged).
  useEffect(() => {
    if (dir.data && (!school || !college)) router.replace("/");
  }, [dir.data, school, college, router]);

  if (dir.error) return <ErrorState onRetry={dir.retry} />;
  if (!school || !college) return <LocationSkeleton />;

  const schoolName = displayName(school.name);
  const name = displayName(college.name);
  return (
    <LocationView
      title={name}
      crumbs={[{ label: "Properties", href: "/hostels" }, { label: schoolName, href: `/${school.slug}` }, { label: name }]}
      back={{ href: `/${school.slug}`, label: schoolName }}
      hostels={dir.hostelsByCollage.get(college.id) ?? []}
      // Same URL as before: /{college}/{hostel}/plans
      hrefFor={(h) => `/${college.slug}/${toHostelSlug(h.name)}/plans`}
      whatsappPrefill={`Hi Lodge Internet — ${college.name}`}
      emptyText="No hostels in this college yet."
    />
  );
}
