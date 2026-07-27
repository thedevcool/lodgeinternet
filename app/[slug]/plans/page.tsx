"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { collection, getDocsFromServer, orderBy, query } from "firebase/firestore";
import { db, isFirebaseConfigured, getAuthInstance } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { KeyRound, Wifi, Smartphone, Tv, LogIn, Copy } from "lucide-react";
import { useToast } from "@/components/Toast";
import ReAuthModal from "@/components/ReAuthModal";
import WhatsAppBotCTA from "@/components/WhatsAppBotCTA";
import { generatePaymentRef } from "@/lib/generateRef";
import { toHostelSlug } from "@/lib/hostelSlug";
import { encryptForStorage } from "@/lib/localStorageCrypto";
import type { DataPlan, Hostel } from "@/types";

interface StoredCode {
  code: string; // encrypted
  planName: string;
  savedAt: number;
}

async function saveCodeToLocalStorage(code: string, planName: string, uid: string) {
  try {
    const raw = localStorage.getItem("lodgeCodes");
    const codes: StoredCode[] = raw ? JSON.parse(raw) : [];
    const encrypted = await encryptForStorage(code, uid);
    codes.unshift({ code: encrypted, planName, savedAt: Date.now() });
    if (codes.length > 20) codes.length = 20;
    localStorage.setItem("lodgeCodes", JSON.stringify(codes));
  } catch {
    // localStorage or crypto unavailable
  }
}

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

type PlanView = "device" | "tv" | "unlimited";
type PendingPayment =
  | { kind: "device" }
  | { kind: "tv"; isExisting: boolean };

