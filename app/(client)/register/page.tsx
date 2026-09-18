"use client";
import { apiFetch } from "@/lib/apiClient";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createUserWithEmailAndPassword, onAuthStateChanged, type User } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import { Building2, Check, CheckCircle2, ChevronLeft, Mail } from "lucide-react";
import Link from "next/link";
import { displayName } from "@/lib/hostelSlug";
import AuthShell, { AuthFallback } from "@/components/client/AuthShell";
import TextField from "@/components/ui/TextField";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Monogram from "@/components/ui/Monogram";
import Spinner from "@/components/ui/Spinner";
import InlineAlert from "@/components/ui/InlineAlert";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import CodeBoxes from "@/components/ui/CodeBoxes";

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
  collageId?: string;
}

interface School { id: string; name: string; slug: string; }
interface College { id: string; name: string; schoolId?: string; }

type Step = "hostel" | "credentials" | "verify" | "done";

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthFallback />}>
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
  const [schools, setSchools] = useState<School[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>("");
  const [selectedCollege, setSelectedCollege] = useState<string>("");
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
    Promise.all([
      apiFetch("/api/hostels").then((r) => r.json()),
      apiFetch("/api/hostel-schools").then((r) => r.json()),
      apiFetch("/api/hostel-collages").then((r) => r.json()),
    ])
      .then(([hostelData, schoolData, collegeData]) => {
        setHostels(hostelData.hostels || []);
        setSchools(schoolData.schools || []);
        setColleges(collegeData.collages || []);
      })
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

  // ── Presentation ──────────────────────────────────────────────────────────
  // Everything above is the original registration logic, unchanged.

  const titles: Record<Step, string> = {
    hostel: updateMode ? "Update Your Hostel" : "Select Your Hostel",
    credentials: "Create your account",
    verify: "Verify Email",
    done: "You're All Set!",
  };
  const subtitles: Record<Step, string> = {
    hostel: updateMode ? "Choose the hostel linked to your account" : "Choose the hostel where you stay",
    credentials: `Create your account for ${selectedHostel}`,
    verify: `Enter the 6-digit code sent to ${email}`,
    done: updateMode ? "Your hostel has been updated" : "Your account has been verified",
  };
  const showTabs = !updateMode && (step === "hostel" || step === "credentials");
  const stepIndex = { hostel: 0, credentials: 1, verify: 2, done: 3 }[step];

  return (
    <AuthShell tabs={showTabs ? "register" : undefined} title={titles[step]} subtitle={subtitles[step]}>
      {/* Progress (hostel → account → verify) */}
      {!updateMode && step !== "done" && (
        <div className="-mt-3 mb-6 flex gap-1.5" aria-label={`Step ${stepIndex + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cx("h-1 flex-1 rounded-full transition-colors duration-300", i <= stepIndex ? "bg-accent" : "bg-ink/10")}
            />
          ))}
        </div>
      )}

      {/* Back — hidden on verify/done where going "back" is unsafe (would
          either lose verification progress or orphan a Firebase Auth account). */}
      {step === "credentials" && (
        <button
          onClick={() => {
            setStep("hostel");
            setError("");
          }}
          className="ui-subhead -mt-2 mb-4 inline-flex items-center gap-0.5 font-medium text-accent-ink"
        >
          <ChevronLeft className="h-5 w-5" /> Change Hostel
        </button>
      )}
      {step === "hostel" && verifyOnly && (
        <button onClick={() => router.back()} className="ui-subhead -mt-2 mb-4 inline-flex items-center gap-0.5 font-medium text-accent-ink">
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
      )}

      {error && step !== "done" && <InlineAlert className="mb-5">{error}</InlineAlert>}

      {/* ── Step 1: hostel ─────────────────────────────────────────────── */}
      {step === "hostel" && (
        <div className="space-y-4">
          {updateMode && (
            <InlineAlert tone="info">
              Select your hostel below — your account will be linked and you can purchase plans straight away.
            </InlineAlert>
          )}
          {loading ? (
            <div className="ui-subhead flex items-center justify-center gap-3 py-8 text-ink-2">
              <Spinner /> Updating…
            </div>
          ) : loadingHostels ? (
            <ListSkeleton rows={4} />
          ) : hostels.length === 0 ? (
            <EmptyState icon={<Building2 />} title="No hostels available" />
          ) : (
            <>
              {schools.length > 0 && !selectedSchool && (
                <GroupedList header="First choose your school">
                  {schools.map((school) => (
                    <ListRow
                      key={school.id}
                      onClick={() => setSelectedSchool(school.id)}
                      leading={<Monogram name={school.name} kind="school" />}
                      title={displayName(school.name)}
                    />
                  ))}
                </GroupedList>
              )}

              {selectedSchool && !selectedCollege && (
                <>
                  <button onClick={() => setSelectedSchool("")} className="ui-subhead inline-flex items-center gap-0.5 font-medium text-accent-ink">
                    <ChevronLeft className="h-5 w-5" /> Change school
                  </button>
                  <GroupedList header="Now choose your college">
                    {colleges
                      .filter((college) => college.schoolId === selectedSchool)
                      .map((college) => (
                        <ListRow
                          key={college.id}
                          onClick={() => setSelectedCollege(college.id)}
                          leading={<Monogram name={college.name} kind="location" />}
                          title={displayName(college.name)}
                        />
                      ))}
                  </GroupedList>
                </>
              )}

              {(!schools.length || (selectedSchool && selectedCollege)) && (
                <>
                  {selectedCollege && (
                    <button onClick={() => setSelectedCollege("")} className="ui-subhead inline-flex items-center gap-0.5 font-medium text-accent-ink">
                      <ChevronLeft className="h-5 w-5" /> Change college
                    </button>
                  )}
                  <GroupedList header="Your hostel">
                    {hostels
                      .filter((hostel) => !selectedCollege || hostel.collageId === selectedCollege)
                      .map((hostel) => {
                        const isCurrent = updateMode && currentHostel && hostel.name === currentHostel;
                        return (
                          <ListRow
                            key={hostel.id}
                            onClick={() => handleHostelSelect(hostel.name)}
                            leading={<Monogram name={hostel.name} />}
                            title={hostel.name}
                            trailing={isCurrent ? <Badge tone="accent">Current</Badge> : undefined}
                          />
                        );
                      })}
                  </GroupedList>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Step 2: account details ────────────────────────────────────── */}
      {step === "credentials" && (
        <form onSubmit={handleCreateAccount} className="space-y-5">
          <div className="flex items-center gap-2.5 rounded-2xl bg-accent/10 px-4 py-3 text-accent-ink">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="ui-subhead font-medium">{selectedHostel}</span>
          </div>

          <TextField
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Jane Doe"
          />
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
            minLength={6}
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
            placeholder="Re-enter your password"
            error={confirmPassword && password !== confirmPassword ? "Passwords don't match yet." : null}
            hint={
              confirmPassword && password === confirmPassword && password.length >= 6 ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Passwords match.
                </span>
              ) : undefined
            }
          />

          <Button type="submit" full loading={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
      )}

      {/* ── Step 3: verification code ──────────────────────────────────── */}
      {step === "verify" && (
        <>
          {/* While verifyOnly waits for Firebase Auth to resolve currentUserId */}
          {verifyOnly && !currentUserId ? (
            <div className="ui-subhead flex items-center justify-center gap-3 py-8 text-ink-2">
              <Spinner /> Loading your account…
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3">
                <Mail className="h-5 w-5 shrink-0 text-accent-ink" />
                <span className="ui-subhead text-ink-2">
                  Check your inbox at <span className="font-semibold text-ink">{email}</span>
                </span>
              </div>

              <CodeBoxes value={verificationCode} onChange={(v) => setVerificationCode(v.replace(/\D/g, ""))} />

              <Button type="submit" full loading={loading} disabled={verificationCode.length !== 6}>
                {loading ? "Verifying..." : "Verify Email"}
              </Button>

              {resendNotice && <InlineAlert tone="info">{resendNotice}</InlineAlert>}

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading || resendCooldown > 0}
                  className="ui-subhead font-medium text-accent-ink disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't receive the code? Resend"}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* ── Step 4: done ───────────────────────────────────────────────── */}
      {step === "done" && (
        <div className="py-4 text-center">
          <span className="mx-auto flex h-16 w-16 animate-check-pop items-center justify-center rounded-full bg-success text-white">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <h2 className="ui-title-2 mt-4 text-ink">{updateMode ? "Hostel Updated!" : "Account Verified!"}</h2>
          <p className="ui-subhead mt-1 text-ink-2">Redirecting to your dashboard...</p>
          <Spinner className="mx-auto mt-5 h-7 w-7 text-ink-3" />
        </div>
      )}

      {showTabs && (
        <p className="ui-subhead mt-6 text-center text-ink-2">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent-ink">
            Sign In
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
