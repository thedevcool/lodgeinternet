"use client";

import PlansScreen from "@/components/plans/PlansScreen";

/** /{hostelSlug}/plans — plans & checkout for a standalone hostel. */
export default function HostelPlansPage({ params }: { params: { slug: string } }) {
  return <PlansScreen params={{ slug: params.slug }} />;
}
