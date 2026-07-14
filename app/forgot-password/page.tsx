"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wifi, ArrowLeft, Eye, EyeOff, Mail, CheckCircle, KeyRound } from "lucide-react";
import Link from "next/link";

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-apple-gray-100 to-white flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              if (step === "code") { setStep("email"); setError(""); }
              else if (step === "password") { setStep("code"); setError(""); }
              else router.push("/login");
            }}
            className="flex items-center gap-2 text-apple-gray-600 hover:text-apple-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">
              {step === "email" ? "Back to Sign In" : "Back"}
            </span>
          </button>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-apple-gray-200">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-2xl mb-4">
              {step === "done" ? (
                <CheckCircle className="w-8 h-8 text-white" />
              ) : step === "password" ? (
                <KeyRound className="w-8 h-8 text-white" />
              ) : (
                <Wifi className="w-8 h-8 text-white" />
              )}
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
              {stepTitle[step]}
            </h1>
            <p className="text-apple-gray-600 text-sm">{stepSubtitle[step]}</p>
          </div>

          {/* Error */}
          {error && step !== "done" && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* ── Step 1: Email ─────────────────────────────────────────────── */}
          {step === "email" && (
            <form onSubmit={handleRequestCode} className="space-y-5">
              <div>
                <label htmlFor="fp-email" className="block text-sm font-semibold text-apple-gray-900 mb-2">
                  Email Address
                </label>
                <input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your.email@example.com"
                  className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending code&hellip;
                  </span>
                ) : (
                  "Send Reset Code"
                )}
              </button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-apple-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-apple-gray-500">Remember your password?</span>
                </div>
              </div>

              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full px-6 py-3 border border-apple-gray-300 text-apple-gray-700 font-semibold rounded-xl hover:bg-apple-gray-50 transition-colors"
              >
                Back to Sign In
              </Link>
            </form>
          )}

          {/* ── Step 2: Code ──────────────────────────────────────────────── */}
          {step === "code" && (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-apple-gray-600">
                  Check your inbox at{" "}
                  <span className="font-semibold text-apple-gray-900">{email}</span>
                </span>
              </div>

              <div>
                <label htmlFor="fp-code" className="block text-sm font-semibold text-apple-gray-900 mb-2 text-center">
                  6-Digit Reset Code
                </label>
                <input
                  id="fp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="000000"
                  className="w-full px-4 py-4 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-2xl font-mono tracking-[0.5em]"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
              >
                Continue
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  Didn&apos;t receive it? Resend code
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: New Password ───────────────────────────────────────── */}
          {step === "password" && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label htmlFor="fp-newpw" className="block text-sm font-semibold text-apple-gray-900 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="fp-newpw"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-500 hover:text-apple-gray-700 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="fp-confirm" className="block text-sm font-semibold text-apple-gray-900 mb-2">
                  Confirm New Password
                </label>
                <input
                  id="fp-confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter new password"
                  className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Resetting&hellip;
                  </span>
                ) : (
                  "Reset Password"
                )}
              </button>
            </form>
          )}

          {/* ── Step 4: Done ──────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-apple-gray-900 mb-2">Password Updated!</h2>
              <p className="text-apple-gray-600 text-sm mb-6">
                Your password has been reset. Taking you to sign in&hellip;
              </p>
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
