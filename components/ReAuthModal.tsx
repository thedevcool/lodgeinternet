"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import { ShieldCheck } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";

interface ReAuthModalProps {
  /** Called with a fresh ID token after successful re-authentication */
  onSuccess: (freshIdToken: string) => void;
  onCancel: () => void;
}

/**
 * "Confirm your identity" — shown when the server says the session is too
 * old (SESSION_EXPIRED). Re-auth logic unchanged; now an iOS sheet that sits
 * above any other open sheet (e.g. the post-payment code sheet).
 */
export default function ReAuthModal({ onSuccess, onCancel }: ReAuthModalProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const auth = getAuthInstance();
      const user = auth.currentUser;
      if (!user || !user.email) {
        setError("No user session found. Please sign in again.");
        return;
      }

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // Get a fresh token (auth_time is now updated)
      const freshToken = await user.getIdToken(true);
      onSuccess(freshToken);
    } catch (err: any) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setError("Incorrect password. Please try again.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open onClose={onCancel} layer="sheet-over" ariaLabel="Confirm your identity">
      <div className="pb-2 pt-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-warning/15 text-warning">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <h2 className="ui-title-2 mt-4 text-ink">Confirm your identity</h2>
        <p className="ui-subhead mx-auto mt-1.5 max-w-xs text-ink-2">
          For your security, please re-enter your password to continue.
        </p>
      </div>

      <form onSubmit={handleReAuth} className="mt-5 space-y-5">
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          autoComplete="current-password"
          placeholder="Enter your password"
          error={error || null}
        />
        <Button type="submit" full loading={loading}>
          {loading ? "Verifying…" : "Confirm & Continue"}
        </Button>
      </form>
    </Sheet>
  );
}