export default function HostelPlansPage({
  params,
}: {
  params: { slug: string };
}) {
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

  // Resolve hostel from URL slug
  useEffect(() => {
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
  }, [params.slug]);

  // Fetch plans and set up auth once hostel is resolved
  useEffect(() => {
    if (!hostelReady) return;

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
  }, [hostelReady]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);

  // Clear selected plan if it becomes unavailable
  useEffect(() => {
    if (selectedPlanId && selectedPlan?.planType === "device") {
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
    if (!isFirebaseConfigured() || !db) {
      setLoading(false);
      return;
    }

    try {
      const plansQuery = query(
        collection(db, "dataPlans"),
        orderBy("price", "asc"),
      );
      // Always fetch from server — bypass local Firestore cache so deleted/deactivated
    // plans disappear immediately without requiring a hard refresh.
    const snapshot = await getDocsFromServer(plansQuery);
      const data = snapshot.docs.map((doc) => {
        const docData = doc.data();
        // Infer planType for legacy plans that don't have it
        let planType = docData.planType;
        if (!planType) {
          // Legacy plans: if it has usersCount, it's a device plan
          planType = docData.usersCount ? "device" : "tv";
        }
        return {
          id: doc.id,
          ...docData,
          planType,
          createdAt: docData.createdAt?.toDate(),
          updatedAt: docData.updatedAt?.toDate(),
        };
      }) as DataPlan[];
      // Only show plans that belong to this hostel (strict — no legacy fallback)
      const hostelPlans = data.filter(
        (plan) => plan.isActive && plan.hostelId === selectedHostel,
      );
      setPlans(hostelPlans);

      // Check availability only for this hostel's device plans
      const devicePlans = hostelPlans.filter(
        (plan) => plan.planType === "device",
      );
      if (devicePlans.length > 0) {
        checkPlanAvailability(devicePlans);
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkPlanAvailability = async (devicePlans: DataPlan[]) => {
    setCheckingAvailability(true);

    try {
      // On per-plan fetch failure return `null` so we DON'T pessimistically
      // mark the card as sold out — the reserve API is the source of truth
      // and will catch a real stockout. Treating "unknown" as "sold out" on
      // a flaky connection scared customers off perfectly buyable plans.
      const availabilityPromises = devicePlans.map(async (plan) => {
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
        `/register?email=${encodeURIComponent(email)}&verify=1&redirect=${encodeURIComponent(`/${params.slug}/plans`)}`,
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
        `/register?hostel=${encodeURIComponent(selectedHostel)}&email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(`/${params.slug}/plans`)}`,
      );
      return;
    }

    // Hostel / verification gate
    if (!checkHostelGate("device")) return;

    // Check availability for device plans
    if (selectedPlan.planType === "device") {
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
        if (selectedPlan.planType === "device") {
          fetchPlanAvailability(selectedPlan.id);
        }
        return;
      }

      const reservationId: string = reserveData.reservationId;
      setActiveReservationId(reservationId);

      // Refresh availability so the stock badge reflects the held code
      // immediately (count drops by 1 because the reserved code is filtered out).
      if (selectedPlan.planType === "device") {
        fetchPlanAvailability(selectedPlan.id);
      }

      // Proceed with payment now that the code is held.
      // Add ₦100 bank charges to the price
      const totalAmount = selectedPlan.price + 100;
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
      if (selectedPlan?.planType === "device") {
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
    if (selectedPlan?.planType === "device") {
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
        `/register?hostel=${encodeURIComponent(selectedHostel)}&email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(`/${params.slug}/plans`)}`,
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

  const handleTvEmailCheck = async () => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setError("");
    setPurchasing(true);

    try {
      const response = await apiFetch("/api/tv/check-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const result = await response.json();

      if (result.exists) {
        // Existing user - redirect to login page
        addToast({
          type: "warning",
          title: "Account Exists",
          message:
            "An account already exists with this email. Please login to purchase a new subscription.",
        });
        router.push("/login");
      } else {
        // New user - collect details
        setIsExistingUser(false);
        setTvPurchaseStep("details");
      }
    } catch (err: any) {
      console.error("Error checking account:", err);
      setError(err.message || "Failed to check account");
    } finally {
      setPurchasing(false);
    }
  };

  const handleTvDetailsSubmit = () => {
    if (!tvName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!tvMacAddress.trim()) {
      setError("Please enter your TV MAC address");
      return;
    }

    // Basic MAC address validation
    const macRegex =
      /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;
    if (!macRegex.test(tvMacAddress.trim())) {
      setError("Please enter a valid MAC address (e.g., 00:1A:2B:3C:4D:5E)");
      return;
    }

    setError("");
    handleTvPayment(false);
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
      const totalAmount = selectedPlan.price + 100; // Add ₦100 bank charges
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

  return (
    <>
      <Script
        src="https://js.paystack.co/v1/inline.js"
        strategy="lazyOnload"
        onLoad={() => setPaystackLoaded(true)}
        onError={() =>
          setError("Failed to load payment system. Please refresh the page.")
        }
      />
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-apple-gray-100 to-white pt-10 sm:pt-20 pb-10 sm:pb-16 overflow-hidden">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-10 right-1/4 w-96 h-96 bg-gradient-radial from-blue-100 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-gradient-radial from-purple-100 to-transparent rounded-full blur-3xl"></div>
        </div>

        <div className="relative mx-auto max-w-wide px-4 sm:px-6 lg:px-8">
          {/* Top Header Bar */}
          <div className="flex justify-end mb-6">
            {currentUser ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-apple-gray-600">
                  Welcome back, {currentUser.email?.split("@")[0]}
                </span>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold px-6 py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <Wifi className="w-4 h-4" />
                  Dashboard
                </button>
              </div>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm text-apple-gray-900 font-semibold px-6 py-3 rounded-xl hover:bg-white hover:shadow-lg transition-all duration-300 border border-apple-gray-200 shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 lg:gap-8">
            {/* Left side - Logo and Title */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="p-3 sm:p-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl sm:rounded-3xl shadow-2xl transform hover:scale-105 transition-transform duration-300 shrink-0">
                <Wifi
                  className="w-9 h-9 sm:w-14 sm:h-14 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <h1 className="text-3xl sm:text-5xl lg:text-7xl font-semibold mb-1 sm:mb-2">
                  <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                    Lodge Internet
                  </span>
                </h1>
                <p className="text-sm sm:text-lg text-apple-gray-600 font-medium">
                  {selectedHostel ? `${selectedHostel} • ` : ""}
                </p>
              </div>
            </div>

            {/* Right side - Tagline */}
            <div className="lg:text-right max-w-md">
              <p
                className="text-lg sm:text-2xl lg:text-3xl font-semibold text-apple-gray-900 mb-2 sm:mb-3"
                style={{ opacity: 0.8 }}
              >
                Fast and reliable
                <br />
                hostel internet.
              </p>
              <p className="text-sm sm:text-base lg:text-lg text-apple-gray-600">
                Get instant access to high-speed internet for your room
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Alternative to the on-site flow — buy this plan on the WhatsApp bot. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <WhatsAppBotCTA
          variant="banner"
          prefill={`Hi Lodge Internet${selectedHostel ? ` — ${selectedHostel}` : ""}`}
        />
      </div>

      {/* One-time reminder before the user is sent to Paystack. */}
      {showPaymentWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="payment-warning-title"
            className="w-full max-w-md rounded-3xl border-2 border-red-300 bg-white p-6 shadow-2xl payment-warning-shake"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl">
              ⚠️
            </div>
            <h2 id="payment-warning-title" className="text-xl font-bold text-red-700">
              Bad Things Will Happen If You Do Not Read This Modal
            </h2>
            <p className="mt-3 text-sm leading-6 text-red-700">
              After making payment, you must return to this site to get your access code.
              If you leave before your code appears, it may be difficult to recover it.
            </p>
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
              Keep this page open until your code is displayed.
            </div>
            <button
              type="button"
              onClick={acknowledgePaymentWarning}
              className="mt-6 w-full rounded-2xl bg-red-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Post-payment Code Modal — pops up the instant Paystack returns
          success (processingClaim), then morphs into the code reveal once
          /claim resolves (revealedCode). Always over everything so the
          buyer can't miss it regardless of scroll position. */}
      {(processingClaim || revealedCode) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative animate-in fade-in slide-in-from-bottom-4 duration-300 my-8">
            {/* Close button only after the code is shown — while processing
                the modal is mandatory so the user doesn't dismiss it early. */}
            {revealedCode && (
              <button
                onClick={() => setRevealedCode(null)}
                className="absolute top-4 right-4 text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl mb-4 shadow-lg">
                {revealedCode ? (
                  <KeyRound className="w-8 h-8 text-white" strokeWidth={2.5} />
                ) : (
                  <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <h2 className="text-2xl font-semibold text-apple-gray-900 mb-2">
                Payment Successful!
              </h2>
              <p className="text-sm text-apple-gray-600">
                {revealedCode
                  ? "Here's your access code — copy it to connect."
                  : recovering
                    ? "Payment confirmed — securing your code…"
                    : "Preparing your access code…"}
              </p>
            </div>

            {revealedCode ? (
              <>
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 border-2 border-green-300 rounded-2xl p-5 mb-5">
                  <p className="text-xs text-green-700 mb-3 font-semibold text-center uppercase tracking-wide">
                    Your Access Code
                  </p>
                  <div className="bg-white rounded-xl p-4 mb-4 shadow-inner">
                    <p className="text-2xl sm:text-3xl font-mono font-bold text-center text-green-900 tracking-widest break-all">
                      {revealedCode}
                    </p>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold py-3.5 rounded-xl hover:from-green-700 hover:to-green-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Code
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-sm text-blue-800 leading-relaxed">
                    <span className="font-semibold">Don&apos;t worry —</span>{" "}
                    this code is also saved to your{" "}
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="font-semibold underline hover:text-blue-900"
                    >
                      dashboard
                    </button>{" "}
                    and we&apos;ve emailed it to {email || "you"}.
                  </p>
                </div>

                <button
                  onClick={() => setRevealedCode(null)}
                  className="w-full bg-apple-gray-100 text-apple-gray-700 font-semibold py-3 rounded-xl hover:bg-apple-gray-200 transition-colors text-sm"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                {/* Skeleton + helper text while /claim is in flight */}
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 border-2 border-green-200 rounded-2xl p-5 mb-5">
                  <div className="h-3 w-32 mx-auto mb-3 bg-green-200/60 rounded animate-pulse" />
                  <div className="bg-white rounded-xl p-4 mb-4 shadow-inner">
                    <div className="h-8 sm:h-10 mx-auto bg-apple-gray-100 rounded animate-pulse" />
                  </div>
                  <div className="h-12 bg-green-200/60 rounded-xl animate-pulse" />
                </div>
                <p className="text-xs text-center text-apple-gray-500">
                  This usually takes less than a second. Please don&apos;t close this window.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Feedback/Review Section - Shows after payment */}
      {revealedCode && !feedbackSubmitted && (
        <section className="py-12 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl shadow-lg p-8 border border-blue-200">
              <h3 className="text-2xl font-semibold text-apple-gray-900 mb-4 text-center">
                📝 Share Your Feedback (Optional)
              </h3>
              <p className="text-apple-gray-600 mb-6 text-center">
                Help us improve our service by sharing your experience
              </p>

              <form onSubmit={handleFeedbackSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="feedbackName"
                    className="block text-sm font-medium text-apple-gray-700 mb-2"
                  >
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="feedbackName"
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none text-base transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="feedbackEmail"
                    className="block text-sm font-medium text-apple-gray-700 mb-2"
                  >
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="feedbackEmail"
                    value={email}
                    onChange={handleEmailChange}
                    placeholder="your.email@example.com"
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none text-base transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                    Plan Purchased
                  </label>
                  <input
                    type="text"
                    value={selectedPlan?.name || ""}
                    disabled
                    className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 bg-apple-gray-50 text-apple-gray-600 text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-apple-gray-700 mb-3">
                    Feedback Type
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFeedbackType("review")}
                      className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                        feedbackType === "review"
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                          : "bg-white border-2 border-apple-gray-300 text-apple-gray-700 hover:border-blue-400"
                      }`}
                    >
                      ⭐ Review
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedbackType("complaint")}
                      className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                        feedbackType === "complaint"
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                          : "bg-white border-2 border-apple-gray-300 text-apple-gray-700 hover:border-blue-400"
                      }`}
                    >
                      ⚠️ Complaint
                    </button>
                  </div>
                </div>

                {feedbackType === "review" && (
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-3">
                      Rating
                    </label>
                    <div className="flex gap-2 justify-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="text-4xl transition-transform hover:scale-110"
                        >
                          {star <= feedbackRating ? "⭐" : "☆"}
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-sm text-apple-gray-600 mt-2">
                      {feedbackRating} out of 5 stars
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="feedbackMessage"
                    className="block text-sm font-medium text-apple-gray-700 mb-2"
                  >
                    {feedbackType === "review"
                      ? "Your Review"
                      : "Your Complaint"}
                  </label>
                  <textarea
                    id="feedbackMessage"
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder={
                      feedbackType === "review"
                        ? "Share your experience..."
                        : "Describe your issue..."
                    }
                    required
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none text-base transition-colors resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Feedback Submitted Confirmation */}
      {feedbackSubmitted && (
        <section className="py-12 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-3xl shadow-lg p-8 border border-green-300 text-center">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-semibold text-green-900 mb-2">
                Thank You for Your Feedback!
              </h3>
              <p className="text-green-700">
                We appreciate you taking the time to share your thoughts with
                us.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Plans Selection */}
      <section className="py-10 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-apple-gray-900 mb-3 sm:mb-4">
              Choose Your Plan
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-apple-gray-600 max-w-2xl mx-auto mb-6 sm:mb-8">
              Select a data plan and get instant access to high-speed internet
            </p>

            {/* Device/TV Type Toggle */}
            <div className="inline-flex flex-wrap justify-center items-center gap-1.5 sm:gap-2 bg-apple-gray-100 rounded-2xl p-1.5 sm:p-2 shadow-inner max-w-full">
              {allow3Devices && (
                <button
                  onClick={() => {
                    setPlanView("device");
                    setSelectedDeviceCount(3);
                    setSelectedPlanId("");
                    setTvPurchaseStep(null);
                  }}
                  className={`px-3.5 py-2 sm:px-6 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 ${
                    planView === "device" && selectedDeviceCount === 3
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white shadow-lg"
                      : "text-apple-gray-700 hover:text-apple-gray-900"
                  }`}
                >
                  <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 inline-block mr-1 sm:mr-2" />
                  3 Devices
                </button>
              )}
              {allow5Devices && (
                <button
                  onClick={() => {
                    setPlanView("device");
                    setSelectedDeviceCount(5);
                    setSelectedPlanId("");
                    setTvPurchaseStep(null);
                  }}
                  className={`px-3.5 py-2 sm:px-6 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 ${
                    planView === "device" && selectedDeviceCount === 5
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white shadow-lg"
                      : "text-apple-gray-700 hover:text-apple-gray-900"
                  }`}
                >
                  <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 inline-block mr-1 sm:mr-2" />
                  5 Devices
                </button>
              )}
              {(!hostelPlanTypes?.length ||
                hostelPlanTypes.includes("unlimited")) && (
                <button
                  onClick={() => {
                    setPlanView("unlimited");
                    setSelectedPlanId("");
                    setTvPurchaseStep(null);
                  }}
                  className={`px-3.5 py-2 sm:px-6 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 ${
                    planView === "unlimited"
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white shadow-lg"
                      : "text-apple-gray-700 hover:text-apple-gray-900"
                  }`}
                >
                  <Wifi className="w-4 h-4 sm:w-5 sm:h-5 inline-block mr-1 sm:mr-2" />
                  Unlimited
                </button>
              )}
              {(!hostelPlanTypes?.length || hostelPlanTypes.includes("tv")) && (
                <button
                  onClick={() => {
                    setPlanView("tv");
                    setSelectedPlanId("");
                    setTvPurchaseStep(null);
                  }}
                  className={`px-3.5 py-2 sm:px-6 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 ${
                    planView === "tv"
                      ? "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white shadow-lg"
                      : "text-apple-gray-700 hover:text-apple-gray-900"
                  }`}
                >
                  <Tv className="w-4 h-4 sm:w-5 sm:h-5 inline-block mr-1 sm:mr-2" />
                  TV Unlimited
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-8 max-w-3xl mx-auto bg-red-50 border border-red-300 text-red-800 px-6 py-4 rounded-2xl flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {loading ||
          (planView === "device" && checkingAvailability) ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-6">
                <div className="animate-spin rounded-full h-10 w-10 border-b-3 border-blue-600"></div>
              </div>
              <p className="text-lg text-apple-gray-600">
                {loading ? "Loading plans..." : "Checking availability..."}
              </p>
            </div>
          ) : displayPlans.length === 0 ? (
            <div className="text-center py-20 bg-apple-gray-50 rounded-3xl max-w-2xl mx-auto">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-apple-gray-200 rounded-2xl mb-6">
                <Wifi className="w-8 h-8 text-apple-gray-600" />
              </div>
              <p className="text-lg text-apple-gray-600">
                No plans available for {selectedDeviceCount} devices at the
                moment.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto mb-8 sm:mb-12">
                {displayPlans.map((plan) => {
                  const availability = planAvailability[plan.id];
                  const isDevicePlan = plan.planType === "device";
                  // Optimistic: only treat the plan as unavailable when we
                  // explicitly know (server told us available === false).
                  // Missing/unknown availability → assume available; the
                  // reserve API is the real gate.
                  const knownUnavailable =
                    isDevicePlan &&
                    availability !== undefined &&
                    availability.available === false;
                  const isAvailable = !knownUnavailable;
                  const hasAvailabilityData =
                    isDevicePlan && availability !== undefined;
                  const codeCount = availability?.count ?? 0;

                  return (
                    <div
                      key={plan.id}
                      onClick={() => isAvailable && setSelectedPlanId(plan.id)}
                      className={`group relative bg-white rounded-3xl shadow-sm p-5 sm:p-8 transition-all duration-300 border-2 ${
                        !isAvailable
                          ? "border-apple-gray-200 bg-apple-gray-50 cursor-not-allowed opacity-60"
                          : selectedPlanId === plan.id
                            ? "border-blue-500 shadow-2xl scale-105 bg-gradient-to-br from-blue-50 to-purple-50 cursor-pointer"
                            : "border-apple-gray-200 hover:border-blue-300 hover:shadow-xl hover:scale-102 cursor-pointer"
                      }`}
                    >
                      {selectedPlanId === plan.id && (
                        <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                          <svg
                            className="w-6 h-6 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Stock badge — only show when we actually know the
                          count from the server. Never show "Sold out" while
                          availability is still loading or failed to load. */}
                      {hasAvailabilityData && (
                        codeCount === 0 ? (
                          <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                            Sold out
                          </div>
                        ) : codeCount === 1 ? (
                          <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            Last one left
                          </div>
                        ) : codeCount <= 5 ? (
                          <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Only {codeCount} left
                          </div>
                        ) : null
                      )}

                      <div className="text-center">
                        <div
                          className={`inline-flex items-center justify-center w-13 h-13 sm:w-16 sm:h-16 rounded-2xl mb-4 sm:mb-6 transition-all duration-300 ${
                            selectedPlanId === plan.id
                              ? "bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg"
                              : "bg-apple-gray-100 group-hover:bg-blue-100"
                          }`}
                        >
                          <Wifi
                            className={`w-7 h-7 sm:w-8 sm:h-8 ${selectedPlanId === plan.id ? "text-white" : "text-apple-gray-700 group-hover:text-blue-600"}`}
                            strokeWidth={2.5}
                          />
                        </div>

                        <h3 className="text-xl sm:text-2xl font-semibold text-apple-gray-900 mb-3 sm:mb-4">
                          {plan.name}
                        </h3>

                        <div className="mb-6">
                          <span
                            className={`text-4xl sm:text-5xl font-semibold ${
                              selectedPlanId === plan.id
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
                                : "text-apple-gray-900"
                            }`}
                          >
                            ₦{plan.price.toLocaleString()}
                          </span>
                        </div>

                        <div className="text-sm text-apple-gray-600 font-medium">
                          {plan.planType === "tv"
                            ? `${plan.duration} Days Subscription`
                            : plan.planType === "unlimited"
                              ? `${plan.duration ? plan.duration + " Day" : "Daily"} Unlimited${plan.usersCount ? ` • ${plan.usersCount} Device${plan.usersCount !== 1 ? "s" : ""}` : ""}`
                              : `Monthly Plan • ${plan.usersCount} Device${plan.usersCount !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedPlan && (
                <div className="max-w-3xl mx-auto bg-gradient-to-br from-apple-gray-50 to-white rounded-3xl shadow-lg p-5 sm:p-8 border border-apple-gray-200">
                  <div className="mb-6">
                    <p className="text-sm text-apple-gray-600 mb-2 font-medium uppercase tracking-wide">
                      Selected Plan
                    </p>
                    <p className="text-2xl font-semibold text-apple-gray-900 mb-1">
                      {selectedPlan.name}
                    </p>
                    <p className="text-lg text-apple-gray-600 flex items-center gap-2 mb-3">
                      {selectedPlan.planType === "tv" ? (
                        <>
                          <Tv className="w-5 h-5" />
                          {selectedPlan.duration} Days Subscription
                        </>
                      ) : selectedPlan.planType === "unlimited" ? (
                        <>
                          <Wifi className="w-5 h-5" />
                          {selectedPlan.duration
                            ? `${selectedPlan.duration} Day `
                            : ""}
                          Unlimited
                          {selectedPlan.usersCount
                            ? ` · ${selectedPlan.usersCount} Device${selectedPlan.usersCount !== 1 ? "s" : ""}`
                            : ""}
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-5 h-5" />
                          {selectedPlan.usersCount} Device
                          {selectedPlan.usersCount !== 1 ? "s" : ""}
                        </>
                      )}
                    </p>
                    <div className="text-sm text-apple-gray-600 space-y-1">
                      <p className="flex justify-between">
                        <span>Plan Price:</span>
                        <span className="font-semibold">
                          ₦{selectedPlan.price.toLocaleString()}
                        </span>
                      </p>
                      <p className="flex justify-between">
                        <span>Bank Charges:</span>
                        <span className="font-semibold">₦100</span>
                      </p>
                      <div className="border-t border-apple-gray-300 pt-1 mt-1">
                        <p className="flex justify-between text-base font-bold text-apple-gray-900">
                          <span>Total:</span>
                          <span>
                            ₦{(selectedPlan.price + 100).toLocaleString()}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedPlan.planType === "device" ||
                  selectedPlan.planType === "unlimited" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handlePurchase();
                      }}
                    >
                      {currentUser ? (
                        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                          <LogIn className="w-4 h-4 text-blue-600" />
                          <span className="text-blue-900 font-medium">
                            Purchasing as {email}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-6">
                          <label
                            htmlFor="email"
                            className="block text-sm text-apple-gray-700 mb-2 font-medium"
                          >
                            Email Address (for receipt)
                          </label>
                          <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={handleEmailChange}
                            placeholder="your.email@example.com"
                            required
                            className="w-full px-4 py-4 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none text-base transition-colors"
                          />
                        </div>
                      )}

                      {(() => {
                        const availability = planAvailability[selectedPlan.id];
                        const isAvailable = availability?.available !== false;
                        const isDevicePlan = selectedPlan.planType === "device";
                        const codesNotAvailable = isDevicePlan && !isAvailable;

                        return (
                          <>
                            {codesNotAvailable && (
                              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                                  <svg
                                    className="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  No codes available for this plan
                                </div>
                                <p className="text-red-500 text-xs mt-1">
                                  Please select a different plan or try again
                                  later.
                                </p>
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={
                                purchasing ||
                                !!revealedCode ||
                                !paystackLoaded ||
                                !email ||
                                codesNotAvailable
                              }
                              className={`w-full font-semibold px-10 py-5 rounded-2xl transition-all duration-300 disabled:cursor-not-allowed shadow-xl text-lg ${
                                codesNotAvailable
                                  ? "bg-gray-400 text-gray-600 opacity-50"
                                  : "bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white hover:opacity-90 hover:shadow-2xl transform hover:-translate-y-1 disabled:opacity-50"
                              }`}
                            >
                              {codesNotAvailable
                                ? "No Codes Available"
                                : !paystackLoaded
                                  ? "Loading payment..."
                                  : purchasing
                                    ? "Processing..."
                                    : `Pay ₦${(selectedPlan.price + 100).toLocaleString()}`}
                            </button>
                          </>
                        );
                      })()}
                    </form>
                  ) : (
                    <button
                      onClick={handleTvPurchaseStart}
                      disabled={purchasing || !paystackLoaded || checkingTvMac}
                      className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold px-10 py-5 rounded-2xl hover:opacity-90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl transform hover:-translate-y-1 text-lg"
                    >
                      {!paystackLoaded
                        ? "Loading payment..."
                        : checkingTvMac
                          ? "Checking your TV..."
                          : "Continue to Purchase"}
                    </button>
                  )}

                  {/* Dedicated WhatsApp Fast-Track Checkout option in the Payment box */}
                  <WhatsAppBotCTA
                    variant="payment-option"
                    prefill={`Hi Lodge Internet, I want to buy ${selectedPlan.name}${selectedHostel ? ` for ${selectedHostel}` : ""}`}
                    label={`Buy ${selectedPlan.name} on WhatsApp Bot`}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gradient-to-b from-apple-gray-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl sm:text-5xl font-semibold text-center text-apple-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-center text-lg text-apple-gray-600 mb-12 max-w-2xl mx-auto">
            Get started with Lodge Internet in three simple steps
          </p>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center group">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                <span className="text-4xl font-bold bg-gradient-to-br from-blue-600 to-blue-800 bg-clip-text text-transparent">
                  1
                </span>
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                Choose Plan
              </h3>
              <p className="text-base text-apple-gray-600 leading-relaxed">
                Select a data plan based on the number of devices you need
              </p>
            </div>

            <div className="text-center group">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-100 to-purple-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                <span className="text-4xl font-bold bg-gradient-to-br from-purple-600 to-purple-800 bg-clip-text text-transparent">
                  2
                </span>
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                Make Payment
              </h3>
              <p className="text-base text-apple-gray-600 leading-relaxed">
                Complete secure payment through our trusted Paystack gateway
              </p>
            </div>

            <div className="text-center group">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-100 to-green-200 rounded-3xl mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                <span className="text-4xl font-bold bg-gradient-to-br from-green-600 to-green-800 bg-clip-text text-transparent">
                  3
                </span>
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                Get Code
              </h3>
              <p className="text-base text-apple-gray-600 leading-relaxed">
                Receive your instant access code - save it immediately!
              </p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-16 bg-white rounded-3xl shadow-lg p-8 border border-apple-gray-200 max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-2xl flex-shrink-0">
                <KeyRound className="w-8 h-8 text-blue-600" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-apple-gray-900 mb-3">
                  Need Help?
                </h3>
                <p className="text-base text-apple-gray-600 leading-relaxed mb-4">
                  Our support team is here to assist you with any questions
                  about Lodge Internet plans or codes.
                </p>
                <button
                  onClick={() => setShowSupportModal(true)}
                  className="inline-flex items-center gap-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 active:scale-95 transition-all text-white font-semibold px-6 py-3 rounded-2xl shadow-md text-sm sm:text-base"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Contact Support
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Support Contacts Modal */}
      {showSupportModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowSupportModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-apple-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-apple-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-apple-gray-900">Support Team</h3>
                  <p className="text-xs text-apple-gray-500">Choose who to chat with</p>
                </div>
              </div>
              <button
                onClick={() => setShowSupportModal(false)}
                className="p-2 rounded-full text-apple-gray-400 hover:text-apple-gray-700 hover:bg-apple-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contact list */}
            <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
              {([
                { name: "Davo", phone: "2348130437519" },
                { name: "Stephen", phone: "2347048817060" },
                ...supportContacts.map((c) => ({ name: c.username, phone: c.whatsappPhone })),
              ] as { name: string; phone: string }[]).map((agent) => (
                <a
                  key={agent.phone}
                  href={`https://wa.me/${agent.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowSupportModal(false)}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-apple-gray-100 hover:border-green-300 hover:bg-green-50 active:scale-95 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-green-100 flex-shrink-0 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-apple-gray-900 text-sm truncate">Chat with {agent.name}</p>
                    <p className="text-xs text-apple-gray-500">WhatsApp</p>
                  </div>
                  <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-green-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ))}
            </div>
            <div className="pb-6 sm:pb-4" />
          </div>
        </div>
      )}

      {/* TV Purchase Modals */}
      {tvPurchaseStep === "email" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-fade-in">
            <button
              onClick={() => setTvPurchaseStep(null)}
              className="absolute top-4 right-4 text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-2xl mb-4">
                <Tv className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-apple-gray-900 mb-2">
                TV Unlimited Purchase
              </h3>
              <p className="text-apple-gray-600">
                Enter your email to get started
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="your.email@example.com"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                onClick={handleTvEmailCheck}
                disabled={purchasing}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {purchasing ? "Checking..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tvPurchaseStep === "mac" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in slide-in-from-bottom-4 duration-200">
            <button
              onClick={() => {
                setTvPurchaseStep(null);
                setError("");
              }}
              className="absolute top-4 right-4 text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-2xl mb-4">
                <Tv className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-apple-gray-900 mb-2">
                Your TV MAC Address
              </h3>
              <p className="text-apple-gray-600 text-sm">
                One quick detail — we use this to provision your TV on the network.
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTvMacSubmit();
              }}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="tv-mac-pre-purchase"
                  className="block text-sm font-semibold text-apple-gray-900 mb-2"
                >
                  TV MAC Address
                </label>
                <input
                  id="tv-mac-pre-purchase"
                  type="text"
                  value={tvMacAddress}
                  onChange={(e) => setTvMacAddress(e.target.value)}
                  required
                  autoFocus
                  placeholder="00:1A:2B:3C:4D:5E"
                  className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
                />
                <p className="text-xs text-apple-gray-500 mt-2">
                  Find this in your TV's network settings. Accepts colons, hyphens, or no separator.
                </p>
              </div>

              <button
                type="submit"
                disabled={purchasing}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {purchasing ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </span>
                ) : (
                  "Continue to Payment"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {tvPurchaseStep === "details" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-fade-in">
            <button
              onClick={() => setTvPurchaseStep(null)}
              className="absolute top-4 right-4 text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-2xl mb-4">
                <Tv className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-apple-gray-900 mb-2">
                Your Details
              </h3>
              <p className="text-apple-gray-600">
                We need a few details to set up your account
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={tvName}
                  onChange={(e) => setTvName(e.target.value)}
                  placeholder="John Doe"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  TV MAC Address
                </label>
                <input
                  type="text"
                  value={tvMacAddress}
                  onChange={(e) => setTvMacAddress(e.target.value)}
                  placeholder="00:1A:2B:3C:4D:5E"
                  className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none transition-colors font-mono"
                />
                <p className="mt-1 text-xs text-apple-gray-500">
                  Find this in your TV's network settings
                </p>
              </div>

              <button
                onClick={handleTvDetailsSubmit}
                disabled={purchasing}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {purchasing ? "Processing..." : "Proceed to Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tvPurchaseStep === "password" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-fade-in">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl mb-4">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-apple-gray-900 mb-2">
                Payment Successful!
              </h3>
              <p className="text-apple-gray-600">
                Create a password to access your dashboard
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={tvPassword}
                  onChange={(e) => setTvPassword(e.target.value)}
                  placeholder="Enter password (min. 6 characters)"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={tvConfirmPassword}
                  onChange={(e) => setTvConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                onClick={handleCreateAccount}
                disabled={purchasing}
                className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {purchasing
                  ? "Creating Account..."
                  : "Create Account & Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hostel Confirmation Modal */}
      {showHostelConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center">
                <Wifi className="w-7 h-7 text-white" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-apple-gray-900 text-center mb-2">
              Confirm Your Hostel
            </h3>
            <p className="text-sm text-apple-gray-600 text-center mb-5">
              We need to link your account to a hostel before you can purchase.
              Please confirm which hostel you&apos;re at.
            </p>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-apple-gray-700 mb-2">
                Your Hostel
              </label>
              <select
                value={confirmedHostel}
                onChange={(e) => setConfirmedHostel(e.target.value)}
                className="w-full px-4 py-3 border border-apple-gray-200 rounded-2xl text-apple-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent text-sm"
              >
                <option value="">Select your hostel…</option>
                {allHostels.map((h) => (
                  <option key={h.id} value={h.name}>
                    {h.name}
                  </option>
                ))}
              </select>
              {suggestedHostel && (
                <p className="text-xs text-apple-gray-400 mt-1.5">
                  Suggested based on your purchase history
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowHostelConfirm(false);
                  setPendingPurchaseType(null);
                }}
                className="flex-1 py-3 rounded-2xl border border-apple-gray-200 text-apple-gray-700 font-semibold hover:bg-apple-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleHostelConfirmed}
                disabled={!confirmedHostel}
                className="flex-1 py-3 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
              >
                Confirm &amp; Buy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-Auth Modal (session expired) */}
      {showReAuth && (
        <ReAuthModal
          onSuccess={(freshToken) => {
            setShowReAuth(false);
            if (pendingAction) {
              pendingAction(freshToken);
              setPendingAction(null);
            }
          }}
          onCancel={() => {
            setShowReAuth(false);
            setPendingAction(null);
            setPurchasing(false);
          }}
        />
      )}

      {/* Floating WhatsApp Action Button */}
      <WhatsAppBotCTA
        variant="floating-fab"
        prefill={`Hi Lodge Internet${selectedHostel ? ` — ${selectedHostel}` : ""}`}
      />
    </>
  );
}
