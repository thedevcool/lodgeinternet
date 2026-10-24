"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/apiClient";
import { signOut } from "@/lib/customerAuth";

/**
 * "Delete my account": says plainly what happens and what we keep, then asks
 * for the password (POST /api/account/delete). On success the customer is
 * signed out and sent home. Used from the profile menu and from Settings.
 */
export default function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Start clean every time it opens — no password left over from last time.
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError("");
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // A wrong password (401 INVALID_CREDENTIALS) and every other refusal
        // carry a message meant for the customer.
        setError(data.error || "Couldn't delete your account. Please try again.");
        return;
      }
      await signOut().catch(() => undefined);
      onClose();
      router.replace("/");
      addToast({
        type: "success",
        title: "Your account has been closed.",
        message: "We've received your deletion request.",
      });
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} dismissible={!submitting} title="Delete my account">
      <form onSubmit={submit}>
        <div className="ui-subhead space-y-4 text-ink-2">
          <InlineAlert title="This can't be undone">
            Your account is closed straight away and you&apos;re signed out on every device. You won&apos;t be able to
            sign in with it again.
          </InlineAlert>
          <div>
            <p className="ui-headline text-ink">What happens</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>Your account is closed and you&apos;re signed out everywhere.</li>
              <li>Our team deletes your personal details within 30 days.</li>
            </ul>
          </div>
          <div>
            <p className="ui-headline text-ink">What we keep</p>
            <p className="mt-1.5">
              Payment and purchase records. The law requires us to keep them, so they stay after your account is
              closed.
            </p>
          </div>
          <div>
            <p className="ui-headline text-ink">Wallet balance</p>
            <p className="mt-1.5">
              Use any balance left in your wallet first, or contact support to have it refunded before you delete.
            </p>
          </div>
        </div>

        <TextField
          label="Confirm your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || null}
          className="mt-5"
        />

        <Button type="submit" variant="destructive" full size="md" loading={submitting} className="mt-5">
          Delete my account
        </Button>
        <Button variant="gray" full size="md" className="mt-2" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </form>
    </Sheet>
  );
}
