"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { LayoutDashboard, LogIn, Wifi } from "lucide-react";
import { getAuthInstance } from "@/lib/firebase";

/** Shared public navigation used when moving through school/college pages. */
export default function PublicHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      return onAuthStateChanged(getAuthInstance(), (user) => setEmail(user?.email || null));
    } catch {
      return undefined;
    }
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={() => router.push("/")} className="flex items-center gap-3 text-left">
          <span className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-2 shadow-lg">
            <Wifi className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-950">Lodge Internet</span>
        </button>
        {email ? (
          <button type="button" onClick={() => router.push("/dashboard")} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </button>
        ) : (
          <button type="button" onClick={() => router.push("/login")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <LogIn className="h-4 w-4" /> Sign in
          </button>
        )}
      </div>
    </header>
  );
}
