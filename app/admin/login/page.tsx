"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { adminHome } from "@/lib/adminHome";
import { takeSessionEndReason } from "@/lib/adminSession";
import { BrandGlyph } from "@/components/ui/BrandMark";
import Spinner from "@/components/ui/Spinner";
import { AlertTriangle, Eye, EyeOff, Info } from "lucide-react";

/**
 * Admin sign-in, in the admin's glass look. It renders outside the admin
 * shell, so it carries the `analytics-shell` background itself. Login logic
 * is unchanged.
 */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLogin />
    </Suspense>
  );
}

/** Only same-site admin paths, so a crafted `next` can't bounce you offsite. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) return "/admin/dashboard";
  return raw;
}

const ENDED_MESSAGE: Record<string, string> = {
  expired: "Your session timed out. Please sign in again.",
  invalid: "Your session is no longer valid. Please sign in again.",
};

function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);

  const { login } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set by AdminSessionKeeper when a session ends, so the admin is told why
  // and lands back where they were.
  const [endedReason, setEndedReason] = useState(searchParams.get("reason") ?? "");
  useEffect(() => {
    // Set by whichever redirect brought us here.
    setEndedReason((current) => current || takeSessionEndReason() || "");
  }, []);
  const rawNext = searchParams.get("next");
  const next = safeNext(rawNext);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const success = await login(username, password);

    if (success) {
      // A supplied `next` wins; otherwise the admin lands on the page they
      // belong to — the super-admin dashboard, or a module admin's first
      // accessible section. Pointing every admin at the dashboard would send
      // module admins to an Access Denied page the moment they sign in.
      const profile = useAuthStore.getState().adminProfile;
      router.push(rawNext ? next : (adminHome(profile) ?? "/admin/dashboard"));
    } else {
      setError("Invalid username or password");
      setLoading(false);
    }
  };

  return (
    <div className="analytics-shell flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="ui-page-in w-full max-w-[400px]">
        <div className="glass-panel">
          <div className="flex justify-center">
            <BrandGlyph className="h-14 w-14" />
          </div>
          <p className="eyebrow mt-6 text-center uppercase">Lodge Internet Admin</p>
          <h1 className="mt-1 text-center text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1.5 text-center text-sm text-slate-500">Manage hostels, plans and customers.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="admin-username" className="mb-1.5 block px-1 text-sm font-medium text-slate-600">
                Username
              </label>
              <input
                id="admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoCapitalize="none"
                required
                className="glass-input"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-1.5 block px-1 text-sm font-medium text-slate-600">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={revealPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  className="glass-input pr-12"
                />
                <button
                  type="button"
                  onClick={() => setRevealPassword((r) => !r)}
                  aria-label={revealPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600"
                >
                  {revealPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {!error && ENDED_MESSAGE[endedReason] && (
              <div role="status" className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">{ENDED_MESSAGE[endedReason]}</span>
              </div>
            )}
            {error && (
              <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="glass-primary !mt-6 min-h-[48px] w-full"
            >
              {loading && <Spinner className="h-[18px] w-[18px]" />}
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Authorised staff only</p>
      </div>
    </div>
  );
}
