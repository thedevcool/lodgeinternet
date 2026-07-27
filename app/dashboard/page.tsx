"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import {
  Wifi,
  LogOut,
  ShoppingBag,
  Clock,
  Copy,
  CheckCircle,
  Building2,
  KeyRound,
  Tv,
  ArrowRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Pencil,
  Mail,
  RefreshCw,
} from "lucide-react";
import { toHostelSlug } from "@/lib/hostelSlug";
import UpdateMacModal from "@/components/UpdateMacModal";
import WhatsAppBotCTA from "@/components/WhatsAppBotCTA";
import ReAuthModal from "@/components/ReAuthModal";
import { useToast } from "@/components/Toast";

interface Purchase {
  id: string;
  planName: string;
  planType: string;
  price: number;
  paymentRef: string;
  hostel: string;
  purchasedAt: string | null;
  subscriptionStatus?: string;
  /** True when a code is on file (server-side) for this purchase. Device/unlimited only. */
  hasCode?: boolean;
  /** "delivered" | "no_stock" | "pending" — present on dataPurchases rows */
  deliveryStatus?: string;
  emailSent?: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  hostelId: string;
  hostelSlug: string;
  collageSlug?: string;
  emailVerified: boolean;
}

interface TVSubscription {
  id: string;
  planName: string;
  duration: number;
  price: number;
  hostel?: string;
  subscriptionStatus: "pending_activation" | "active" | "expired";
  expiresAt: string | null;
  activatedAt: string | null;
  paidAt: string | null;
  createdAt: string | null;
  hasMacAddress: boolean;
  migrationNote?: string;
}

interface StoredCode {
  code: string; // decrypted plaintext (after reading)
  planName: string;
  savedAt: number; // timestamp
}

interface RawStoredCode {
  code: string; // encrypted
  planName: string;
  savedAt: number;
}

const CODE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function getSavedCodes(uid: string): Promise<StoredCode[]> {
  const { decryptFromStorage } = await import("@/lib/localStorageCrypto");
  try {
    const raw = localStorage.getItem("lodgeCodes");
    if (!raw) return [];
    const codes: RawStoredCode[] = JSON.parse(raw);
    const now = Date.now();
    const valid = codes.filter((c) => now - c.savedAt < CODE_TTL_MS);
    if (valid.length !== codes.length) {
      localStorage.setItem("lodgeCodes", JSON.stringify(valid));
    }
    // Decrypt all codes
    const decrypted = await Promise.all(
      valid.map(async (c) => {
        const plaintext = await decryptFromStorage(c.code, uid);
        return plaintext ? { ...c, code: plaintext } : null;
      }),
    );
    return decrypted.filter((c): c is StoredCode => c !== null);
  } catch {
    return [];
  }
}

