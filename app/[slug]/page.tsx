"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import {
  Wifi,
  LogIn,
  Building2,
  LayoutDashboard,
} from "lucide-react";
import { toHostelSlug } from "@/lib/hostelSlug";
import type { Hostel, HostelCollage } from "@/types";

export default function CollagePage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [collage, setCollage] = useState<HostelCollage | null>(null);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch("/api/hostel-collages").then((r) => r.json()),
      apiFetch("/api/hostels").then((r) => r.json()),
    ])
      .then(([collagesData, hostelsData]) => {
        if (cancelled) return;

        const found = ((collagesData.collages as any[]) || []).find(
          (c) => c.slug === params.slug,
        );

        if (found) {
          setCollage(found);
          setHostels(
            (hostelsData.hostels as Hostel[] || []).filter(
              (h) => h.collageId === found.id,
            ),
          );
          setLoading(false);
          return;
        }

        // Not a collage — maybe it's a flat hostel slug? Redirect.
        const hostelMatch = (hostelsData.hostels as Hostel[] || []).find(
          (h) =>
            toHostelSlug(h.name) === params.slug && !h.collageId,
        );
        router.replace(
          hostelMatch
            ? `/${params.slug}/plans`
            : "/",
        );
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      });

    return () => {
      cancelled = true;
    };
  }, [params.slug, router]);

  useEffect(() => {
    try {
      const auth = getAuthInstance();
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
      });
      return () => unsubscribe();
    } catch {
      // Auth not available
    }
  }, []);

  const handleHostelSelect = (hostelName: string) => {
    router.push(`/${params.slug}/${toHostelSlug(hostelName)}/plans`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-apple-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!collage) return null;

  return (
    <>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-apple-gray-100 to-white pt-10 sm:pt-20 pb-10 sm:pb-16 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-10 right-1/4 w-96 h-96 bg-gradient-radial from-blue-100 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-gradient-radial from-purple-100 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-wide px-4 sm:px-6 lg:px-8">
          <div className="flex justify-end mb-6">
            {currentUser ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-apple-gray-600">
                  Welcome back, {currentUser.email?.split("@")[0]}
                </span>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold px-6 py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </button>
              </div>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm text-apple-gray-900 font-semibold px-6 py-3 rounded-xl hover:bg-white hover:shadow-lg transition-all duration-300 border border-apple-gray-200 shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 lg:gap-8">
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="p-3 sm:p-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl sm:rounded-3xl shadow-2xl transform hover:scale-105 transition-transform duration-300 shrink-0">
                <Wifi
                  className="w-9 h-9 sm:w-14 sm:h-14 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <h1 className="text-3xl sm:text-5xl lg:text-7xl font-semibold mb-1 sm:mb-2">
                  <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                    Lodge Internet
                  </span>
                </h1>
                <p className="text-sm sm:text-lg text-apple-gray-600 font-medium">
                  {collage.name}
                </p>
              </div>
            </div>

            <div className="lg:text-right max-w-md">
              <p
                className="text-lg sm:text-2xl lg:text-3xl font-semibold text-apple-gray-900 mb-2 sm:mb-3"
                style={{ opacity: 0.8 }}
              >
                {hostels.length}{" "}
                {hostels.length === 1 ? "hostel" : "hostels"} available
              </p>
              <p className="text-sm sm:text-base lg:text-lg text-apple-gray-600">
                Select a hostel to view available internet plans
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hostels Section */}
      <section className="py-10 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-apple-gray-900 mb-3 sm:mb-4">
              {collage.name}
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-apple-gray-600 max-w-2xl mx-auto">
              Choose a hostel to see available plans
            </p>
          </div>

          {hostels.length === 0 ? (
            <div className="text-center py-10 text-apple-gray-600">
              No hostels in this group yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
              {hostels.map((hostel) => (
                <div
                  key={hostel.id}
                  onClick={() => handleHostelSelect(hostel.name)}
                  className="group bg-white rounded-3xl border-2 border-apple-gray-200 p-5 sm:p-6 cursor-pointer hover:border-blue-300 hover:shadow-xl hover:scale-105 transition-all duration-300 text-center"
                >
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-apple-gray-100 group-hover:bg-blue-100 transition-all duration-300">
                    <Building2
                      className="w-7 h-7 text-apple-gray-700 group-hover:text-blue-600 transition-colors duration-300"
                      strokeWidth={2}
                    />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-apple-gray-900 mb-1">
                    {hostel.name}
                  </h3>
                  <p className="text-sm text-apple-gray-500">View plans</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gradient-to-b from-apple-gray-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl sm:text-5xl font-semibold text-center text-apple-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-center text-lg text-apple-gray-600 mb-12 max-w-2xl mx-auto">
            Get started with Lodge Internet in three simple steps
          </p>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center group">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                <span className="text-4xl font-bold bg-gradient-to-br from-blue-600 to-blue-800 bg-clip-text text-transparent">
                  1
                </span>
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                Choose Hostel
              </h3>
              <p className="text-base text-apple-gray-600 leading-relaxed">
                Select your hostel to view plans available for your location
              </p>
            </div>

            <div className="text-center group">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-100 to-purple-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                <span className="text-4xl font-bold bg-gradient-to-br from-purple-600 to-purple-800 bg-clip-text text-transparent">
                  2
                </span>
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                Choose Plan &amp; Pay
              </h3>
              <p className="text-base text-apple-gray-600 leading-relaxed">
                Pick a data plan and complete secure payment through Paystack
              </p>
            </div>

            <div className="text-center group">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-100 to-green-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                <span className="text-4xl font-bold bg-gradient-to-br from-green-600 to-green-800 bg-clip-text text-transparent">
                  3
                </span>
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                Get Connected
              </h3>
              <p className="text-base text-apple-gray-600 leading-relaxed">
                Receive your instant access code — save it immediately!
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
