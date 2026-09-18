"use client";

/**
 * usePlansCheckout — all state and logic behind the plans / checkout page.
 *
 * Moved here UNCHANGED from app/[slug]/plans/page.tsx so both plans routes
 * (/{hostel}/plans and /{location}/{hostel}/plans) share one copy. The only
 * edits: the two routes' hostel lookups sit side by side in one effect, the
 * /register redirects use `plansPath`, and the never-reachable TV "email" /
 * "details" steps were dropped. The collage route now also gets the TV
 * deny-list check it was missing.
 *
 * Please keep these behaviours exactly as they are:
 *  1. handlePurchase(warningAcknowledged) and handleTvPayment(isExisting, …)
 *     take booleans first. Never pass them a click event
 *     (onClick={handlePurchase}) — the event is truthy and skips the
 *     one-time payment warning. Call them as () => handlePurchase().
 *  2. setPendingAction(() => fn) — functional-updater form stores the function.
 *  3. setProcessingClaim(true) runs synchronously in the Paystack callback,
 *     before any await, so the processing sheet appears immediately.
 *  4. /claim and /claim-status read activeReservationId from the render that
 *     opened Paystack (so they send undefined); the server relies on the
 *     Paystack metadata.reservationId. Don't "fix" this with refs/useCallback
 *     without deciding to.
 *  5. A reservation is released only in Paystack's onClose.
 *  6. localStorage keys/formats: "lodgeCodes" (the dashboard reads it),
 *     "userEmail", "lodge-payment-return-warning:{uid}".
 */
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthInstance } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useToast } from "@/components/Toast";
import { generatePaymentRef } from "@/lib/generateRef";
import { checkoutTotal } from "@/lib/pricing";
import { toHostelSlug } from "@/lib/hostelSlug";
import type { DataPlan, Hostel } from "@/types";
import { saveCodeToLocalStorage, type PendingPayment, type PlanView } from "./checkout";

export type PlansParams = { slug: string; hostelSlug?: string };

