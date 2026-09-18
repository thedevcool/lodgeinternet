"use client";

import PlansScreen from "@/components/plans/PlansScreen";

/** /{collageSlug}/{hostelSlug}/plans — plans & checkout for a hostel in a location. */
export default function CollageHostelPlansPage({ params }: { params: { slug: string; hostelSlug: string } }) {
  return <PlansScreen params={{ slug: params.slug, hostelSlug: params.hostelSlug }} />;
}
