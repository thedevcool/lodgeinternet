"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import AuthShell from "@/components/client/AuthShell";
import TextField from "@/components/ui/TextField";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import CodeBoxes from "@/components/ui/CodeBoxes";
import Spinner from "@/components/ui/Spinner";

type Step = "email" | "code" | "password" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Step 1: request reset code ───────────────────────────────────────────────
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      // Account exists but hasn't been verified — they need to finish onboarding
      if (res.status === 403 && data.notVerified) {
        setError(
          "This account hasn't been verified yet. Please check your email for the original verification code, or go back to register and resend it.",
        );
        return;
      }

      if (!res.ok) throw new Error(data.error || "Request failed");

      setUserId(data.userId ?? "");
      setStep("code");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: enter code (validated on submit in step 3) ───────────────────────
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    if (!userId) {
      setError("Session expired. Please start over.");
      setStep("email");
      return;
    }
    setStep("password");
  };

  // ── Step 3: set new password ──────────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "expired" || data.code === "locked_out") {
          setStep("code");
          setCode("");
        }
        throw new Error(data.error || "Reset failed");
      }

      setStep("done");
      setTimeout(() => router.push("/login"), 2500);
    } catch (err: any) {
      setError(err.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend code ───────────────────────────────────────────────────────────────
  const handleResend = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.status === 403 && data.notVerified) {
        setError(
          "This account hasn't been verified yet. Please complete email verification first.",
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to resend");
      setUserId(data.userId ?? userId);
      setCode("");
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  const stepTitle: Record<Step, string> = {
    email: "Forgot Password",
    code: "Enter Reset Code",
    password: "Set New Password",
    done: "Password Reset!",
  };

  const stepSubtitle: Record<Step, string> = {
    email: "Enter your email and we\u2019ll send a reset code",
    code: `Enter the 6-digit code sent to ${email}`,
    password: "Choose a strong new password",
    done: "Redirecting you to sign in\u2026",
  };

  // ── Presentation (logic above unchanged) ─────────────────────────────────
  return (
    <AuthShell
      icon={step === "password" ? <KeyRound className="h-7 w-7" /> : step === "done" ? <Check className="h-7 w-7" /> : <Mail className="h-7 w-7" />}
      title={stepTitle[step]}
      subtitle={stepSubtitle[step]}
    >
      {step !== "done" && (
        <button
          onClick={() => {
            if (step === "code") { setStep("email"); setError(""); }
            else if (step === "password") { setStep("code"); setError(""); }
            else router.push("/login");
          }}
          className="ui-subhead -mt-2 mb-5 inline-flex items-center gap-0.5 font-medium text-accent-ink"
        >
          <ChevronLeft className="h-5 w-5" /> {step === "email" ? "Back to Sign In" : "Back"}
        </button>
      )}

      {error && step !== "done" && <InlineAlert className="mb-5">{error}</InlineAlert>}

      {step === "email" && (
        <form onSubmit={handleRequestCode} className="space-y-5">
          <TextField
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            placeholder="your.email@example.com"
          />
          <Button type="submit" full loading={loading}>
            {loading ? "Sending code..." : "Send Reset Code"}
          </Button>
          <p className="ui-subhead text-center text-ink-2">
            Remember your password?{" "}
            <Link href="/login" className="font-semibold text-accent-ink">
              Sign In
            </Link>
          </p>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyCode} className="space-y-5">
          <CodeBoxes value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} />
          <Button type="submit" full disabled={loading || code.length !== 6}>
            Continue
          </Button>
          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="ui-subhead font-medium text-accent-ink disabled:opacity-50"
            >
              Didn&apos;t receive it? Resend code
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handleResetPassword} className="space-y-5">
          <TextField
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
            autoComplete="new-password"
            placeholder="At least 6 characters"
          />
          <TextField
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Re-enter new password"
          />
          <Button type="submit" full loading={loading}>
            {loading ? "Resetting..." : "Reset Password"}
          </Button>
        </form>
      )}

      {step === "done" && (
        <div className="py-4 text-center">
          <span className="mx-auto flex h-16 w-16 animate-check-pop items-center justify-center rounded-full bg-success text-white">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <h2 className="ui-title-2 mt-4 text-ink">Password Updated!</h2>
          <Spinner className="mx-auto mt-5 h-7 w-7 text-ink-3" />
        </div>
      )}
    </AuthShell>
  );
}
