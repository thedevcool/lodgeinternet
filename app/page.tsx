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
  Lock,
  Layers,
  ChevronRight,
} from "lucide-react";
import { toHostelSlug } from "@/lib/hostelSlug";
import type { HostelCollage } from "@/types";

interface Hostel {
  id: string;
  name: string;
  collageId?: string;
}

interface UserProfile {
  hostelId: string;
  hostelSlug: string;
  emailVerified: boolean;
}

export default function LandingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [collages, setCollages] = useState<HostelCollage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/hostels").then((r) => r.json()),
      apiFetch("/api/hostel-collages").then((r) => r.json()),
    ])
      .then(([hostelsData, collagesData]) => {
        setHostels(hostelsData.hostels || []);
        setCollagesData(collagesData.collages || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    try {
      const auth = getAuthInstance();
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        if (user) {
          try {
            const idToken = await user.getIdToken().catch(() => "");
            const res = await apiFetch(`/api/auth/user?userId=${user.uid}`, {
              headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
            });
            if (res.ok) {
              const data = await res.json();
              if (data.profile?.emailVerified) {
                setUserProfile(data.profile);
              }
            }
          } catch {
            // Profile fetch failed
          }
        } else {
          setUserProfile(null);
        }
      });
      return () => unsubscribe();
    } catch {
      // Auth not available
    }
  }, []);

  const setCollagesData = (data: any[]) => {
    setCollages(data);
  };

  const handleHostelSelect = (hostelName: string) => {
    router.push(`/${toHostelSlug(hostelName)}/plans`);
  };

  const handleCollageSelect = (slug: string) => {
    router.push(`/${slug}`);
  };

  // If logged in with a verified profile, only show their hostel
  const displayHostels = userProfile
    ? hostels.filter((h) => h.name === userProfile.hostelId)
    : hostels.filter((h) => !h.collageId);

  const displayCollages = userProfile ? [] : collages;

  return (
    <>
      {/* Hero Section */}
      <section className='relative bg-gradient-to-b from-apple-gray-100 to-white pt-10 sm:pt-20 pb-10 sm:pb-16 overflow-hidden'>
        {/* Decorative background pattern */}
        <div className='absolute inset-0 opacity-30'>
          <div className='absolute top-10 right-1/4 w-96 h-96 bg-gradient-radial from-blue-100 to-transparent rounded-full blur-3xl'></div>
          <div className='absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-gradient-radial from-purple-100 to-transparent rounded-full blur-3xl'></div>
        </div>

        <div className='relative mx-auto max-w-wide px-4 sm:px-6 lg:px-8'>
          {/* Top Header Bar */}
          <div className='flex justify-end mb-6'>
            {currentUser ? (
              <div className='flex items-center gap-4'>
                <span className='text-sm text-apple-gray-600'>
                  Welcome back, {currentUser.email?.split("@")[0]}
                </span>
                <button
                  onClick={() => router.push("/dashboard")}
                  className='inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold px-6 py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'>
                  <LayoutDashboard className='w-4 h-4' />
                  Dashboard
                </button>
              </div>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className='inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm text-apple-gray-900 font-semibold px-6 py-3 rounded-xl hover:bg-white hover:shadow-lg transition-all duration-300 border border-apple-gray-200 shadow-sm'>
                <LogIn className='w-4 h-4' />
                Sign In
              </button>
            )}
          </div>

          <div className='flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 lg:gap-8'>
            {/* Left side - Logo and Title */}
            <div className='flex items-center gap-3 sm:gap-6'>
              <div className='p-3 sm:p-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl sm:rounded-3xl shadow-2xl transform hover:scale-105 transition-transform duration-300 shrink-0'>
                <Wifi
                  className='w-9 h-9 sm:w-14 sm:h-14 text-white'
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <h1 className='text-3xl sm:text-5xl lg:text-7xl font-semibold mb-1 sm:mb-2'>
                  <span className='bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent'>
                    Lodge Internet
                  </span>
                </h1>
              </div>
            </div>

            {/* Right side - Tagline */}
            <div className='lg:text-right max-w-md'>
              <p
                className='text-lg sm:text-2xl lg:text-3xl font-semibold text-apple-gray-900 mb-2 sm:mb-3'
                style={{ opacity: 0.8 }}>
                Fast and reliable
                <br />
                hostel internet.
              </p>
              <p className='text-sm sm:text-base lg:text-lg text-apple-gray-600'>
                Get instant access to high-speed internet for your room
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hostel & Collage Selection Section */}
      <section className='py-10 sm:py-16 bg-white'>
        <div className='max-w-5xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='text-center mb-8 sm:mb-12'>
            <h2 className='text-3xl sm:text-4xl lg:text-5xl font-semibold text-apple-gray-900 mb-3 sm:mb-4'>
              {userProfile ? "Your Hostel" : "Select Your Hostel"}
            </h2>
            <p className='text-base sm:text-lg lg:text-xl text-apple-gray-600 max-w-2xl mx-auto'>
              {userProfile
                ? "You\u2019re locked in \u2014 tap to view your plans"
                : "Choose your hostel or collage to see available plans"}
            </p>
          </div>

          {loading ? (
            <div className='text-center py-10 text-apple-gray-600'>
              Loading...
            </div>
          ) : displayHostels.length === 0 && displayCollages.length === 0 ? (
            <div className='text-center py-10 text-apple-gray-600'>
              No hostels available yet. Please contact support.
            </div>
          ) : userProfile ? (
            <div className='max-w-md mx-auto'>
              {displayHostels.map((hostel) => (
                <div
                  key={hostel.id}
                  onClick={() => handleHostelSelect(hostel.name)}
                  className='group bg-white rounded-3xl shadow-sm p-6 sm:p-10 transition-all duration-300 border-2 cursor-pointer text-center border-blue-300 bg-gradient-to-br from-blue-50 to-purple-50 shadow-lg hover:shadow-xl hover:scale-102'>
                  <div className='inline-flex items-center justify-center w-13 h-13 sm:w-16 sm:h-16 rounded-2xl mb-4 sm:mb-6 bg-blue-100'>
                    <Building2
                      className='w-8 h-8 text-blue-600'
                      strokeWidth={2}
                    />
                  </div>
                  <h3 className='text-xl sm:text-2xl font-semibold text-apple-gray-900 mb-2'>
                    {hostel.name}
                  </h3>
                  <p className='text-sm text-blue-600 font-medium flex items-center justify-center gap-1.5'>
                    <Lock className='w-3.5 h-3.5' />
                    Your assigned hostel
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Collages */}
              {displayCollages.length > 0 && (
                <div className='mb-12'>
                  <h3 className='text-xl sm:text-2xl font-semibold text-apple-gray-800 mb-4 sm:mb-6 flex items-center gap-2'>
                    <Layers className='w-5 h-5 text-purple-500' />
                    Hostel Groups
                  </h3>
                  <div className='grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3'>
                    {displayCollages.map((collage) => (
                      <div
                        key={collage.id}
                        onClick={() => handleCollageSelect(collage.slug)}
                        className='group bg-white rounded-3xl border-2 border-apple-gray-200 p-5 sm:p-6 cursor-pointer hover:border-purple-300 hover:shadow-xl hover:scale-105 transition-all duration-300 text-center'>
                        <div className='inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-purple-100 to-purple-200 group-hover:from-purple-200 group-hover:to-purple-300 transition-all duration-300'>
                          <Layers
                            className='w-7 h-7 text-purple-600'
                            strokeWidth={2}
                          />
                        </div>
                        <h3 className='text-lg sm:text-xl font-semibold text-apple-gray-900 mb-1'>
                          {collage.name}
                        </h3>
                        <p className='text-sm text-apple-gray-500 flex items-center justify-center gap-1'>
                          View hostels
                          <ChevronRight className='w-3.5 h-3.5' />
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flat hostels */}
              {displayHostels.length > 0 && (
                <div>
                  <h3 className='text-xl sm:text-2xl font-semibold text-apple-gray-800 mb-4 sm:mb-6 flex items-center gap-2'>
                    <Building2 className='w-5 h-5 text-blue-500' />
                    Hostels
                  </h3>
                  <div className='grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3'>
                    {displayHostels.map((hostel) => (
                      <div
                        key={hostel.id}
                        onClick={() => handleHostelSelect(hostel.name)}
                        className='group bg-white rounded-3xl border-2 border-apple-gray-200 p-5 sm:p-6 cursor-pointer hover:border-blue-300 hover:shadow-xl hover:scale-105 transition-all duration-300 text-center'>
                        <div className='inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-apple-gray-100 group-hover:bg-blue-100 transition-all duration-300'>
                          <Building2
                            className='w-7 h-7 text-apple-gray-700 group-hover:text-blue-600 transition-colors duration-300'
                            strokeWidth={2}
                          />
                        </div>
                        <h3 className='text-lg sm:text-xl font-semibold text-apple-gray-900 mb-1'>
                          {hostel.name}
                        </h3>
                        <p className='text-sm text-apple-gray-500'>
                          View plans
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className='py-16 bg-gradient-to-b from-apple-gray-50 to-white'>
        <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'>
          <h2 className='text-4xl sm:text-5xl font-semibold text-center text-apple-gray-900 mb-4'>
            How It Works
          </h2>
          <p className='text-center text-lg text-apple-gray-600 mb-12 max-w-2xl mx-auto'>
            Get started with Lodge Internet in three simple steps
          </p>

          <div className='grid gap-8 md:grid-cols-3'>
            <div className='text-center group'>
              <div className='inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110'>
                <span className='text-4xl font-bold bg-gradient-to-br from-blue-600 to-blue-800 bg-clip-text text-transparent'>
                  1
                </span>
              </div>
              <h3 className='text-xl font-semibold text-apple-gray-900 mb-3'>
                Choose Hostel
              </h3>
              <p className='text-base text-apple-gray-600 leading-relaxed'>
                Select your hostel to view plans available for your location
              </p>
            </div>

            <div className='text-center group'>
              <div className='inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-100 to-purple-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110'>
                <span className='text-4xl font-bold bg-gradient-to-br from-purple-600 to-purple-800 bg-clip-text text-transparent'>
                  2
                </span>
              </div>
              <h3 className='text-xl font-semibold text-apple-gray-900 mb-3'>
                Choose Plan &amp; Pay
              </h3>
              <p className='text-base text-apple-gray-600 leading-relaxed'>
                Pick a data plan and complete secure payment through Paystack
              </p>
            </div>

            <div className='text-center group'>
              <div className='inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-100 to-green-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110'>
                <span className='text-4xl font-bold bg-gradient-to-br from-green-600 to-green-800 bg-clip-text text-transparent'>
                  3
                </span>
              </div>
              <h3 className='text-xl font-semibold text-apple-gray-900 mb-3'>
                Get Connected
              </h3>
              <p className='text-base text-apple-gray-600 leading-relaxed'>
                Receive your instant access code — save it immediately!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-apple-gray-200 bg-white py-10 sm:py-12'>
        <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center'>
          <div className='flex items-center justify-center gap-2.5 mb-4'>
            <div className='p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg'>
              <Wifi className='w-5 h-5 text-white' strokeWidth={2.5} />
            </div>
            <span className='text-xl font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent'>
              Lodge Internet
            </span>
          </div>
          <p className='text-sm sm:text-base text-apple-gray-600'>
            Lodge Internet is a Product of Davo-Nexus Limited
          </p>
          <p className='text-xs text-apple-gray-400 mt-2'>
            &copy; {new Date().getFullYear()} Davo-Nexus. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
