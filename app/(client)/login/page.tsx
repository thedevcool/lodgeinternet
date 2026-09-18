"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import { apiFetch } from "@/lib/apiClient";
import Link from "next/link";
import AuthShell, { AuthFallback } from "@/components/client/AuthShell";
import TextField from "@/components/ui/TextField";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";

/** Only allow same-origin paths to prevent open-redirect abuse. */
function safeRedirectPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectPath(searchParams.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const auth = getAuthInstance();
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );

      // Check if user has a profile (verified account).
      // apiFetch (not fetch): /api/* is served by the backend. A plain fetch
      // hit this site, 404'd, and silently skipped the verification check.
      const idToken = await userCredential.user.getIdToken().catch(() => "");
      const res = await apiFetch(
        `/api/auth/user?userId=${userCredential.user.uid}`,
        {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        },
      );

      if (res.ok) {
        const data = await res.json();
        if (!data.profile.emailVerified) {
          // Account exists but not verified — redirect to register to verify,
          // preserving the original destination if one was passed in.
          const verifyUrl =
            `/register?email=${encodeURIComponent(email.trim().toLowerCase())}&verify=1` +
            (redirectTarget ? `&redirect=${encodeURIComponent(redirectTarget)}` : "");
          router.push(verifyUrl);
          return;
        }
      }

      router.push(redirectTarget || "/dashboard");
    } catch (err: any) {
      console.error("Login error:", err);

      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/invalid-credential"
      ) {
        setError("No account found with these credentials.");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else if (err.code === "auth/user-disabled") {
        setError("Your account has been disabled. Please contact support.");
      } else {
        setError("Login failed. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell tabs="login" title="Welcome back" subtitle="Sign in to manage your Lodge Internet connection.">
      <form onSubmit={handleLogin} className="space-y-5">
        {error && <InlineAlert>{error}</InlineAlert>}

        <TextField
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="your.email@example.com"
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          labelAside={
            <Link href="/forgot-password" className="ui-footnote font-medium text-accent-ink">
              Forgot password?
            </Link>
          }
        />

        <Button type="submit" full loading={loading}>
          {loading ? "Signing in..." : "Log in"}
        </Button>
      </form>

      <p className="ui-subhead mt-6 text-center text-ink-2">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-accent-ink">
          Create Account
        </Link>
      </p>
    </AuthShell>
  );
}