export function usePlansCheckout(params: PlansParams) {
  // Where /register sends the customer back to after signing in.
  const plansPath = params.hostelSlug
    ? `/${params.slug}/${params.hostelSlug}/plans`
    : `/${params.slug}/plans`;

  const router = useRouter();
  const { addToast } = useToast();
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [showPaymentWarning, setShowPaymentWarning] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  // Drives the post-payment modal's "loading" state. Flipped on the moment
  // Paystack returns success so the modal appears before any API work runs.
  const [processingClaim, setProcessingClaim] = useState(false);
  // True while the recovery poll is running (claim didn't return the code yet).
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState("");
  const [paystackLoaded, setPaystackLoaded] = useState(false);

  // The Paystack <Script> onLoad only fires the FIRST time the script loads.
  // On a client-side navigation (or right after login) where it's already
  // cached, onLoad never re-fires — leaving the button stuck on "Loading
  // payment…" until a hard reload. So don't rely on onLoad alone: detect the
  // global directly, polling briefly in case it's still mid-load.
  useEffect(() => {
    if (paystackLoaded) return;
    if (typeof window !== "undefined" && window.PaystackPop) {
      setPaystackLoaded(true);
      return;
    }
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && window.PaystackPop) {
        setPaystackLoaded(true);
        clearInterval(interval);
      }
    }, 300);
    const timeout = setTimeout(() => clearInterval(interval), 10000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [paystackLoaded]);
  const [planView, setPlanView] = useState<PlanView>("device");
  const [selectedDeviceCount, setSelectedDeviceCount] = useState<number>(3);
  const [email, setEmail] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // TV Purchase flow states
  const [tvPurchaseStep, setTvPurchaseStep] = useState<
    "email" | "details" | "mac" | "password" | null
  >(null);
  const [checkingTvMac, setCheckingTvMac] = useState(false);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [tvName, setTvName] = useState<string>("");
  const [tvMacAddress, setTvMacAddress] = useState<string>("");
  const [tvPassword, setTvPassword] = useState<string>("");
  const [tvConfirmPassword, setTvConfirmPassword] = useState<string>("");
  const [tvPaymentRef, setTvPaymentRef] = useState<string>("");
  const [tvSubscriptionId, setTvSubscriptionId] = useState<string>("");

  // Re-auth state (for session expired)
  const [showReAuth, setShowReAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    ((freshToken: string) => void) | null
  >(null);

  // Feedback states
  const [feedbackName, setFeedbackName] = useState<string>("");
  const [feedbackType, setFeedbackType] = useState<"review" | "complaint">(
    "review",
  );
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Plan availability states
  const [planAvailability, setPlanAvailability] = useState<
    Record<string, { available: boolean; count: number }>
  >({});
  // Holds the dataCodes doc id we've reserved for the current Paystack attempt.
  // Used to release the code if the user closes the popup without paying.
  const [activeReservationId, setActiveReservationId] = useState<string>("");
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [selectedHostel, setSelectedHostel] = useState<string>("");
  const [hostelObj, setHostelObj] = useState<Hostel | null>(null);
  const [hostelReady, setHostelReady] = useState(false);
  const [allHostels, setAllHostels] = useState<Hostel[]>([]);

  // User profile for hostel gate
  const [userProfile, setUserProfile] = useState<{
    hostelId: string;
    emailVerified: boolean;
  } | null>(null);
  const [suggestedHostel, setSuggestedHostel] = useState<string>("");
  const [showHostelConfirm, setShowHostelConfirm] = useState(false);
  const [confirmedHostel, setConfirmedHostel] = useState<string>("");
  const [pendingPurchaseType, setPendingPurchaseType] = useState<
    "device" | "tv" | null
  >(null);
  const hostelJustConfirmed = useRef(false);

  // Dynamic support contacts from sub-admins
  const [supportContacts, setSupportContacts] = useState<
    { username: string; whatsappPhone: string }[]
  >([]);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Resolve the hostel from the URL — the two original pages' effects, unchanged:
  //   /{hostelSlug}/plans               → any hostel whose slug matches
  //   /{collageSlug}/{hostelSlug}/plans → that collage, then its hostel
  useEffect(() => {
    // The same page instance can be reused while moving between hostels.
    // Do not leave the previous hostel's catalogue visible while the new
    // hostel is being resolved.
    setHostelReady(false);
    setSelectedHostel("");
    setHostelObj(null);
    setPlans([]);
    setLoading(true);

    if (params.hostelSlug) {
      Promise.all([
        apiFetch("/api/hostel-collages").then((r) => r.json()),
        apiFetch("/api/hostels").then((r) => r.json()),
      ])
        .then(([collagesData, hostelsData]) => {
          const collage = ((collagesData.collages as any[]) || []).find(
            (c) => c.slug === params.slug,
          );
          if (!collage) {
            router.replace("/");
            return;
          }
          const found = ((hostelsData.hostels as Hostel[]) || []).find(
            (h) =>
              toHostelSlug(h.name) === params.hostelSlug &&
              h.collageId === collage.id,
          );
          if (!found) {
            router.replace("/");
            return;
          }
          setSelectedHostel(found.name);
          setHostelObj(found);
          setAllHostels((hostelsData.hostels as Hostel[]) || []);
          setHostelReady(true);
          // Fetch support contacts for this hostel
          apiFetch(`/api/support-contacts?hostelId=${encodeURIComponent(found.id)}`)
            .then((r) => r.json())
            .then((d) => setSupportContacts(d.contacts ?? []))
            .catch(() => {});
        })
        .catch(() => router.replace("/"));
      return;
    }

    apiFetch("/api/hostels")
      .then((r) => r.json())
      .then((data) => {
        const found = ((data.hostels as Hostel[]) || []).find(
          (h) => toHostelSlug(h.name) === params.slug,
        );
        if (!found) {
          router.replace("/");
          return;
        }
        setSelectedHostel(found.name);
        setHostelObj(found);
        setAllHostels((data.hostels as Hostel[]) || []);
        setHostelReady(true);
        // Fetch support contacts for this hostel
        apiFetch(`/api/support-contacts?hostelId=${encodeURIComponent(found.id)}`)
          .then((r) => r.json())
          .then((d) => setSupportContacts(d.contacts ?? []))
          .catch(() => {});
      })
      .catch(() => router.replace("/"));
  }, [params.slug, params.hostelSlug]);

  // Fetch plans and set up auth once hostel is resolved
  useEffect(() => {
    if (!hostelReady || !selectedHostel) return;

    // Load email from localStorage
    const savedEmail = localStorage.getItem("userEmail");
    if (savedEmail) {
      setEmail(savedEmail);
    }

    fetchPlans();

    // Check if user is logged in (for TV users)
    try {
      const auth = getAuthInstance();
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setCurrentUser(user);
          setEmail(user.email || "");
          // Fetch profile to power hostel gate
          user
            .getIdToken()
            .then((token) =>
              apiFetch(`/api/auth/user?userId=${user.uid}`, {
                headers: { Authorization: `Bearer ${token}` },
              }).then((r) => r.json()),
            )
            .then((data) => {
              if (data.profile) {
                setUserProfile({
                  hostelId: data.profile.hostelId || "",
                  emailVerified: data.profile.emailVerified ?? false,
                });
                // Suggest hostel from most recent purchase
                const latestHostel = (data.purchases as any[])?.[0]?.hostel;
                if (latestHostel && latestHostel !== "N/A") {
                  setSuggestedHostel(latestHostel);
                }
              }
            })
            .catch(() => {});
        } else {
          setCurrentUser(null);
          setUserProfile(null);
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Auth initialization error:", error);
    }
  }, [hostelReady, selectedHostel]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);

  // Clear selected plan if it becomes unavailable
  useEffect(() => {
    if (selectedPlanId && selectedPlan?.planType !== "tv") {
      const availability = planAvailability[selectedPlanId];
      if (availability && !availability.available) {
        setSelectedPlanId("");
        addToast({
          type: "warning",
          title: "Plan No Longer Available",
          message:
            "The selected plan no longer has codes available. Please choose another plan.",
        });
      }
    }
  }, [planAvailability, selectedPlanId, selectedPlan, addToast]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    // Save to localStorage
    localStorage.setItem("userEmail", newEmail);
  };

  const fetchPlans = async () => {
    try {
      const response = await apiFetch(
        `/api/data-plans?hostel=${encodeURIComponent(selectedHostel)}&kind=all`,
      );
      if (!response.ok) throw new Error("Failed to fetch plans");
      const result = await response.json();
      const hostelPlans = ((result.plans || []) as DataPlan[]).filter(
        (plan) => plan.isActive !== false,
      );
      setPlans(hostelPlans);

      // Check availability for every code-backed plan in this hostel. Device
      // and unlimited both draw codes from the same pool; TV issues none. Miss
      // the unlimited plans here and the sold-out gate below has no data to
      // judge them by.
      const codeBackedPlans = hostelPlans.filter(
        (plan) => plan.planType !== "tv",
      );
      if (codeBackedPlans.length > 0) {
        checkPlanAvailability(codeBackedPlans);
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkPlanAvailability = async (codeBackedPlans: DataPlan[]) => {
    setCheckingAvailability(true);

    try {
      // On per-plan fetch failure return `null` so we DON'T pessimistically
      // mark the card as sold out — the reserve API is the source of truth
      // and will catch a real stockout. Treating "unknown" as "sold out" on
      // a flaky connection scared customers off perfectly buyable plans.
      const availabilityPromises = codeBackedPlans.map(async (plan) => {
        try {
          const response = await apiFetch("/api/data-codes/check-availability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planId: plan.id, hostel: selectedHostel }),
          });
          if (!response.ok) return { planId: plan.id, result: null };
          const data = await response.json();
          return {
            planId: plan.id,
            result: { available: data.available, count: data.count },
          };
        } catch (error) {
          console.error(
            `Error checking availability for plan ${plan.id}:`,
            error,
          );
          return { planId: plan.id, result: null };
        }
      });

      const results = await Promise.all(availabilityPromises);

      const availabilityMap: Record<
        string,
        { available: boolean; count: number }
      > = {};
      for (const { planId, result } of results) {
        if (result) availabilityMap[planId] = result;
      }

      setPlanAvailability(availabilityMap);
    } catch (error) {
      console.error("Error checking plan availability:", error);
    } finally {
      setCheckingAvailability(false);
    }
  };

  /** Refresh availability for a single plan after a reserve/release/claim.
   *  Bypasses the server-side check-availability cache so the badge reflects
   *  the new inventory immediately rather than up to 5s later. */
  const fetchPlanAvailability = async (planId: string) => {
    try {
      const res = await apiFetch("/api/data-codes/check-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, hostel: selectedHostel, fresh: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setPlanAvailability((prev) => ({
        ...prev,
        [planId]: { available: data.available, count: data.count },
      }));
    } catch {
      // best-effort
    }
  };

  // Filter plans by type and device count
  const hostelPlanTypes = hostelObj?.planTypes;
  const hostelDeviceCounts = hostelObj?.deviceUserCounts;
  const deviceAllowed =
    !hostelPlanTypes?.length || hostelPlanTypes.includes("device");
  const allow3Devices =
    deviceAllowed &&
    (!hostelDeviceCounts?.length || hostelDeviceCounts.includes(3));
  const allow5Devices =
    deviceAllowed &&
    (!hostelDeviceCounts?.length || hostelDeviceCounts.includes(5));

  // Open on a tab the hostel actually offers — e.g. if only 5-user device
  // plans are enabled, don't land on the now-hidden "3 Devices" tab. Runs
  // once, after the hostel config loads.
  const defaultTabPicked = useRef(false);
  useEffect(() => {
    if (!hostelObj || defaultTabPicked.current) return;
    defaultTabPicked.current = true;
    if (allow3Devices) {
      setPlanView("device");
      setSelectedDeviceCount(3);
    } else if (allow5Devices) {
      setPlanView("device");
      setSelectedDeviceCount(5);
    } else if (
      !hostelPlanTypes?.length ||
      hostelPlanTypes.includes("unlimited")
    ) {
      setPlanView("unlimited");
    } else if (!hostelPlanTypes?.length || hostelPlanTypes.includes("tv")) {
      setPlanView("tv");
    }
  }, [hostelObj, allow3Devices, allow5Devices, hostelPlanTypes]);

  const filteredPlans = plans.filter((plan) => {
    if (hostelPlanTypes?.length && !hostelPlanTypes.includes(plan.planType))
      return false;
    if (planView === "device") {
      return (
        plan.planType === "device" && plan.usersCount === selectedDeviceCount
      );
    } else if (planView === "unlimited") {
      return plan.planType === "unlimited";
    } else {
      return plan.planType === "tv";
    }
  });

  // Group device plans by name to avoid duplicates
  const displayPlans =
    planView === "device"
      ? Array.from(new Set(filteredPlans.map((p) => p.name))).map(
          (name) => filteredPlans.find((p) => p.name === name)!,
        )
      : filteredPlans;

  // Returns true if the user may proceed; false means we've already handled the
  // block (shown a toast / opened the confirmation modal).
  const checkHostelGate = (purchaseType: "device" | "tv"): boolean => {
    // Bypass once immediately after user confirms their hostel in the modal
    if (hostelJustConfirmed.current) {
      hostelJustConfirmed.current = false;
      return true;
    }

    if (!userProfile) return true; // profile not loaded yet — server will enforce

    if (!userProfile.emailVerified) {
      addToast({
        type: "warning",
        title: "Email Not Verified",
        message: "Please verify your email before making a purchase.",
      });
      router.push(
        `/register?email=${encodeURIComponent(email)}&verify=1&redirect=${encodeURIComponent(plansPath)}`,
      );
      return false;
    }

    // Hostel mismatch — account belongs to a different hostel
    if (
      userProfile.hostelId &&
      userProfile.hostelId !== "Unknown" &&
      userProfile.hostelId !== selectedHostel
    ) {
      addToast({
        type: "error",
        title: "Wrong Hostel",
        message: `Your account is registered for ${userProfile.hostelId}. You can't purchase plans from a different hostel.`,
      });
      return false;
    }

    // No hostel set yet — prompt the user to confirm
    if (!userProfile.hostelId || userProfile.hostelId === "Unknown") {
      setConfirmedHostel(suggestedHostel || selectedHostel);
      setPendingPurchaseType(purchaseType);
      setShowHostelConfirm(true);
      return false;
    }

    return true;
  };

  const handleHostelConfirmed = async () => {
    if (!confirmedHostel || !currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const res = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: currentUser.uid, hostelId: confirmedHostel }),
      });
      if (!res.ok) throw new Error("Failed to update hostel");

      setUserProfile((prev) =>
        prev ? { ...prev, hostelId: confirmedHostel } : prev,
      );
      hostelJustConfirmed.current = true;
      setShowHostelConfirm(false);

      if (pendingPurchaseType === "device") {
        handlePurchase();
      } else if (pendingPurchaseType === "tv") {
        handleTvPurchaseStart();
      }
      setPendingPurchaseType(null);
    } catch {
      addToast({
        type: "error",
        title: "Update Failed",
        message: "Could not save your hostel. Please try again.",
      });
    }
  };

  const paymentWarningKey = currentUser?.uid
    ? `lodge-payment-return-warning:${currentUser.uid}`
    : "";

  const handlePurchase = async (warningAcknowledged = false) => {
    if (!selectedPlan) {
      setError("Please select a plan");
      return;
    }

    // Auth gate — require login before purchase
    if (!currentUser) {
      addToast({
        type: "warning",
        title: "Sign In Required",
        message: "Please sign in or create an account to purchase a plan.",
      });
      router.push(
        `/register?hostel=${encodeURIComponent(selectedHostel)}&email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(plansPath)}`,
      );
      return;
    }

    // Hostel / verification gate
    if (!checkHostelGate("device")) return;

    // Unlimited plans draw from the same code pool as device plans, so both
    // have to be checked — only TV issues no code.
    if (selectedPlan.planType !== "tv") {
      const availability = planAvailability[selectedPlan.id];
      if (!availability?.available) {
        addToast({
          type: "error",
          title: "Plan Not Available",
          message:
            "No codes are currently available for this plan. Please select a different plan.",
        });
        return;
      }
    }

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address for receipt");
      return;
    }

    if (!paystackLoaded || !window.PaystackPop) {
      setError(
        "Payment system is still loading. Please try again in a moment.",
      );
      return;
    }

    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!paystackKey || paystackKey === "your_paystack_public_key_here") {
      addToast({
        type: "error",
        title: "Configuration Error",
        message: "Paystack is not configured. Please contact support.",
      });
      return;
    }

    if (
      !warningAcknowledged &&
      paymentWarningKey &&
      localStorage.getItem(paymentWarningKey) !== "acknowledged"
    ) {
      setPendingPayment({ kind: "device" });
      setShowPaymentWarning(true);
      return;
    }

    setPurchasing(true);
    setError("");

    try {
      // Reserve a code atomically before opening Paystack. This guarantees
      // exclusive access to one code while the user pays — concurrent buyers
      // racing for the last code will get a clean "no codes" response here
      // instead of taking each other's code mid-payment.
      const idToken = await currentUser.getIdToken().catch(() => "");
      const reserveRes = await apiFetch("/api/data-codes/reserve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          planId: selectedPlan.id,
          hostel: selectedHostel,
        }),
      });

      const reserveData = await reserveRes.json();

      if (!reserveRes.ok) {
        setError(
          reserveData?.error ||
            `Sorry, there are no available codes for ${selectedPlan.name} at the moment. Please try another plan or check back later.`,
        );
        setPurchasing(false);
        // Refresh availability so the UI updates with the latest count.
        if (selectedPlan.planType !== "tv") {
          fetchPlanAvailability(selectedPlan.id);
        }
        return;
      }

      const reservationId: string = reserveData.reservationId;
      setActiveReservationId(reservationId);

      // Refresh availability so the stock badge reflects the held code
      // immediately (count drops by 1 because the reserved code is filtered out).
      if (selectedPlan.planType !== "tv") {
        fetchPlanAvailability(selectedPlan.id);
      }

      // Proceed with payment now that the code is held.
      const totalAmount = checkoutTotal(selectedPlan.price);
      let paymentSucceeded = false;
      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: email,
        amount: totalAmount * 100, // Paystack expects amount in kobo
        currency: "NGN",
        ref: generatePaymentRef(selectedHostel, selectedPlan.planType),
        metadata: {
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          planType: selectedPlan.planType || "device",
          usersCount: selectedPlan.usersCount,
          hostel: selectedHostel,
          reservationId,
        },
        onClose: function () {
          if (paymentSucceeded) return;
          setPurchasing(false);
          // User closed without paying — return the code to inventory.
          releaseReservation(reservationId);
          setActiveReservationId("");
        },
        callback: function (response: any) {
          paymentSucceeded = true;
          // Show the modal in its "Processing your code..." state IMMEDIATELY
          // so the user gets visual confirmation before any API call runs.
          // It will morph into the code-reveal state once /claim returns.
          setProcessingClaim(true);
          handlePaymentSuccess(response.reference);
        },
      });

      handler.openIframe();
    } catch (err: any) {
      console.error("Error during reserve/payment setup:", err);
      setError(
        err?.message || "Failed to start payment. Please try again.",
      );
      setPurchasing(false);
    }
  };

  /**
   * Release a held reservation (best-effort, fire-and-forget).
   */
  const releaseReservation = async (reservationId: string) => {
    if (!reservationId || !currentUser) return;
    try {
      const idToken = await currentUser.getIdToken().catch(() => "");
      await apiFetch("/api/data-codes/release", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ reservationId }),
      });
      // Refresh inventory count after release so the UI shows it's free again
      if (selectedPlan && selectedPlan.planType !== "tv") {
        fetchPlanAvailability(selectedPlan.id);
      }
    } catch {
      // Reservation will auto-expire — non-fatal.
    }
  };

  // Persist the code to the buyer's device (encrypted), then reveal it on
  // screen. Shared by the direct claim path and the recovery poll so both
  // surface the code identically.
  const revealCode = async (code: string) => {
    if (code && selectedPlan && currentUser?.uid) {
      await saveCodeToLocalStorage(code, selectedPlan.name, currentUser.uid);
    }
    // Small settle delay so the "Processing…" state hands off cleanly.
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRevealedCode(code);
    setActiveReservationId("");
    if (selectedPlan && selectedPlan.planType !== "tv") {
      fetchPlanAvailability(selectedPlan.id);
    }
  };

  // Recovery: if the direct /claim didn't hand back the code (timeout, network
  // blip, browser closed too early), poll /claim-status until the code is issued
  // — by us, the webhook, or this poll itself — or we learn it's genuinely
  // unfulfilled. The payment is already safe on the server throughout.
  const recoverCode = async (reference: string) => {
    setRecovering(true);
    const MAX_ATTEMPTS = 18; // ~75s total at 4s spacing
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 4000));
      try {
        const idToken = currentUser
          ? await currentUser.getIdToken().catch(() => "")
          : "";
        const res = await apiFetch("/api/data-codes/claim-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            paymentRef: reference,
            planId: selectedPlanId,
            hostel: selectedHostel,
            reservationId: activeReservationId || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === "ready" && data.code) {
          await revealCode(data.code);
          return;
        }
        if (res.ok && data.status === "unfulfilled") {
          setError(
            "Your payment was received but a code couldn't be issued (it may be out of stock). Our team has been notified — please keep your payment reference: " +
              reference,
          );
          return;
        }
        // pending / transient — keep polling.
      } catch {
        // Network blip — keep polling.
      }
    }
    // Still not issued after the window — payment is safe; the code will be
    // emailed and is recoverable from the dashboard.
    setError(
      "Your payment was confirmed and your code is being issued. It will be emailed to you and saved to your dashboard shortly — please keep your payment reference: " +
        reference,
    );
  };

  const handlePaymentSuccess = async (
    reference: string,
    overrideToken?: string,
  ) => {
    try {
      // Get a fresh ID token to send with the claim request.
      let idToken = overrideToken || "";
      if (!idToken && currentUser) {
        try {
          idToken = await currentUser.getIdToken();
        } catch {
          // Token fetch failed — recovery still covers us.
        }
      }

      try {
        // Abort a hung claim after 15s so we fall through to recovery rather
        // than spin forever on a bad connection.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let response: Response;
        try {
          response = await apiFetch("/api/data-codes/claim", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify({
              planId: selectedPlanId,
              email: email,
              paymentRef: reference,
              hostel: selectedHostel,
              reservationId: activeReservationId || undefined,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        const result = await response.json();

        // Session too old — re-auth, then retry the claim (unchanged flow).
        if (result.code === "SESSION_EXPIRED") {
          setPendingAction(() => (freshToken: string) => {
            handlePaymentSuccess(reference, freshToken);
          });
          setShowReAuth(true);
          return;
        }

        if (response.ok && result.code) {
          await revealCode(result.code);
          return;
        }
        // Any other non-success (out of stock, delivery error, 5xx) → recover.
      } catch (claimErr) {
        // Timeout / network / abort → recover.
        console.error("Claim failed, entering recovery:", claimErr);
      }

      await recoverCode(reference);
    } finally {
      setPurchasing(false);
      // Cleared on success too (the modal flips to reveal via revealedCode).
      setProcessingClaim(false);
      setRecovering(false);
    }
  };

  const copyToClipboard = () => {
    if (revealedCode) {
      navigator.clipboard.writeText(revealedCode);
      addToast({
        type: "success",
        title: "Code Copied",
        message: "Code copied to clipboard!",
      });
    }
  };

  // TV Purchase Flow Functions
  const handleTvPurchaseStart = async () => {
    if (!selectedPlan) {
      setError("Please select a TV plan");
      return;
    }

    setError("");

    // Auth gate — require login before purchase
    if (!currentUser) {
      addToast({
        type: "warning",
        title: "Sign In Required",
        message: "Please sign in or create an account to purchase a plan.",
      });
      router.push(
        `/register?hostel=${encodeURIComponent(selectedHostel)}&email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(plansPath)}`,
      );
      return;
    }

    // Hostel / verification gate
    if (!checkHostelGate("tv")) return;

    setIsExistingUser(true);

    // First-time TV buyer? Ask for MAC before payment.
    setCheckingTvMac(true);
    try {
      const idToken = await currentUser.getIdToken().catch(() => "");
      const res = await apiFetch("/api/tv/subscriptions", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json().catch(() => ({ subscriptions: [] }));
      const hasMac = (data.subscriptions || []).some(
        (s: any) => s.hasMacAddress === true,
      );
      if (!hasMac) {
        setTvMacAddress("");
        setTvPurchaseStep("mac");
        return;
      }
    } catch {
      // If the check fails, fall through to ask for MAC defensively.
      setTvMacAddress("");
      setTvPurchaseStep("mac");
      return;
    } finally {
      setCheckingTvMac(false);
    }

    // Returning TV buyer — go straight to payment
    handleTvPayment(true);
  };

  const handleTvMacSubmit = () => {
    const mac = tvMacAddress.trim();
    if (!mac) {
      setError("Please enter your TV MAC address");
      return;
    }
    const macRegex =
      /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;
    if (!macRegex.test(mac)) {
      setError("Please enter a valid MAC address (e.g., 00:1A:2B:3C:4D:5E)");
      return;
    }

    setError("");
    setTvPurchaseStep(null);
    handleTvPayment(true);
  };

  const handleTvPayment = async (isExisting: boolean, warningAcknowledged = false) => {
    if (!selectedPlan || !paystackLoaded || !window.PaystackPop) {
      setError("Payment system is not ready. Please try again.");
      return;
    }

    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!paystackKey) {
      addToast({
        type: "error",
        title: "Configuration Error",
        message: "Paystack is not configured. Please contact support.",
      });
      return;
    }

    if (
      !warningAcknowledged &&
      paymentWarningKey &&
      localStorage.getItem(paymentWarningKey) !== "acknowledged"
    ) {
      setPendingPayment({ kind: "tv", isExisting });
      setShowPaymentWarning(true);
      return;
    }

    setPurchasing(true);
    setError("");

    try {
      // Ask the backend before opening Paystack. It owns the deny list and
      // knows whether this TV already has a subscription running, so a blocked
      // device is turned away while the customer still has their money.
      if (tvMacAddress.trim()) {
        try {
          const checkRes = await apiFetch("/api/tv/check-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              macAddress: tvMacAddress.trim(),
              hostel: selectedHostel,
              email,
            }),
          });
          const check = await checkRes.json();
          if (checkRes.ok && check.allowed === false) {
            setError(check.message || "This device cannot be used for a TV plan right now.");
            setPurchasing(false);
            return;
          }
          if (checkRes.ok && check.reason === "already_active") {
            // A warning, not a refusal — buying again tops this TV up rather
            // than starting a second subscription, so say so before charging.
            if (!window.confirm(`${check.message}\n\nContinue and extend it?`)) {
              setPurchasing(false);
              return;
            }
          }
        } catch {
          // A failed check is not a refusal; the purchase path checks again.
        }
      }

      const totalAmount = checkoutTotal(selectedPlan.price);
      let paymentSucceeded = false;
      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: email,
        amount: totalAmount * 100,
        currency: "NGN",
        ref: generatePaymentRef(selectedHostel, "tv"),
        metadata: {
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          planType: "tv",
          isExistingUser: isExisting,
          name: isExisting ? "" : tvName,
          macAddress: tvMacAddress,
          hostel: selectedHostel,
        },
        callback: (response: any) => {
          paymentSucceeded = true;
          handleTvPaymentSuccess(response, isExisting);
        },
        onClose: () => {
          if (paymentSucceeded) return;
          setPurchasing(false);
          setError("Payment was cancelled");
        },
      });

      handler.openIframe();
    } catch (err: any) {
      console.error("Payment error:", err);
      setError("Failed to initiate payment");
      setPurchasing(false);
    }
  };

  const acknowledgePaymentWarning = () => {
    if (!pendingPayment) return;
    if (paymentWarningKey) localStorage.setItem(paymentWarningKey, "acknowledged");
    const payment = pendingPayment;
    setPendingPayment(null);
    setShowPaymentWarning(false);
    if (payment.kind === "device") {
      handlePurchase(true);
    } else {
      handleTvPayment(payment.isExisting, true);
    }
  };

  const handleTvPaymentSuccess = async (
    response: any,
    isExisting: boolean,
    overrideToken?: string,
  ) => {
    const reference = response.reference || tvPaymentRef;
    setTvPaymentRef(reference);

    try {
      // Get ID token for server-side verification
      let idToken = overrideToken || "";
      if (!idToken && currentUser) {
        try {
          idToken = await currentUser.getIdToken();
        } catch {
          // Token fetch failed
        }
      }

      const purchaseResponse = await apiFetch("/api/tv/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: isExisting ? "" : tvName.trim(),
          macAddress: tvMacAddress.trim(),
          planId: selectedPlan!.id,
          paymentRef: reference,
          isNewUser: !isExisting,
          hostel: selectedHostel,
        }),
      });

      const result = await purchaseResponse.json();

      // Handle session expired
      if (result.code === "SESSION_EXPIRED") {
        setPendingAction(() => (freshToken: string) => {
          handleTvPaymentSuccess(response, isExisting, freshToken);
        });
        setShowReAuth(true);
        return;
      }

      if (!purchaseResponse.ok) {
        throw new Error(result.error || "Failed to process purchase");
      }

      setTvSubscriptionId(result.subscriptionId);

      if (result.isNewUser) {
        // Show password creation modal
        setTvPurchaseStep("password");
      } else {
        // Redirect to dashboard
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      console.error("Error processing TV purchase:", err);
      setError(
        err.message ||
          "Payment successful but failed to activate subscription. Please contact support.",
      );
    } finally {
      setPurchasing(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!tvPassword.trim() || tvPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (tvPassword !== tvConfirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError("");
    setPurchasing(true);

    try {
      // Create Firebase Auth account on client side
      const auth = getAuthInstance();
      const { createUserWithEmailAndPassword } = await import("firebase/auth");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        tvPassword,
      );
      const user = userCredential.user;

      // Fetch a fresh ID token so the server can verify ownership
      const idToken = await user.getIdToken().catch(() => "");

      // Link user to subscription
      const response = await apiFetch("/api/tv/create-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          subscriptionId: tvSubscriptionId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to link account to subscription",
        );
      }

      // Redirect to dashboard
      addToast({
        type: "success",
        title: "Account Created",
        message: "Account created successfully! Redirecting to dashboard...",
      });
      window.location.href = "/dashboard";
    } catch (err: any) {
      console.error("Error creating account:", err);
      // Handle specific Firebase Auth errors
      if (err.code === "auth/email-already-in-use") {
        setError(
          "An account with this email already exists. Please use the login page.",
        );
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please choose a stronger password.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address.");
      } else {
        setError(err.message || "Failed to create account");
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackName.trim() || !feedbackMessage.trim()) {
      setError("Please enter your name and feedback message");
      return;
    }

    setSubmittingFeedback(true);
    setError("");

    try {
      const response = await apiFetch("/api/data-codes/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: feedbackName,
          email: email,
          planName: selectedPlan?.name || "",
          type: feedbackType,
          rating: feedbackType === "review" ? feedbackRating : null,
          message: feedbackMessage,
          hostel: selectedHostel,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to submit feedback");
      }

      setFeedbackSubmitted(true);
      setFeedbackName("");
      setFeedbackMessage("");
    } catch (err: any) {
      console.error("Error submitting feedback:", err);
      setError(err?.message || "Failed to submit feedback");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // ── Derived UI state ─────────────────────────────────────────────────────
  // These lived inline in the old page's JSX; the conditions are unchanged.

  // Plan-type tabs this hostel offers.
  const allowUnlimited =
    !hostelPlanTypes?.length || hostelPlanTypes.includes("unlimited");
  const allowTv = !hostelPlanTypes?.length || hostelPlanTypes.includes("tv");

  // Tab click: switch view (and device count), clear selection and TV step.
  const selectTab = (view: PlanView, deviceCount?: number) => {
    setPlanView(view);
    if (deviceCount !== undefined) setSelectedDeviceCount(deviceCount);
    setSelectedPlanId("");
    setTvPurchaseStep(null);
  };

  // Stock for one plan card. Optimistic: unknown availability = available;
  // the reserve API is the real gate. TV never sells out.
  const planStock = (plan: DataPlan) => {
    const availability = planAvailability[plan.id];
    const isCodeBackedPlan = plan.planType !== "tv";
    const knownUnavailable =
      isCodeBackedPlan &&
      availability !== undefined &&
      availability.available === false;
    const hasAvailabilityData = isCodeBackedPlan && availability !== undefined;
    return {
      isAvailable: !knownUnavailable,
      hasAvailabilityData,
      codeCount: availability?.count ?? 0,
    };
  };

  const showLoading = loading || (planView === "device" && checkingAvailability);

  // Selected (code-backed) plan explicitly out of stock.
  const codesNotAvailable = selectedPlan
    ? planAvailability[selectedPlan.id]?.available === false
    : false;
  const payDisabled =
    purchasing || !!revealedCode || !paystackLoaded || !email || codesNotAvailable;
  const tvDisabled = purchasing || !paystackLoaded || checkingTvMac;
  const showCodeSheet = processingClaim || !!revealedCode;

  const closeTvMac = () => {
    setTvPurchaseStep(null);
    setError("");
  };
  const cancelHostelConfirm = () => {
    setShowHostelConfirm(false);
    setPendingPurchaseType(null);
  };
  const completeReAuth = (freshToken: string) => {
    setShowReAuth(false);
    if (pendingAction) {
      pendingAction(freshToken);
      setPendingAction(null);
    }
  };
  const cancelReAuth = () => {
    setShowReAuth(false);
    setPendingAction(null);
    setPurchasing(false);
  };

  return {
    // hostel
    selectedHostel,
    hostelObj,
    hostelReady,
    allHostels,
    // plans + tabs
    plans,
    displayPlans,
    selectedPlan,
    selectedPlanId,
    setSelectedPlanId,
    planView,
    selectedDeviceCount,
    allow3Devices,
    allow5Devices,
    allowUnlimited,
    allowTv,
    selectTab,
    planStock,
    loading,
    showLoading,
    // customer
    currentUser,
    email,
    handleEmailChange,
    error,
    setError,
    // payment
    paystackLoaded,
    setPaystackLoaded,
    purchasing,
    handlePurchase,
    codesNotAvailable,
    payDisabled,
    showPaymentWarning,
    acknowledgePaymentWarning,
    // after payment
    processingClaim,
    recovering,
    revealedCode,
    setRevealedCode,
    showCodeSheet,
    copyToClipboard,
    // TV
    tvPurchaseStep,
    tvMacAddress,
    setTvMacAddress,
    checkingTvMac,
    tvDisabled,
    handleTvPurchaseStart,
    handleTvMacSubmit,
    closeTvMac,
    tvPassword,
    setTvPassword,
    tvConfirmPassword,
    setTvConfirmPassword,
    handleCreateAccount,
    // feedback
    feedbackName,
    setFeedbackName,
    feedbackType,
    setFeedbackType,
    feedbackRating,
    setFeedbackRating,
    feedbackMessage,
    setFeedbackMessage,
    feedbackSubmitted,
    submittingFeedback,
    handleFeedbackSubmit,
    // hostel confirmation
    showHostelConfirm,
    confirmedHostel,
    setConfirmedHostel,
    suggestedHostel,
    handleHostelConfirmed,
    cancelHostelConfirm,
    // re-auth
    showReAuth,
    completeReAuth,
    cancelReAuth,
    // support
    supportContacts,
    showSupportModal,
    setShowSupportModal,
  };
}

export type PlansCheckout = ReturnType<typeof usePlansCheckout>;
