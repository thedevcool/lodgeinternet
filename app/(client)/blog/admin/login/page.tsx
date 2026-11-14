"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Container from "@/components/ui/Container";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";
import { BrandGlyph } from "@/components/ui/BrandMark";
import { useAuthStore } from "@/store/authStore";

/**
 * /blog/admin/login — the superadmin signs in here to review blog posts,
 * with the same username and password as the admin console (the same
 * sign-in, store/authStore.ts). Only a superadmin may review: the blog
 * speaks for the company in public.
 */
export default function BlogAdminLogin() {
  const router = useRouter();
  const { login, logout } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const ok = await login(username, password);
    if (!ok) {
      setError("That username and password don't match.");
      setBusy(false);
      return;
    }
    if (!useAuthStore.getState().adminProfile?.isSuperAdmin) {
      logout();
      setError("Only the superadmin can review blog posts.");
      setBusy(false);
      return;
    }
    router.replace("/blog/admin");
  };

  return (
    <Container className="flex min-h-[70dvh] items-center justify-center pb-16">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-sheet bg-surface p-6 shadow-card ring-1 ring-hairline">
        <BrandGlyph className="mx-auto h-12 w-12" />
        <p className="ui-footnote mt-5 text-center font-semibold uppercase tracking-[0.06em] text-accent-ink">Blog review</p>
        <h1 className="ui-title-2 mt-1 text-center text-ink">Sign in</h1>
        <p className="ui-subhead mt-1.5 text-center text-ink-2">Use your admin username and password.</p>

        <div className="mt-6 space-y-4">
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Button type="submit" size="lg" full disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </Container>
  );
}
