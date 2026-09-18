"use client";

import { apiFetch } from "@/lib/apiClient";
import { toHostelSlug } from "@/lib/hostelSlug";
import type { Hostel, HostelCollage, HostelSchool } from "@/types";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";

export default function SchoolCollegePage({
  params,
}: { params: { slug: string; hostelSlug: string } }) {
  const router = useRouter();
  const [school, setSchool] = useState<HostelSchool | null>(null);
  const [college, setCollege] = useState<HostelCollage | null>(null);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/hostel-schools").then((r) => r.json()),
      apiFetch("/api/hostel-collages").then((r) => r.json()),
      apiFetch("/api/hostels").then((r) => r.json()),
    ]).then(([schoolsData, collegesData, hostelsData]) => {
      const foundSchool = (schoolsData.schools || []).find((s: HostelSchool) => s.slug === params.slug);
      const foundCollege = (collegesData.collages || []).find(
        (c: HostelCollage) => c.slug === params.hostelSlug && c.schoolId === foundSchool?.id,
      );
      if (!foundSchool || !foundCollege) {
        router.replace("/");
        return;
      }
      setSchool(foundSchool);
      setCollege(foundCollege);
      setHostels((hostelsData.hostels || []).filter((h: Hostel) => h.collageId === foundCollege.id));
      setLoading(false);
    }).catch(() => router.replace("/"));
  }, [params.slug, params.hostelSlug, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  if (!school || !college) return null;

  return (
    <main className="min-h-screen bg-apple-gray-50">
      <PublicHeader />
      <section className="bg-gradient-to-b from-blue-50 to-white py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm font-semibold text-blue-600">{school.name}</p>
          <h1 className="text-4xl sm:text-6xl font-semibold text-apple-gray-900 mt-2">{college.name}</h1>
          <p className="text-lg text-apple-gray-600 mt-4">Select your hostel to view available plans.</p>
        </div>
      </section>
      <section className="py-12">
        {hostels.length === 0 ? (
          <p className="text-center text-apple-gray-600">No hostels in this college yet.</p>
        ) : (
          <div className="max-w-5xl mx-auto px-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hostels.map((hostel) => (
              <button
                key={hostel.id}
                onClick={() => router.push(`/${college.slug}/${toHostelSlug(hostel.name)}/plans`)}
                className="bg-white rounded-3xl border-2 border-apple-gray-200 p-6 text-center hover:border-blue-300 hover:shadow-xl transition-all"
              >
                <Building2 className="w-8 h-8 mx-auto mb-4 text-blue-600" />
                <span className="block text-lg font-semibold text-apple-gray-900">{hostel.name}</span>
                <span className="text-sm text-apple-gray-500 inline-flex items-center gap-1 mt-2">View plans <ChevronRight className="w-3.5 h-3.5" /></span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
