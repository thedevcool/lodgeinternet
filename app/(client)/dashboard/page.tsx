"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import { Check, Clock, Copy, Eye, EyeOff, KeyRound, LogOut, Mail, Pencil, RefreshCw, ShoppingBag, Tv, Wifi } from "lucide-react";
import { toHostelSlug } from "@/lib/hostelSlug";
import UpdateMacModal from "@/components/UpdateMacModal";
import ReAuthModal from "@/components/ReAuthModal";
import { useToast } from "@/components/Toast";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Monogram from "@/components/ui/Monogram";
import Badge from "@/components/ui/Badge";
import Button, { ButtonLink } from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import WhatsAppCard from "@/components/ui/WhatsAppCard";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { EmptyState, ListSkeleton, Skeleton } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";

/**
 * /dashboard — the customer's Account (iOS Settings style).
 * All data logic below is unchanged; only the presentation was redesigned.
 */

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
  subscriptionStatus:
    | "pending_activation"
    | "active"
    | "expired"
    | "extension"
    | "blocked";
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

  // ── Presentation ──────────────────────────────────────────────────────────
  // Everything above this line is the dashboard's original logic, unchanged.

  const planTypeIcon = (type: string) => {
    switch (type) {
      case "tv":
        return <Tv className="h-5 w-5" />;
      case "unlimited":
        return <Wifi className="h-5 w-5" />;
      default:
        return <KeyRound className="h-5 w-5" />;
    }
  };

  // Literal class strings (Tailwind only keeps classes it can see).
  const planTypeTile = (type: string) => {
    switch (type) {
      case "tv":
        return "bg-accent/10 text-accent-ink";
      case "unlimited":
        return "bg-sky-500/15 text-sky-500";
      default:
        return "bg-success/10 text-success";
    }
  };

  // Same URL the old "Buy More Plans" button pushed.
  const buyPlansHref = `/${profile?.collageSlug ? `${profile.collageSlug}/` : ""}${profile?.hostelSlug || toHostelSlug(profile?.hostelId || "")}/plans`;
  const accountEmail = profile?.email || user?.email;

  if (loading) {
    return (
      <Container>
        <div className="pb-6 pt-2 md:pb-8 md:pt-10">
          <Skeleton className="h-9 w-40" />
        </div>
        <ListSkeleton rows={1} />
        <div className="mt-8">
          <ListSkeleton rows={3} />
        </div>
        <p className="ui-footnote mt-4 text-center text-ink-2">Loading your dashboard...</p>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader title="Account" />

      {/* ── Profile ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-[22px] font-semibold text-white">
          {(accountEmail?.[0] || "?").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="ui-headline truncate text-ink">{profile?.displayName || accountEmail}</p>
          {profile?.displayName && <p className="ui-subhead truncate text-ink-2">{accountEmail}</p>}
        </div>
      </div>

      {/* ── Hostel ──────────────────────────────────────────────────────── */}
      <GroupedList header="Your hostel" className="mt-8">
        <ListRow
          href={buyPlansHref}
          leading={<Monogram name={profile?.hostelId || "Hostel"} />}
          title={profile?.hostelId || "—"}
          subtitle="Buy more plans"
        />
      </GroupedList>

      {/* ── Active codes (saved on this device) ─────────────────────────── */}
      {savedCodes.length > 0 && (
        <GroupedList
          header="Your active codes"
          footer="Codes are stored locally on this device and auto-expire after 6 hours"
          className="mt-8"
        >
          {savedCodes.map((sc, i) => (
            <div key={i} className="relative flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="ui-subhead truncate text-ink-2">{sc.planName}</p>
                <div className="mt-0.5 flex items-center gap-1">
                  <span
                    className={cx(
                      "break-all font-mono text-[19px] font-bold tracking-[0.1em]",
                      revealedCodes.has(i) ? "text-ink" : "text-ink-3",
                    )}
                  >
                    {revealedCodes.has(i) ? sc.code : "••••••••"}
                  </span>
                  <button
                    onClick={() => toggleCodeReveal(i)}
                    aria-label={revealedCodes.has(i) ? "Hide code" : "Show code"}
                    className="rounded-full p-1.5 text-ink-3 transition hover:text-ink-2"
                  >
                    {revealedCodes.has(i) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="ui-footnote mt-0.5 flex items-center gap-1 font-medium text-warning">
                  <Clock className="h-3 w-3" /> Expires in {getTimeLeft(sc.savedAt)}
                </p>
              </div>
              <Button variant="tinted" size="sm" onClick={() => copyToClipboard(sc.code, `code-${i}`)}>
                {copiedRef === `code-${i}` ? (
                  <>
                    <Check className="h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copy
                  </>
                )}
              </Button>
            </div>
          ))}
        </GroupedList>
      )}

      {/* ── TV subscriptions ────────────────────────────────────────────── */}
      {tvSubscriptions.length > 0 && (
        <GroupedList header="TV subscriptions" className="mt-8">
          {tvSubscriptions.map((sub) => {
            // `extension` is a top-up row: the subscription it extended
            // is the one that runs, so it reads as active here.
            const STATUS: Record<string, { tone: "success" | "warning" | "danger"; label: string }> = {
              active: { tone: "success", label: "Active" },
              extension: { tone: "success", label: "Extended" },
              pending_activation: { tone: "warning", label: "Pending Activation" },
              blocked: { tone: "danger", label: "Needs Attention" },
              expired: { tone: "danger", label: "Expired" },
            };
            const { tone: statusTone, label: statusLabel } = STATUS[sub.subscriptionStatus] ?? STATUS.expired;
            const running = sub.subscriptionStatus === "active" || sub.subscriptionStatus === "extension";
            const expires = sub.expiresAt
              ? new Date(sub.expiresAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;
            // Days left matters more than the date: "3 days" prompts a
            // renewal in a way "Expires Sep 30" does not.
            const daysLeft = sub.expiresAt
              ? Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / 86_400_000)
              : null;
            const expiringSoon = running && daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
            const needsMac = !sub.hasMacAddress;

            return (
              <div key={sub.id} className="relative px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="ui-headline truncate text-ink">{sub.planName}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={statusTone} dot>
                        {statusLabel}
                      </Badge>
                      {expires && running && (
                        <span className={cx("ui-footnote", expiringSoon ? "font-semibold text-warning" : "text-ink-2")}>
                          {daysLeft !== null && daysLeft >= 0
                            ? daysLeft === 0
                              ? "Expires today"
                              : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · ${expires}`
                            : `Expires ${expires}`}
                        </span>
                      )}
                      {sub.hostel && sub.hostel !== "N/A" && <span className="ui-footnote text-ink-2">· {sub.hostel}</span>}
                    </div>
                    {sub.subscriptionStatus === "blocked" && (
                      <p className="ui-footnote mt-1.5 text-danger">
                        We could not activate this device — support has been notified.
                      </p>
                    )}
                  </div>
                  <p className="ui-subhead shrink-0 font-semibold tabular-nums text-ink">₦{sub.price.toLocaleString()}</p>
                </div>

                {needsMac ? (
                  <InlineAlert tone="warning" title="MAC address needed" className="mt-3">
                    We don&apos;t have a TV MAC on file for this subscription. Add it so we can activate your TV on the
                    network.
                    <Button size="sm" className="mt-3" onClick={() => setMacModalSub(sub)}>
                      <Tv className="h-4 w-4" /> Add MAC Address
                    </Button>
                  </InlineAlert>
                ) : (
                  <button
                    onClick={() => setMacModalSub(sub)}
                    className="ui-subhead mt-3 inline-flex items-center gap-1.5 font-medium text-accent-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Update MAC address
                  </button>
                )}
              </div>
            );
          })}
        </GroupedList>
      )}

      {/* ── Recent purchases ────────────────────────────────────────────── */}
      <GroupedList header="Recent purchases" className="mt-8">
        {purchases.length === 0 ? (
          <div className="relative">
            <EmptyState
              icon={<ShoppingBag />}
              title="No purchases yet"
              action={
                <ButtonLink href={buyPlansHref} size="md">
                  Browse Plans
                </ButtonLink>
              }
            />
          </div>
        ) : (
          purchases.map((purchase) => {
            const isCodePlan = purchase.planType === "device" || purchase.planType === "unlimited";
            const revealedCode = revealedPurchaseCodes[purchase.id];
            const awaitingFulfilment = isCodePlan && purchase.deliveryStatus === "no_stock";

            return (
              <div key={purchase.id} className="relative px-4 py-3.5" style={{ ["--inset" as string]: "70px" }}>
                <div className="flex items-center gap-3.5">
                  <span
                    className={cx(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]",
                      planTypeTile(purchase.planType),
                    )}
                  >
                    {planTypeIcon(purchase.planType)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-medium text-ink">{purchase.planName}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="ui-footnote text-ink-2">
                        {purchase.purchasedAt
                          ? new Date(purchase.purchasedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                      {purchase.subscriptionStatus && (
                        <Badge
                          tone={
                            purchase.subscriptionStatus === "active"
                              ? "success"
                              : purchase.subscriptionStatus === "pending_activation"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {purchase.subscriptionStatus === "active"
                            ? "Active"
                            : purchase.subscriptionStatus === "pending_activation"
                              ? "Pending"
                              : "Expired"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="ui-subhead font-semibold tabular-nums text-ink">₦{purchase.price.toLocaleString()}</p>
                    <button
                      onClick={() => copyToClipboard(purchase.paymentRef, purchase.id)}
                      className="ui-footnote mt-0.5 inline-flex items-center gap-1 font-medium text-accent-ink"
                    >
                      {copiedRef === purchase.id ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Ref
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Awaiting fulfilment (NO_CODES at claim time) */}
                {awaitingFulfilment && (
                  <InlineAlert tone="warning" title="Awaiting fulfilment" className="mt-3 md:ml-[54px]">
                    Your payment was received but no codes were available at that moment. Our team has been notified
                    and will contact you shortly.
                  </InlineAlert>
                )}

                {/* Code reveal + resend (delivered device/unlimited rows) */}
                {isCodePlan && purchase.hasCode && (
                  <div className="mt-3 md:ml-[54px]">
                    {revealedCode ? (
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3">
                        <div className="min-w-0">
                          <p className="ui-footnote text-ink-2">Your access code</p>
                          <span className="break-all font-mono text-[17px] font-bold tracking-[0.1em] text-ink">
                            {revealedCode}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Button
                            variant="tinted"
                            size="sm"
                            onClick={() => copyToClipboard(revealedCode, `revealed-${purchase.id}`)}
                          >
                            {copiedRef === `revealed-${purchase.id}` ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" /> Copy
                              </>
                            )}
                          </Button>
                          <button
                            onClick={() => revealPurchaseCode(purchase)}
                            className="ui-footnote px-2 font-medium text-ink-2 hover:text-ink"
                          >
                            Hide
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="tinted"
                          size="sm"
                          onClick={() => revealPurchaseCode(purchase)}
                          loading={revealingId === purchase.id}
                        >
                          {revealingId !== purchase.id && <Eye className="h-4 w-4" />}
                          Show code
                        </Button>
                        <Button
                          variant="gray"
                          size="sm"
                          onClick={() => resendPurchaseEmail(purchase)}
                          disabled={resendingId === purchase.id}
                        >
                          {resendingId === purchase.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                          Resend email
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </GroupedList>

      {/* ── Help + sign out ─────────────────────────────────────────────── */}
      <WhatsAppCard
        className="mt-8"
        title="Need a hand?"
        message="Chat with Lodge Internet on WhatsApp — buy plans or get help with a code."
        prefill={`Hi Lodge Internet — Dashboard user ${profile?.hostelId ? `(${profile.hostelId})` : ""}`}
      />

      <GroupedList className="mt-8">
        <ListRow
          onClick={handleLogout}
          chevron={false}
          leading={
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-danger/10 text-danger">
              <LogOut className="h-5 w-5" />
            </span>
          }
          title={<span className="text-danger">Sign Out</span>}
        />
      </GroupedList>

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
    </Container>
  );
}
