"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { BrandGlyph } from "@/components/ui/BrandMark";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";

/**
 * Admin sign-in, in the client design language. `.client-root` opts this one
 * admin page into the client tokens, Inter and light/dark; the rest of admin
 * is unchanged. Login logic is unchanged.
 */
export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const success = await login(username, password);

    if (success) {
      router.push("/admin/dashboard");
    } else {
      setError("Invalid username or password");
      setLoading(false);
    }
  };

  return (
    <div className="client-root flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="ui-page-in w-full max-w-[400px]">
        <div className="rounded-sheet bg-surface p-7 shadow-card sm:p-9">
          <div className="flex justify-center">
            <BrandGlyph className="h-14 w-14" />
          </div>
          <p className="ui-eyebrow mt-6 text-center text-accent-ink">Lodge Internet Admin</p>
          <h1 className="ui-title-1 mt-1 text-center text-ink">Sign in</h1>
          <p className="ui-subhead mt-1.5 text-center text-ink-2">Manage hostels, plans and customers.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              autoCapitalize="none"
              required
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
            {error && <InlineAlert>{error}</InlineAlert>}
            <Button type="submit" full loading={loading} className="!mt-6">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
        <p className="ui-footnote mt-6 text-center text-ink-3">Authorised staff only</p>
      </div>
    </div>
  );
}