function getTimeLeft(savedAt: number): string {
  const remaining = CODE_TTL_MS - (Date.now() - savedAt);
  if (remaining <= 0) return "Expired";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [tvSubscriptions, setTvSubscriptions] = useState<TVSubscription[]>([]);
  const [savedCodes, setSavedCodes] = useState<StoredCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedRef, setCopiedRef] = useState("");
  const [revealedCodes, setRevealedCodes] = useState<Set<number>>(new Set());
  const [, forceUpdate] = useState({});
  const [macModalSub, setMacModalSub] = useState<TVSubscription | null>(null);
  const [reAuthRetry, setReAuthRetry] = useState<
    ((freshToken: string) => Promise<void>) | null
  >(null);
  // Codes revealed from the server, keyed by purchase.id
  const [revealedPurchaseCodes, setRevealedPurchaseCodes] = useState<
    Record<string, string>
  >({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const idToken = await currentUser.getIdToken().catch(() => "");
        await fetchUserData(currentUser.uid, idToken);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Refresh saved codes every minute (needs user UID for decryption)
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    getSavedCodes(uid).then(setSavedCodes);
    const interval = setInterval(() => {
      getSavedCodes(uid).then(setSavedCodes);
      forceUpdate({});
    }, 60000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  const fetchUserData = async (userId: string, idToken: string = "") => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/auth/user?userId=${userId}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      if (!res.ok) {
        if (res.status === 404) {
          // User has Firebase Auth but no profile — redirect to register
          router.push("/register?verify=1");
          return;
        }
        throw new Error("Failed to fetch profile");
      }

      const data = await res.json();
      setProfile(data.profile);
      setPurchases(data.purchases || []);

      if (!data.profile.emailVerified) {
        router.push(
          `/register?email=${encodeURIComponent(data.profile.email)}&verify=1`,
        );
        return;
      }

      // Fetch TV subscriptions for this user (scoped server-side to caller)
      await fetchTvSubscriptions(idToken);
    } catch (err) {
      console.error("Error fetching user data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTvSubscriptions = async (idToken: string) => {
    try {
      const res = await apiFetch("/api/tv/subscriptions", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setTvSubscriptions(data.subscriptions || []);
    } catch (err) {
      console.error("Error fetching TV subscriptions:", err);
    }
  };

  const refreshTvSubscriptions = async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await fetchTvSubscriptions(idToken);
    } catch {
      // ignore
    }
  };

  const getFreshIdToken = async (): Promise<string> => {
    if (!user) return "";
    try {
      return await user.getIdToken();
    } catch {
      return "";
    }
  };

  const revealPurchaseCode = async (purchase: Purchase) => {
    if (revealedPurchaseCodes[purchase.id]) {
      // Toggle hide
      setRevealedPurchaseCodes((prev) => {
        const next = { ...prev };
        delete next[purchase.id];
        return next;
      });
      return;
    }

    setRevealingId(purchase.id);
    try {
      const idToken = await getFreshIdToken();
      const res = await apiFetch("/api/data-codes/reveal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ purchaseId: purchase.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retrieve code");
      setRevealedPurchaseCodes((prev) => ({ ...prev, [purchase.id]: data.code }));
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Couldn't show code",
        message: err.message || "Please try again or contact support.",
      });
    } finally {
      setRevealingId(null);
    }
  };

  const resendPurchaseEmail = async (purchase: Purchase) => {
    setResendingId(purchase.id);
    try {
      const idToken = await getFreshIdToken();
      const res = await apiFetch("/api/data-codes/resend-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ purchaseId: purchase.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend");
      addToast({
        type: "success",
        title: "Email sent",
        message: `We've re-sent the code to ${profile?.email || user?.email}.`,
      });
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Couldn't resend email",
        message: err.message || "Please try again later.",
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      const auth = getAuthInstance();
      await signOut(auth);
      router.push("/");
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRef(id);
    setTimeout(() => setCopiedRef(""), 2000);
  };

  const toggleCodeReveal = (index: number) => {
    setRevealedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const planTypeIcon = (type: string) => {
    switch (type) {
      case "tv":
        return <Tv className="w-4 h-4" />;
      case "unlimited":
        return <Wifi className="w-4 h-4" />;
      default:
        return <KeyRound className="w-4 h-4" />;
    }
  };

  const planTypeBadge = (type: string) => {
    switch (type) {
      case "tv":
        return "bg-purple-100 text-purple-700";
      case "unlimited":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-green-100 text-green-700";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-apple-gray-100 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-6">
            <div className="animate-spin rounded-full h-10 w-10 border-b-3 border-blue-600"></div>
          </div>
          <p className="text-lg text-apple-gray-600">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-apple-gray-100 to-white">
      {/* Header */}
      <header className="bg-white border-b border-apple-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-xl">
                <Wifi className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                  Lodge Internet
                </h1>
                <p className="text-sm text-apple-gray-600">
                  {profile?.email || user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Promote the WhatsApp bot (hidden until a number is configured) */}
        <WhatsAppBotCTA variant="banner" prefill="Hi Lodge Internet" />

        {/* Hostel + Quick Buy Card */}
        <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-apple-gray-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-apple-gray-500 font-medium">
                  Your Hostel
                </p>
                <h2 className="text-xl font-semibold text-apple-gray-900">
                  {profile?.hostelId}
                </h2>
              </div>
            </div>
            <button
              onClick={() =>
                router.push(`/${profile?.collageSlug ? `${profile.collageSlug}/` : ""}${profile?.hostelSlug || toHostelSlug(profile?.hostelId || "")}/plans`)
              }
              className="flex items-center gap-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <ShoppingBag className="w-4 h-4" />
              Buy More Plans
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TV Subscriptions Card */}
        {tvSubscriptions.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-apple-gray-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Tv className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900">
                TV Subscriptions
              </h3>
            </div>

            <div className="space-y-3">
              {tvSubscriptions.map((sub) => {
                const statusBadge =
                  sub.subscriptionStatus === "active"
                    ? "bg-green-100 text-green-700"
                    : sub.subscriptionStatus === "pending_activation"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-red-100 text-red-700";
                const statusLabel =
                  sub.subscriptionStatus === "active"
                    ? "Active"
                    : sub.subscriptionStatus === "pending_activation"
                      ? "Pending Activation"
                      : "Expired";
                const expires = sub.expiresAt
                  ? new Date(sub.expiresAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null;
                const needsMac = !sub.hasMacAddress;

                return (
                  <div
                    key={sub.id}
                    className="p-4 bg-apple-gray-50 rounded-2xl border border-apple-gray-100"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-apple-gray-900 truncate">
                          {sub.planName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge}`}
                          >
                            {statusLabel}
                          </span>
                          {expires && sub.subscriptionStatus === "active" && (
                            <span className="text-xs text-apple-gray-500">
                              Expires {expires}
                            </span>
                          )}
                          {sub.hostel && sub.hostel !== "N/A" && (
                            <span className="text-xs text-apple-gray-500">
                              · {sub.hostel}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-apple-gray-900">
                          ₦{sub.price.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {needsMac ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-amber-800 mb-1">
                            MAC address needed
                          </p>
                          <p className="text-xs text-amber-700 leading-relaxed mb-3">
                            We don't have a TV MAC on file for this subscription. Add it so we can activate your TV on the network.
                          </p>
                          <button
                            onClick={() => setMacModalSub(sub)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-colors"
                          >
                            <Tv className="w-4 h-4" />
                            Add MAC Address
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setMacModalSub(sub)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Update MAC address
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Codes Card */}
        {savedCodes.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-apple-gray-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-green-100 rounded-lg">
                <KeyRound className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-apple-gray-900">
                Your Active Codes
              </h3>
            </div>

            <div className="space-y-3">
              {savedCodes.map((sc, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-apple-gray-900 mb-1">
                      {sc.planName}
                    </p>
                    <div className="flex items-center gap-2">
                      {revealedCodes.has(i) ? (
                        <span className="font-mono text-lg font-bold text-green-700 tracking-wider">
                          {sc.code}
                        </span>
                      ) : (
                        <span className="font-mono text-lg font-bold text-apple-gray-400 tracking-wider">
                          ••••••••
                        </span>
                      )}
                      <button
                        onClick={() => toggleCodeReveal(i)}
                        className="p-1 text-apple-gray-500 hover:text-apple-gray-700"
                      >
                        {revealedCodes.has(i) ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span className="text-xs text-amber-700 font-medium">
                        Expires in {getTimeLeft(sc.savedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(sc.code, `code-${i}`)}
                    className="ml-3 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors flex items-center gap-1.5"
                  >
                    {copiedRef === `code-${i}` ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-apple-gray-500 mt-3 text-center">
              Codes are stored locally on this device and auto-expire after 6
              hours
            </p>
          </div>
        )}

        {/* Recent Purchases */}
        <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-apple-gray-200">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-purple-100 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-apple-gray-900">
              Recent Purchases
            </h3>
          </div>

          {purchases.length === 0 ? (
            <div className="text-center py-10">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-apple-gray-100 rounded-full mb-4">
                <ShoppingBag className="w-7 h-7 text-apple-gray-400" />
              </div>
              <p className="text-apple-gray-500 mb-4">No purchases yet</p>
              <button
                onClick={() =>
                  router.push(
                    `/${profile?.collageSlug ? `${profile.collageSlug}/` : ""}${profile?.hostelSlug || toHostelSlug(profile?.hostelId || "")}/plans`,
                  )
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm"
              >
                Browse Plans
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map((purchase) => {
                const isCodePlan =
                  purchase.planType === "device" ||
                  purchase.planType === "unlimited";
                const revealedCode = revealedPurchaseCodes[purchase.id];
                const awaitingFulfilment =
                  isCodePlan && purchase.deliveryStatus === "no_stock";

                return (
                  <div
                    key={purchase.id}
                    className="p-4 bg-apple-gray-50 rounded-2xl border border-apple-gray-100 hover:border-apple-gray-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`p-2 rounded-lg ${planTypeBadge(purchase.planType)}`}
                        >
                          {planTypeIcon(purchase.planType)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-apple-gray-900 truncate">
                            {purchase.planName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-apple-gray-500">
                              {purchase.purchasedAt
                                ? new Date(purchase.purchasedAt).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )
                                : "—"}
                            </span>
                            {purchase.subscriptionStatus && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  purchase.subscriptionStatus === "active"
                                    ? "bg-green-100 text-green-700"
                                    : purchase.subscriptionStatus ===
                                        "pending_activation"
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {purchase.subscriptionStatus === "active"
                                  ? "Active"
                                  : purchase.subscriptionStatus ===
                                      "pending_activation"
                                    ? "Pending"
                                    : "Expired"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-bold text-apple-gray-900">
                          ₦{purchase.price.toLocaleString()}
                        </p>
                        <button
                          onClick={() =>
                            copyToClipboard(purchase.paymentRef, purchase.id)
                          }
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mt-0.5"
                        >
                          {copiedRef === purchase.id ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Ref
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Awaiting fulfilment (NO_CODES at claim time) */}
                    {awaitingFulfilment && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800 leading-relaxed">
                          <p className="font-semibold mb-0.5">Awaiting fulfilment</p>
                          <p>
                            Your payment was received but no codes were available at that moment. Our team has been notified and will contact you shortly.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Code reveal + resend (delivered device/unlimited rows) */}
                    {isCodePlan && purchase.hasCode && (
                      <div className="mt-3 bg-white border border-apple-gray-200 rounded-xl px-4 py-3">
                        {revealedCode ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-apple-gray-500 mb-1">
                                Your access code
                              </p>
                              <span className="font-mono text-base font-bold text-green-700 tracking-wider break-all">
                                {revealedCode}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    revealedCode,
                                    `revealed-${purchase.id}`,
                                  )
                                }
                                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5"
                              >
                                {copiedRef === `revealed-${purchase.id}` ? (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => revealPurchaseCode(purchase)}
                                className="text-xs text-apple-gray-500 hover:text-apple-gray-700 font-medium"
                              >
                                Hide
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => revealPurchaseCode(purchase)}
                              disabled={revealingId === purchase.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {revealingId === purchase.id ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              Show code
                            </button>
                            <button
                              onClick={() => resendPurchaseEmail(purchase)}
                              disabled={resendingId === purchase.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-apple-gray-100 text-apple-gray-700 text-xs font-semibold rounded-lg hover:bg-apple-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {resendingId === purchase.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Mail className="w-3.5 h-3.5" />
                              )}
                              Resend email
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {macModalSub && (
        <UpdateMacModal
          subscriptionId={macModalSub.id}
          planName={macModalSub.planName}
          getIdToken={getFreshIdToken}
          onSessionExpired={(retry) => {
            setMacModalSub(null);
            setReAuthRetry(() => retry);
          }}
          onSuccess={() => {
            const planName = macModalSub.planName;
            setMacModalSub(null);
            addToast({
              type: "success",
              title: "MAC Updated",
              message: `Your TV MAC for ${planName} was saved. The admin has been notified.`,
            });
            refreshTvSubscriptions();
          }}
          onCancel={() => setMacModalSub(null)}
        />
      )}

      {reAuthRetry && (
        <ReAuthModal
          onSuccess={async (freshToken) => {
            const retry = reAuthRetry;
            setReAuthRetry(null);
            await retry(freshToken);
            refreshTvSubscriptions();
          }}
          onCancel={() => setReAuthRetry(null)}
        />
      )}

      {/* Floating WhatsApp Action Button */}
      <WhatsAppBotCTA
        variant="floating-fab"
        prefill={`Hi Lodge Internet — Dashboard user ${profile?.hostelId ? `(${profile.hostelId})` : ""}`}
      />
    </div>
  );
}
