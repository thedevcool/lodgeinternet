"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PlansRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}

// The plans page has moved to /[hostelSlug]/plans
// This file redirects legacy /plans links back to the hostel selector.
