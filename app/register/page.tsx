"use client";
import { apiFetch } from "@/lib/apiClient";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createUserWithEmailAndPassword, onAuthStateChanged, type User } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import {
  Wifi,
  ArrowLeft,
  Eye,
  EyeOff,
  Building2,
  Mail,
  CheckCircle,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";

/**
 * Only allow same-origin paths (must start with a single "/").
 * Blocks open-redirect to external URLs.
 */
function safeRedirectPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

interface Hostel {
  id: string;
  name: string;
}

type Step = "hostel" | "credentials" | "verify" | "done";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";
  const verifyOnly = searchParams.get("verify") === "1";
  const prefillHostel = searchParams.get("hostel") || "";
  // update=1 means the user already has a verified account — just update their hostelId
  const updateMode = searchParams.get("update") === "1";
  const redirectTarget = safeRedirectPath(searchParams.get("redirect"));

  const [step, setStep] = useState<Step>(verifyOnly ? "verify" : "hostel");
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loadingHostels, setLoadingHostels] = useState(true);
  const [selectedHostel, setSelectedHostel] = useState(prefillHostel);
  const [email, setEmail] = useState(prefillEmail);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentHostel, setCurrentHostel] = useState<string>("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState("");
  // Track which step the user has actually entered, so the auto-redirect
  // effect doesn't bounce a freshly-registered user off the verify step.
  const stepRef = useRef<Step>(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Load hostels
  useEffect(() => {
    apiFetch("/api/hostels")
      .then((r) => r.json())
      .then((data) => setHostels(data.hostels || []))
      .catch(() => setHostels([]))
      .finally(() => setLoadingHostels(false));
  }, []);

  // Always track Firebase Auth state — needed for verifyOnly, updateMode,
  // already-signed-in detection, and orphan-account recovery.
  useEffect(() => {
    try {
      const auth = getAuthInstance();
      const unsub = onAuthStateChanged(auth, async (user) => {
        setFirebaseUser(user);
        if (!user) return;

        setCurrentUserId(user.uid);
        if (!email) setEmail(user.email || prefillEmail);

        // Only auto-route at the start of the flow. Once the user has begun
        // the credentials/verify steps, leave them alone.
        if (verifyOnly || updateMode) return;
        if (stepRef.current !== "hostel") return;

        try {
          const token = await user.getIdToken().catch(() => "");
          const res = await apiFetch(`/api/auth/user?userId=${user.uid}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            if (data.profile?.emailVerified) {
              // Fully set up — bounce to the original destination or dashboard.
              router.push(redirectTarget || "/dashboard");
            } else {
              // Profile exists but not verified — resume verification.
              setSelectedHostel(data.profile?.hostelId || prefillHostel);
              setStep("verify");
            }
          }
          // 404 = Firebase Auth exists but no Firestore profile (orphan).
          // We leave the user on the hostel step so they can finish onboarding;
          // /api/auth/register is idempotent on existing UIDs.
        } catch {
          // Profile fetch failed — let them continue manually
        }
      });
      return () => unsub();
    } catch {
      // Auth not ready
    }
  }, [verifyOnly, updateMode, prefillEmail, prefillHostel, email, redirectTarget, router]);

  // Fetch the user's current hostel for the update-mode marker
  useEffect(() => {
    if (!updateMode || !firebaseUser) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await apiFetch(`/api/auth/user?userId=${firebaseUser.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.profile?.hostelId) {
          setCurrentHostel(data.profile.hostelId);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateMode, firebaseUser]);

  // verifyOnly grace period — if no Firebase Auth user shows up within 3s,
  // bounce to /login so we don't spin forever.
  useEffect(() => {
    if (!verifyOnly) return;
    if (firebaseUser) return;
    const timer = setTimeout(() => {
      if (firebaseUser) return;
      const returnUrl = `/register?verify=1${
        prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : ""
      }${redirectTarget ? `&redirect=${encodeURIComponent(redirectTarget)}` : ""}`;
      router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
    }, 3000);
    return () => clearTimeout(timer);
  }, [verifyOnly, firebaseUser, prefillEmail, redirectTarget, router]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleHostelSelect = async (hostelName: string) => {
    setSelectedHostel(hostelName);
    setError("");

    if (updateMode) {
      // Update mode: just patch the hostelId for the logged-in user
      if (!firebaseUser) {
        // Not logged in — redirect to login, then come back
        const returnUrl = `/register?email=${encodeURIComponent(email)}&hostel=${encodeURIComponent(hostelName)}&update=1`;
        router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
        return;
      }

      setLoading(true);
      try {
        const token = await firebaseUser.getIdToken();
        const res = await apiFetch("/api/auth/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: firebaseUser.uid, hostelId: hostelName }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update hostel");
        }
        setStep("done");
        setTimeout(() => router.push("/dashboard"), 2000);
      } catch (err: any) {
        setError(err.message || "Failed to update hostel. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    setStep("credentials");
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Please enter your full name");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    let createdUser: User | null = null;
    try {
      // Create Firebase Auth account
      const auth = getAuthInstance();
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );
      createdUser = userCredential.user;
      setCurrentUserId(userCredential.user.uid);

      // Register profile + send verification code
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userCredential.user.uid,
          email: email.trim().toLowerCase(),
          hostel: selectedHostel,
          displayName: fullName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to register");
      }

      setStep("verify");
    } catch (err: any) {
      console.error("Registration error:", err);

      if (err.code === "auth/email-already-in-use") {
        // Account already exists but wasn't verified — resend code and go to verify
        try {
          const resendRes = await apiFetch("/api/auth/resend-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email.trim().toLowerCase(),
              hostel: selectedHostel,
            }),
          });
          const resendData = await resendRes.json();
          if (resendData.alreadyVerified) {
            setError(
              "This account is already verified. Please sign in instead.",
            );
          } else if (resendRes.ok) {
            setCurrentUserId(resendData.userId);
            setError("");
            setStep("verify");
          } else {
            setError(resendData.error || "Failed to resend verification code.");
          }
        } catch {
          setError("An account already exists. Failed to resend verification code. Please try again.");
        }
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please choose a stronger password.");
      } else {
        // /api/auth/register failed AFTER Firebase Auth user was created.
        // Best-effort cleanup so the user can retry without hitting
        // "email-already-in-use" against an orphan.
        if (createdUser) {
          try {
            await createdUser.delete();
            setCurrentUserId("");
          } catch (cleanupErr) {
            console.error("Failed to clean up orphan Firebase Auth user:", cleanupErr);
          }
        }
        setError(err.message || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (verificationCode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          code: verificationCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setStep("done");

      // Bounce to the original destination if one was passed in, else dashboard
      const dest = redirectTarget || "/dashboard";
      setTimeout(() => router.push(dest), 1500);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) return;
    if (resendCooldown > 0) return;

    setError("");
    setResendNotice("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          hostel: selectedHostel,
        }),
      });

      const data = await res.json();

      if (data.alreadyVerified) {
        router.push(redirectTarget || "/dashboard");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to resend code");
      }

      if (data.userId) {
        setCurrentUserId(data.userId);
      }
      setResendNotice(`A new code was sent to ${email}.`);
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-apple-gray-100 to-white flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Back Button — hidden on verify/done where going "back" is unsafe (would
            either lose verification progress or orphan a Firebase Auth account). */}
        {step !== "verify" && step !== "done" && (
          <div className="mb-6">
            <button
              onClick={() => {
                if (step === "credentials") {
                  setStep("hostel");
                  setError("");
                } else if (verifyOnly) {
                  router.back();
                } else {
                  router.push("/login");
                }
              }}
              className="flex items-center gap-2 text-apple-gray-600 hover:text-apple-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">
                {step === "credentials"
                  ? "Change Hostel"
                  : verifyOnly
                    ? "Back"
                    : "Back to Login"}
              </span>
            </button>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-apple-gray-200">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-2xl mb-4">
              <Wifi className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
              {step === "hostel" && (updateMode ? "Update Your Hostel" : "Select Your Hostel")}
              {step === "credentials" && "Create Account"}
              {step === "verify" && "Verify Email"}
              {step === "done" && "You're All Set!"}
            </h1>
            <p className="text-apple-gray-600">
              {step === "hostel" &&
                (updateMode ? "Choose the hostel linked to your account" : "Choose the hostel where you stay")}
              {step === "credentials" &&
                `Create your account for ${selectedHostel}`}
              {step === "verify" &&
                `Enter the 6-digit code sent to ${email}`}
              {step === "done" && (updateMode ? "Your hostel has been updated" : "Your account has been verified")}
            </p>
          </div>

          {/* Error Message */}
          {error && step !== "done" && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Hostel Selection */}
          {step === "hostel" && (
            <div className="space-y-3">
              {/* In update mode, show a note about what's happening */}
              {updateMode && (
                <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 mb-2">
                  <Building2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
                  Select your hostel below — your account will be linked and you can purchase plans straight away.
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center gap-3 py-8 text-apple-gray-500">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Updating…</span>
                </div>
              ) : loadingHostels ? (
                <div className="text-center py-8 text-apple-gray-500">
                  Loading hostels...
                </div>
              ) : hostels.length === 0 ? (
                <div className="text-center py-8 text-apple-gray-500">
                  No hostels available
                </div>
              ) : (
                hostels.map((hostel) => {
                  const isCurrent =
                    updateMode && currentHostel && hostel.name === currentHostel;
                  return (
                    <button
                      key={hostel.id}
                      onClick={() => handleHostelSelect(hostel.name)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${
                        isCurrent
                          ? "bg-blue-50 border-blue-300"
                          : "bg-apple-gray-50 border-apple-gray-200 hover:border-blue-300 hover:bg-blue-50"
                      }`}
                    >
                      <div
                        className={`p-2.5 rounded-xl transition-colors ${
                          isCurrent
                            ? "bg-blue-100"
                            : "bg-apple-gray-100 group-hover:bg-blue-100"
                        }`}
                      >
                        <Building2
                          className={`w-5 h-5 transition-colors ${
                            isCurrent
                              ? "text-blue-600"
                              : "text-apple-gray-600 group-hover:text-blue-600"
                          }`}
                        />
                      </div>
                      <span className="flex-1 text-base font-semibold text-apple-gray-900">
                        {hostel.name}
                      </span>
                      {isCurrent && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                          Current
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Step 2: Email + Password */}
          {step === "credentials" && (
            <form onSubmit={handleCreateAccount} className="space-y-5">
              {/* Hostel Badge */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-900">
                  {selectedHostel}
                </span>
              </div>

              {/* Full Name */}
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-semibold text-apple-gray-900 mb-2"
                >
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-apple-gray-400" />
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Jane Doe"
                    className="w-full pl-11 pr-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-apple-gray-900 mb-2"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your.email@example.com"
                  className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-apple-gray-900 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-semibold text-apple-gray-900 mb-2"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                  className={`w-full px-4 py-3 bg-apple-gray-50 border rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    confirmPassword && password !== confirmPassword
                      ? "border-red-300 focus:ring-red-500"
                      : "border-apple-gray-200 focus:ring-blue-500"
                  }`}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-600 mt-2">
                    Passwords don&apos;t match yet.
                  </p>
                )}
                {confirmPassword &&
                  password === confirmPassword &&
                  password.length >= 6 && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Passwords match.
                    </p>
                  )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating account...
                  </span>
                ) : (
                  "Create Account"
                )}
              </button>
            </form>
          )}

          {/* Step 3: Verification Code */}
          {step === "verify" && (
            <>
              {/* While verifyOnly waits for Firebase Auth to resolve currentUserId */}
              {verifyOnly && !currentUserId ? (
                <div className="flex items-center justify-center gap-3 py-8 text-apple-gray-500">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading your account…</span>
                </div>
              ) : (
                <form onSubmit={handleVerify} className="space-y-5">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Mail className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-sm text-apple-gray-600">
                      Check your inbox at{" "}
                      <span className="font-semibold text-apple-gray-900">
                        {email}
                      </span>
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="code"
                      className="block text-sm font-semibold text-apple-gray-900 mb-2 text-center"
                    >
                      Verification Code
                    </label>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) =>
                        setVerificationCode(e.target.value.replace(/\D/g, ""))
                      }
                      required
                      placeholder="000000"
                      className="w-full px-4 py-4 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-2xl font-mono tracking-[0.5em]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || verificationCode.length !== 6}
                    className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Verifying...
                      </span>
                    ) : (
                      "Verify Email"
                    )}
                  </button>

                  {resendNotice && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{resendNotice}</span>
                    </div>
                  )}

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={loading || resendCooldown > 0}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : "Didn't receive the code? Resend"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-apple-gray-900 mb-2">
                {updateMode ? "Hostel Updated!" : "Account Verified!"}
              </h2>
              <p className="text-apple-gray-600 text-sm mb-6">
                Redirecting to your dashboard...
              </p>
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
          )}

          {/* Sign In Link (visible on first two steps, hidden in update mode) */}
          {!updateMode && (step === "hostel" || step === "credentials") && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-apple-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-apple-gray-500">
                    Already have an account?
                  </span>
                </div>
              </div>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center w-full px-6 py-3 border border-apple-gray-300 text-apple-gray-700 font-semibold rounded-xl hover:bg-apple-gray-50 transition-colors"
                >
                  Sign In
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-apple-gray-600 mt-6">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="text-blue-600 hover:text-blue-700">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-blue-600 hover:text-blue-700">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
