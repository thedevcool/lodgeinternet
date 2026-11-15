/**
 * Guards components/plans/usePlansCheckout.ts: everything that happens
 * between a customer tapping Pay and their Wi-Fi code showing on screen.
 *
 * This is the money path, so the tests follow the rules written at the top
 * of the hook, in the order a payment goes:
 *
 *   hold a code  →  open Paystack  →  claim the held code  →  show it
 *
 *  - A code is held (POST /api/data-codes/reserve) BEFORE Paystack is set
 *    up, and Paystack is told which code and the backend's total (P2).
 *  - Closing Paystack without paying gives the held code back. That is the
 *    only place a card payment's code is given back.
 *  - When Paystack reports success, the "processing" sheet shows at once and
 *    the claim names the SAME held code. Until 2026-11-15 the claim sent no
 *    reservation id (it read state from a stale render), so the held code
 *    stayed parked while the backend sold another from the pool. The tests
 *    under "after Paystack says the payment went through" fail if that
 *    comes back.
 *  - A claim that fails or hangs falls back to asking /claim-status until
 *    the code is ready, the order is known to be unfulfilled, or the wait
 *    runs out. The customer's money is never asked for twice.
 *
 * How the tests are built: the backend is `fakeBackend()` (the real
 * lib/apiClient.ts runs on top of it), Paystack's popup is a stand-in that
 * records what it was set up with, and the clock is fake, so the 15-second
 * claim timeout and the 70-second recovery wait run instantly and exactly.
 * Saving the code on the device is replaced by a recorder here: the real one
 * does slow key derivation and has its own tests (checkout.test.ts).
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, fakeBackend, hangUntilAborted, json, type FakeBackend } from "../../../helpers/backend";

// ── Stand-ins for the hook's neighbours ─────────────────────────────────────

const { router, addToast, auth, saveCode } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  addToast: vi.fn(),
  // Who lib/customerAuth says is signed in; each test sets it before the page opens.
  auth: { customer: null as { uid: string; email: string } | null },
  saveCode: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/components/client/CustomerProvider", () => ({ profileChanged: vi.fn() }));
vi.mock("@/lib/customerAuth", () => ({
  // Like the real one: answers a moment after subscribing, never during it.
  onCustomerChange: (callback: (customer: { uid: string; email: string } | null) => void) => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) callback(auth.customer);
    });
    return () => {
      active = false;
    };
  },
  signUp: vi.fn(),
}));
vi.mock("@/components/plans/checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/plans/checkout")>()),
  saveCodeToLocalStorage: saveCode,
}));

import { usePlansCheckout, type PlansParams } from "@/components/plans/usePlansCheckout";

// ── The world the tests run in ──────────────────────────────────────────────

const CHIAMAKA = { uid: "user-chiamaka-01", email: "chiamaka@example.com" };
const HOSTEL = "Ayoni Block A";
const WARNING_KEY = `lodge-payment-return-warning:${CHIAMAKA.uid}`;

// The backend's total is deliberately NOT what the website's fallback
// formula gives for ₦3,000 (that is ₦3,304): any test that sees 3,350 knows
// the figure came from the backend and not from arithmetic in the browser.
const WEEKLY = {
  id: "plan-weekly-3",
  name: "Weekly",
  planType: "device",
  usersCount: 3,
  duration: 7,
  price: 3000,
  total: 3350,
  isActive: true,
};

const VERIFIED_AT_AYONI = { hostelId: HOSTEL, emailVerified: true };

const WALLET_WITH = (balanceKobo: number) => ({
  available: true,
  balanceKobo,
  dva: { account_number: "9912345678", bank_name: "Wema Bank", account_name: "LODGE/CHIAMAKA OBI" },
  dvaFailed: false,
  hasPhone: true,
  activity: [],
});

type PaystackPopup = {
  /** What the website handed PaystackPop.setup(). */
  config: any;
  /** The requests the backend had received when Paystack was set up. */
  requestsBefore: string[];
  openIframe: ReturnType<typeof vi.fn>;
};

let backend: FakeBackend;
let paystackPopups: PaystackPopup[];
/** The profile the backend returns for the signed-in customer. */
let profile: { hostelId: string; emailVerified: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 15, 10, 0, 0));
  vi.stubEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "pk_test_lodge_unit_tests");

  auth.customer = CHIAMAKA;
  profile = VERIFIED_AT_AYONI;

  // A backend where everything works: one hostel, one plan in stock.
  backend = fakeBackend();
  backend.on("GET /api/hostels", () => json({ hostels: [{ id: "hostel-ayoni", name: HOSTEL }] }));
  backend.on("GET /api/support-contacts", () => json({ contacts: [] }));
  backend.on("GET /api/data-plans", () => json({ plans: [WEEKLY] }));
  backend.on("POST /api/data-codes/check-availability", () => json({ available: true, count: 4 }));
  backend.on("GET /api/auth/user", () => json({ profile, purchases: [] }));
  let held = 40;
  backend.on("POST /api/data-codes/reserve", () => json({ reservationId: `held-code-${++held}` }));
  backend.on("POST /api/data-codes/release", () => json({ success: true }));
  backend.on("GET /api/checkout/reserve-split", () => json({ subaccountCode: null, transactionChargeKobo: 0 }));

  // Paystack's popup: records how it was set up; the test plays the customer.
  paystackPopups = [];
  vi.stubGlobal("PaystackPop", {
    setup: (config: any) => {
      const openIframe = vi.fn();
      paystackPopups.push({ config, openIframe, requestsBefore: backend.requests.map((request) => request.key) });
      return { openIframe };
    },
  });

  return () => {
    vi.useRealTimers();
  };
});

/** Lets everything already in motion finish (answers arrive, the page redraws). The clock does not move. */
async function settle() {
  for (let round = 0; round < 4; round++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

/** Moves the clock forward, letting whatever comes due happen on the way. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await settle();
}

/** Opens the plans page for Ayoni Block A and waits for it to load. */
async function openPlansPage(params: PlansParams = { slug: "ayoni-block-a" }) {
  const page = renderHook(() => usePlansCheckout(params));
  await settle();
  return page.result;
}

type Page = Awaited<ReturnType<typeof openPlansPage>>;

async function choosePlan(page: Page, planId = WEEKLY.id) {
  act(() => page.current.setSelectedPlanId(planId));
  await settle();
}

/** Taps Pay, the way the checkout form does: with no arguments. */
async function tapPay(page: Page) {
  await act(async () => {
    await page.current.handlePurchase();
  });
  await settle();
}

/** The customer has already seen and accepted the "keep this page open" warning. */
function warningAlreadyAcknowledged() {
  localStorage.setItem(WARNING_KEY, "acknowledged");
}

/** A signed-in customer on the plans page, plan chosen, Paystack open and waiting. */
async function openPaystack() {
  warningAlreadyAcknowledged();
  const page = await openPlansPage();
  await choosePlan(page);
  await tapPay(page);
  expect(paystackPopups).toHaveLength(1);
  return { page, popup: paystackPopups[0] };
}

/** Paystack tells the website the card payment went through. */
function paystackSucceeds(popup: PaystackPopup, reference = "AYONI-BLOCK-A-DEVICE-20261115-K3M7PQ") {
  act(() => {
    popup.config.callback({ reference });
  });
  return reference;
}

const sentReserve = () => backend.sent("POST /api/data-codes/reserve");
const sentRelease = () => backend.sent("POST /api/data-codes/release");
const sentClaim = () => backend.sent("POST /api/data-codes/claim");
const sentStatus = () => backend.sent("POST /api/data-codes/claim-status");

// ── Opening the page ────────────────────────────────────────────────────────

describe("opening a hostel's plans page", () => {
  it("loads that hostel's plans and their stock from the backend", async () => {
    const page = await openPlansPage();

    expect(page.current.loading).toBe(false);
    expect(page.current.selectedHostel).toBe(HOSTEL);
    expect(page.current.displayPlans.map((plan) => plan.name)).toEqual(["Weekly"]);
    expect(backend.sent("GET /api/data-plans")[0].query).toBe("hostel=Ayoni%20Block%20A&kind=all");
    expect(page.current.planStock(page.current.displayPlans[0])).toEqual({
      isAvailable: true,
      hasAvailabilityData: true,
      codeCount: 4,
    });
    expect(backend.unanswered).toEqual([]);
  });

  // A failed plans request used to leave an empty list, which the page
  // showed as "No plans available": a hostel that sells looked like one
  // that doesn't.
  it.each([
    { name: "the backend answers with an error", answer: () => json({ error: "Something went wrong." }, 500) },
    { name: "the connection drops", answer: () => Promise.reject(new TypeError("Failed to fetch")) },
  ])("says the plans couldn't be loaded when $name, and loads them on Try again", async ({ answer }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.on("GET /api/data-plans", answer);
    const page = await openPlansPage();

    expect(page.current.loading).toBe(false);
    expect(page.current.plansLoadFailed).toBe(true);
    expect(page.current.displayPlans).toEqual([]);

    // The backend is back: Try again loads the plans, and the failure is gone.
    backend.on("GET /api/data-plans", () => json({ plans: [WEEKLY] }));
    await act(async () => {
      await page.current.retryPlans();
    });
    await settle();

    expect(page.current.plansLoadFailed).toBe(false);
    expect(page.current.displayPlans.map((plan) => plan.name)).toEqual(["Weekly"]);
  });

  // The tabs are on screen before the hostel has loaded. A tap on one used
  // to be undone when the hostel arrived and the default tab was picked.
  it("keeps the tab a customer tapped while the hostel was still loading", async () => {
    const hostels = deferred<Response>();
    backend.on("GET /api/hostels", () => hostels.promise);
    const page = await openPlansPage();
    expect(page.current.hostelReady).toBe(false);

    act(() => page.current.selectTab("device", 5));
    await act(async () => {
      hostels.resolve(json({ hostels: [{ id: "hostel-ayoni", name: HOSTEL }] }));
    });
    await settle();

    expect(page.current.hostelReady).toBe(true);
    expect(page.current.planView).toBe("device");
    expect(page.current.selectedDeviceCount).toBe(5);
  });

  it("opens on a tab the hostel offers when the one tapped early isn't sold there", async () => {
    const hostels = deferred<Response>();
    backend.on("GET /api/hostels", () => hostels.promise);
    const page = await openPlansPage();

    act(() => page.current.selectTab("tv"));
    await act(async () => {
      hostels.resolve(json({ hostels: [{ id: "hostel-ayoni", name: HOSTEL, planTypes: ["device"], deviceUserCounts: [3] }] }));
    });
    await settle();

    expect(page.current.planView).toBe("device");
    expect(page.current.selectedDeviceCount).toBe(3);
  });

  it("does not call a hostel with no plans a failure", async () => {
    backend.on("GET /api/data-plans", () => json({ plans: [] }));
    const page = await openPlansPage();

    expect(page.current.plansLoadFailed).toBe(false);
    expect(page.current.displayPlans).toEqual([]);
  });

  it("works out the amount to pay from the backend's total, not from the plan's price", async () => {
    const page = await openPlansPage();
    await choosePlan(page);

    // ₦3,350 as the backend quoted it, in kobo.
    expect(page.current.planTotalKobo).toBe(335_000);
  });

  it("finds the hostel inside its location for a two-part address", async () => {
    backend.on("GET /api/hostel-collages", () => json({ collages: [{ id: "collage-iworoko", slug: "iworoko" }] }));
    backend.on("GET /api/hostels", () =>
      json({
        hostels: [
          // Same name, different location: must not be picked.
          { id: "hostel-other", name: HOSTEL, collageId: "collage-osekita" },
          { id: "hostel-ayoni", name: HOSTEL, collageId: "collage-iworoko" },
        ],
      }),
    );

    const page = await openPlansPage({ slug: "iworoko", hostelSlug: "ayoni-block-a" });

    expect(page.current.hostelObj?.id).toBe("hostel-ayoni");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends an address that matches no hostel back to the home page", async () => {
    const page = await openPlansPage({ slug: "no-such-hostel" });

    expect(router.replace).toHaveBeenCalledWith("/");
    expect(page.current.hostelReady).toBe(false);
    expect(backend.sent("GET /api/data-plans")).toHaveLength(0);
  });

  it("hides a plan the backend has switched off", async () => {
    backend.on("GET /api/data-plans", () =>
      json({ plans: [WEEKLY, { ...WEEKLY, id: "plan-daily-3", name: "Daily", isActive: false }] }),
    );

    const page = await openPlansPage();

    expect(page.current.displayPlans.map((plan) => plan.name)).toEqual(["Weekly"]);
  });

  it("keeps Pay waiting until the wallet has been checked, so nobody is rushed into the wrong method", async () => {
    const page = await openPlansPage();
    await choosePlan(page);
    expect(page.current.payDisabled).toBe(true);

    backend.on("GET /api/wallet", () => json({ available: false }));
    await act(async () => {
      await page.current.loadWallet();
    });

    expect(page.current.payDisabled).toBe(false);
    expect(page.current.payMethod).toBe("card");
  });
});

// ── Card: up to the moment Paystack opens ───────────────────────────────────

describe("paying by card: before Paystack opens", () => {
  it("holds a code first, then sets Paystack up with that code and the backend's total", async () => {
    const { page, popup } = await openPaystack();

    // A code was held, for this plan at this hostel...
    expect(sentReserve()).toHaveLength(1);
    expect(sentReserve()[0].body).toEqual({ planId: WEEKLY.id, hostel: HOSTEL });
    // ...before Paystack was set up...
    expect(popup.requestsBefore).toContain("POST /api/data-codes/reserve");
    // ...and Paystack was told which code is held and what to charge.
    expect(popup.config.metadata.reservationId).toBe("held-code-41");
    expect(popup.config.amount).toBe(3350 * 100);
    expect(popup.config.currency).toBe("NGN");
    expect(popup.config.email).toBe(CHIAMAKA.email);
    expect(popup.config.key).toBe("pk_test_lodge_unit_tests");
    expect(popup.openIframe).toHaveBeenCalledTimes(1);
    expect(page.current.purchasing).toBe(true);
    expect(backend.unanswered).toEqual([]);
  });

  it("tells Paystack what was bought, so the backend's webhook can finish the order by itself", async () => {
    const { popup } = await openPaystack();

    expect(popup.config.metadata).toEqual({
      planId: WEEKLY.id,
      planName: "Weekly",
      planType: "device",
      usersCount: 3,
      hostel: HOSTEL,
      reservationId: "held-code-41",
    });
    expect(popup.config.ref).toMatch(/^AYONI-BLOCK-A-DEVICE-20261115-[A-Z0-9]{6}$/);
  });

  it("charges whole kobo, and no split, when the backend names no reserve account", async () => {
    const { popup } = await openPaystack();

    expect(Number.isInteger(popup.config.amount)).toBe(true);
    expect(popup.config).not.toHaveProperty("subaccount");
    expect(popup.config).not.toHaveProperty("transaction_charge");
  });

  it("has Paystack split off the platform's reserve when the backend names the account and the amount", async () => {
    backend.on("GET /api/checkout/reserve-split", () => json({ subaccountCode: "ACCT_reserve01", transactionChargeKobo: 7_500 }));

    const { popup } = await openPaystack();

    // The backend is asked with the plan's price; it owns the 2.5% formula.
    expect(backend.sent("GET /api/checkout/reserve-split")[0].query).toBe("priceNaira=3000");
    expect(popup.config.subaccount).toBe("ACCT_reserve01");
    // Paystack's `transaction_charge` is what the MAIN account keeps: the
    // total less the reserve.
    expect(popup.config.transaction_charge).toBe(335_000 - 7_500);
    expect(popup.config.bearer).toBe("account");
    expect(popup.config.amount).toBe(335_000);
  });

  it("still takes the payment, unsplit, when the reserve split can't be fetched", async () => {
    backend.on("GET /api/checkout/reserve-split", () => Promise.reject(new TypeError("fetch failed")));

    const { popup } = await openPaystack();

    expect(popup.config.amount).toBe(335_000);
    expect(popup.config).not.toHaveProperty("subaccount");
  });

  it("shows the backend's reason when no code could be held, and never opens Paystack", async () => {
    warningAlreadyAcknowledged();
    backend.on("POST /api/data-codes/reserve", () =>
      json({ error: "Weekly has just sold out at Ayoni Block A.", code: "OUT_OF_STOCK" }, 409),
    );
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(page.current.error).toBe("Weekly has just sold out at Ayoni Block A.");
    expect(paystackPopups).toHaveLength(0);
    expect(page.current.purchasing).toBe(false);
    // No money call of any kind followed.
    expect(backend.sent("GET /api/checkout/reserve-split")).toHaveLength(0);
    expect(sentClaim()).toHaveLength(0);
    // And the stock shown is refreshed, straight from the source.
    expect(backend.sent("POST /api/data-codes/check-availability").some((request) => request.body.fresh === true)).toBe(true);
  });

  it("explains in its own words when the backend refuses a hold without a reason", async () => {
    warningAlreadyAcknowledged();
    backend.on("POST /api/data-codes/reserve", () => json({}, 500));
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(page.current.error).toBe(
      "Sorry, there are no available codes for Weekly at the moment. Please try another plan or check back later.",
    );
    expect(paystackPopups).toHaveLength(0);
  });

  it("does not open Paystack when the connection drops while holding a code", async () => {
    warningAlreadyAcknowledged();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.on("POST /api/data-codes/reserve", () => Promise.reject(new TypeError("Failed to fetch")));
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(paystackPopups).toHaveLength(0);
    expect(page.current.purchasing).toBe(false);
    expect(page.current.error).not.toBe("");
  });

  // The browser's own error text ("Failed to fetch", "Load failed") used to
  // be shown to the customer as the message.
  it("explains a dropped connection in plain words, not the browser's error text", async () => {
    warningAlreadyAcknowledged();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.on("POST /api/data-codes/reserve", () => Promise.reject(new TypeError("Failed to fetch")));
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(page.current.error).toBe("Failed to start payment. Please try again.");
  });

  it("asks for a plan when none is chosen", async () => {
    const page = await openPlansPage();

    await tapPay(page);

    expect(page.current.error).toBe("Please select a plan");
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });

  it("holds nothing while Paystack has not finished loading", async () => {
    warningAlreadyAcknowledged();
    vi.stubGlobal("PaystackPop", undefined);
    const page = await openPlansPage();
    await choosePlan(page);
    expect(page.current.paystackLoaded).toBe(false);

    await tapPay(page);

    expect(page.current.error).toBe("Payment system is still loading. Please try again in a moment.");
    expect(sentReserve()).toHaveLength(0);
  });

  it("notices Paystack once its script has loaded, without a page reload", async () => {
    const paystack = (globalThis as any).PaystackPop;
    vi.stubGlobal("PaystackPop", undefined);
    const page = await openPlansPage();
    expect(page.current.paystackLoaded).toBe(false);

    vi.stubGlobal("PaystackPop", paystack);
    await wait(300);

    expect(page.current.paystackLoaded).toBe(true);
  });

  it("holds nothing when the website has no Paystack key", async () => {
    warningAlreadyAcknowledged();
    vi.stubEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "");
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "Configuration Error" }));
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });
});

// ── Who may buy ─────────────────────────────────────────────────────────────

describe("who may buy", () => {
  it("sends a customer who is not signed in to register, and holds nothing", async () => {
    auth.customer = null;
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/register?hostel=Ayoni%20Block%20A&email=&redirect=%2Fayoni-block-a%2Fplans");
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "warning", title: "Sign In Required" }));
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
    expect(page.current.purchasing).toBe(false);
  });

  it("brings them back to the same plans page afterwards, with the email they had typed", async () => {
    auth.customer = null;
    localStorage.setItem("userEmail", "tunde@example.com");
    backend.on("GET /api/hostel-collages", () => json({ collages: [{ id: "collage-iworoko", slug: "iworoko" }] }));
    backend.on("GET /api/hostels", () => json({ hostels: [{ id: "hostel-ayoni", name: HOSTEL, collageId: "collage-iworoko" }] }));
    const page = await openPlansPage({ slug: "iworoko", hostelSlug: "ayoni-block-a" });
    await choosePlan(page);

    await tapPay(page);

    expect(router.push).toHaveBeenCalledWith(
      "/register?hostel=Ayoni%20Block%20A&email=tunde%40example.com&redirect=%2Fiworoko%2Fayoni-block-a%2Fplans",
    );
    expect(sentReserve()).toHaveLength(0);
  });

  it("sends a customer whose email is not verified to verify it, and holds nothing", async () => {
    warningAlreadyAcknowledged();
    profile = { hostelId: HOSTEL, emailVerified: false };
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(router.push).toHaveBeenCalledWith(
      "/register?email=chiamaka%40example.com&verify=1&redirect=%2Fayoni-block-a%2Fplans",
    );
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });

  it("refuses a customer registered at another hostel, and holds nothing", async () => {
    warningAlreadyAcknowledged();
    profile = { hostelId: "Block C", emailVerified: true };
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Wrong Hostel",
        message: "Your account is registered for Block C. You can't purchase plans from a different hostel.",
      }),
    );
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });

  it("asks a customer with no hostel yet to confirm this one, then carries on to pay", async () => {
    warningAlreadyAcknowledged();
    profile = { hostelId: "", emailVerified: true };
    backend.on("PATCH /api/auth/profile", () => json({ success: true }));
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);
    expect(page.current.showHostelConfirm).toBe(true);
    expect(page.current.confirmedHostel).toBe(HOSTEL);
    expect(sentReserve()).toHaveLength(0);

    await act(async () => {
      await page.current.handleHostelConfirmed();
    });
    await settle();

    expect(backend.sent("PATCH /api/auth/profile")[0].body).toEqual({ userId: CHIAMAKA.uid, hostelId: HOSTEL });
    expect(page.current.showHostelConfirm).toBe(false);
    expect(sentReserve()).toHaveLength(1);
    expect(paystackPopups).toHaveLength(1);
  });

  it("deselects a plan that is sold out, so it can't be paid for by any method", async () => {
    warningAlreadyAcknowledged();
    backend.on("POST /api/data-codes/check-availability", () => json({ available: false, count: 0 }));
    const page = await openPlansPage();

    await choosePlan(page);
    expect(page.current.selectedPlan).toBeUndefined();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "warning", title: "Plan No Longer Available" }));

    await tapPay(page);
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });

  // The plan card and the Pay button treat "stock unknown" as buyable (the
  // hold is the real gate, as checkPlanAvailability says), but handlePurchase
  // used to refuse with "No codes are currently available" without ever
  // asking the backend.
  it("lets the backend decide when the stock check itself failed", async () => {
    warningAlreadyAcknowledged();
    backend.on("POST /api/data-codes/check-availability", () => json({ error: "Something went wrong." }, 500));
    const page = await openPlansPage();
    await choosePlan(page);
    // The page shows the plan as buyable...
    expect(page.current.planStock(page.current.selectedPlan!).isAvailable).toBe(true);
    expect(page.current.codesNotAvailable).toBe(false);

    await tapPay(page);

    // ...so Pay must reach the backend.
    expect(sentReserve()).toHaveLength(1);
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Plan Not Available" }));
  });
});

// ── The one-time warning ────────────────────────────────────────────────────

describe("the one-time 'keep this page open' warning", () => {
  it("is shown the first time a customer pays by card, before anything is held", async () => {
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(page.current.showPaymentWarning).toBe(true);
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
    expect(page.current.purchasing).toBe(false);
  });

  it("goes on to hold a code and open Paystack once the customer taps I Understand", async () => {
    const page = await openPlansPage();
    await choosePlan(page);
    await tapPay(page);

    act(() => page.current.acknowledgePaymentWarning());
    await settle();

    expect(page.current.showPaymentWarning).toBe(false);
    expect(localStorage.getItem(WARNING_KEY)).toBe("acknowledged");
    expect(sentReserve()).toHaveLength(1);
    expect(paystackPopups).toHaveLength(1);
  });

  it("is not shown again to a customer who has acknowledged it", async () => {
    const page = await openPlansPage();
    await choosePlan(page);
    await tapPay(page);
    act(() => page.current.acknowledgePaymentWarning());
    await settle();
    // They close Paystack and try again.
    act(() => paystackPopups[0].config.onClose());
    await settle();

    await tapPay(page);

    expect(page.current.showPaymentWarning).toBe(false);
    expect(paystackPopups).toHaveLength(2);
  });

  it("is remembered for each customer separately", async () => {
    localStorage.setItem("lodge-payment-return-warning:user-tunde-02", "acknowledged");
    const page = await openPlansPage();
    await choosePlan(page);

    await tapPay(page);

    expect(page.current.showPaymentWarning).toBe(true);
    expect(paystackPopups).toHaveLength(0);
  });

  it("does nothing if I Understand is somehow tapped with no payment waiting", async () => {
    const page = await openPlansPage();
    await choosePlan(page);

    act(() => page.current.acknowledgePaymentWarning());
    await settle();

    expect(localStorage.getItem(WARNING_KEY)).toBeNull();
    expect(sentReserve()).toHaveLength(0);
  });

  // Why rule 1 at the top of the hook exists: the first argument used to be
  // trusted as "warning acknowledged", and a click event is truthy, so
  // `onClick={handlePurchase}` would have skipped the warning. Only the
  // boolean `true` counts now. The checkout form guards against it from its
  // side too (CheckoutPanel.test.tsx).
  it("is not skipped when Pay is wired straight to a click and handed the event", async () => {
    const page = await openPlansPage();
    await choosePlan(page);
    const clickEvent = new MouseEvent("click", { bubbles: true });

    await act(async () => {
      await (page.current.handlePurchase as (event: unknown) => Promise<void>)(clickEvent);
    });
    await settle();

    expect(page.current.showPaymentWarning).toBe(true);
    expect(sentReserve()).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });
});

// ── Closing Paystack ────────────────────────────────────────────────────────

describe("closing Paystack without paying", () => {
  it("gives the held code back and frees the Pay button", async () => {
    const { page, popup } = await openPaystack();

    act(() => popup.config.onClose());
    await settle();

    expect(sentRelease()).toHaveLength(1);
    expect(sentRelease()[0].body).toEqual({ reservationId: "held-code-41" });
    expect(page.current.purchasing).toBe(false);
    expect(sentClaim()).toHaveLength(0);
    expect(page.current.revealedCode).toBeNull();
  });

  it("holds a fresh code when the customer tries again", async () => {
    const { page, popup } = await openPaystack();
    act(() => popup.config.onClose());
    await settle();

    await tapPay(page);

    expect(sentReserve()).toHaveLength(2);
    expect(paystackPopups).toHaveLength(2);
    expect(paystackPopups[1].config.metadata.reservationId).toBe("held-code-42");
  });

  it("does not trouble the customer if giving the code back fails (the hold runs out by itself)", async () => {
    backend.on("POST /api/data-codes/release", () => Promise.reject(new TypeError("fetch failed")));
    const { page, popup } = await openPaystack();

    act(() => popup.config.onClose());
    await settle();

    expect(page.current.purchasing).toBe(false);
    expect(page.current.error).toBe("");
  });

  it("never gives back a code that was paid for: Paystack closing after success releases nothing", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ code: "LODGE-7H2K-99QX" }));
    const { popup } = await openPaystack();

    paystackSucceeds(popup);
    // Paystack closes its window right after reporting success.
    act(() => popup.config.onClose());
    await wait(700);

    expect(sentRelease()).toHaveLength(0);
  });
});

// ── Payment succeeded ───────────────────────────────────────────────────────

describe("after Paystack says the payment went through", () => {
  it("shows the processing sheet at once, before the backend has answered", async () => {
    const claim = deferred<Response>();
    backend.on("POST /api/data-codes/claim", () => claim.promise);
    const { page, popup } = await openPaystack();

    // No waiting here: this is the state in the very same tick as Paystack's callback.
    paystackSucceeds(popup);

    expect(page.current.processingClaim).toBe(true);
    expect(page.current.showCodeSheet).toBe(true);
    expect(page.current.revealedCode).toBeNull();
  });

  it("claims the very code that was held for this payment", async () => {
    const claim = deferred<Response>();
    backend.on("POST /api/data-codes/claim", () => claim.promise);
    const { popup } = await openPaystack();

    const reference = paystackSucceeds(popup);

    expect(sentClaim()).toHaveLength(1);
    expect(sentClaim()[0].body).toEqual({
      planId: WEEKLY.id,
      email: CHIAMAKA.email,
      paymentRef: reference,
      hostel: HOSTEL,
      // The same id the hold returned and Paystack's metadata carried.
      reservationId: "held-code-41",
    });
    expect(sentClaim()[0].body.reservationId).toBe(popup.config.metadata.reservationId);
  });

  it("claims as the signed-in customer, never as an admin", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ code: "LODGE-7H2K-99QX" }));
    const { popup } = await openPaystack();

    paystackSucceeds(popup);

    expect(sentClaim()[0].credentials).toBe("include");
    expect(sentClaim()[0].headers.get("X-Lodge-Client")).toBe("site");
  });

  it("shows the code the backend hands over, and saves it on this device for this customer", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ code: "LODGE-7H2K-99QX" }));
    const { page, popup } = await openPaystack();

    paystackSucceeds(popup);
    await settle();
    // A short beat so "processing" hands over cleanly.
    expect(page.current.revealedCode).toBeNull();
    await wait(700);

    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
    expect(page.current.showCodeSheet).toBe(true);
    expect(page.current.processingClaim).toBe(false);
    expect(page.current.purchasing).toBe(false);
    expect(page.current.error).toBe("");
    expect(saveCode).toHaveBeenCalledTimes(1);
    expect(saveCode).toHaveBeenCalledWith("LODGE-7H2K-99QX", "Weekly", CHIAMAKA.uid);
    expect(backend.unanswered).toEqual([]);
  });

  it("one payment makes one claim and shows one code, however long the page stays open", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ code: "LODGE-7H2K-99QX" }));
    const { page, popup } = await openPaystack();

    paystackSucceeds(popup);
    await wait(700);
    await wait(5 * 60_000);

    expect(sentClaim()).toHaveLength(1);
    expect(sentStatus()).toHaveLength(0);
    expect(sentReserve()).toHaveLength(1);
    expect(saveCode).toHaveBeenCalledTimes(1);
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
    // And Pay stays off while the code is on screen.
    expect(page.current.payDisabled).toBe(true);
  });

  it("names the same payment and the same held code if Paystack reports the success twice", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ code: "LODGE-7H2K-99QX" }));
    const { page, popup } = await openPaystack();

    const reference = paystackSucceeds(popup);
    paystackSucceeds(popup, reference);
    await wait(700);

    // The backend sees one payment for one held code both times, so it can
    // only ever hand out the one code (P4).
    expect(sentClaim().map((request) => request.body.paymentRef)).toEqual([reference, reference]);
    expect(sentClaim().map((request) => request.body.reservationId)).toEqual(["held-code-41", "held-code-41"]);
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
  });

  it("asks for the password again when the backend wants a recent sign-in, then claims the same held code", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ error: "Please confirm your password.", code: "SESSION_EXPIRED" }, 401));
    const { page, popup } = await openPaystack();

    const reference = paystackSucceeds(popup);
    await settle();

    expect(page.current.showReAuth).toBe(true);
    expect(sentStatus()).toHaveLength(0);
    expect(page.current.revealedCode).toBeNull();

    // Password confirmed: the claim is retried as it was.
    backend.on("POST /api/data-codes/claim", () => json({ code: "LODGE-7H2K-99QX" }));
    act(() => page.current.completeReAuth());
    await wait(700);

    expect(page.current.showReAuth).toBe(false);
    expect(sentClaim()).toHaveLength(2);
    expect(sentClaim()[1].body).toMatchObject({ paymentRef: reference, reservationId: "held-code-41" });
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
    expect(sentRelease()).toHaveLength(0);
  });
});

// ── Recovery ────────────────────────────────────────────────────────────────

describe("when the claim fails or is slow", () => {
  beforeEach(() => {
    // The hook logs the failed claim; that is expected here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("a failed claim falls back to asking again for the same held code, and shows it when it is ready", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ error: "Could not deliver the code." }, 500));
    backend.on("POST /api/data-codes/claim-status", () => json({ status: "ready", code: "LODGE-7H2K-99QX" }));
    const { page, popup } = await openPaystack();

    const reference = paystackSucceeds(popup);
    await settle();
    expect(page.current.recovering).toBe(true);
    expect(page.current.processingClaim).toBe(true);

    // The first ask comes two seconds later, not sooner.
    await wait(1_999);
    expect(sentStatus()).toHaveLength(0);
    await wait(1);
    expect(sentStatus()).toHaveLength(1);
    expect(sentStatus()[0].body).toEqual({
      paymentRef: reference,
      planId: WEEKLY.id,
      hostel: HOSTEL,
      reservationId: "held-code-41",
    });

    await wait(700);
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
    expect(page.current.recovering).toBe(false);
    expect(page.current.processingClaim).toBe(false);
    expect(page.current.purchasing).toBe(false);
    expect(saveCode).toHaveBeenCalledWith("LODGE-7H2K-99QX", "Weekly", CHIAMAKA.uid);
    // The payment was not released, re-held or claimed a second time.
    expect(sentClaim()).toHaveLength(1);
    expect(sentReserve()).toHaveLength(1);
    expect(sentRelease()).toHaveLength(0);
  });

  it("a slow claim is given up after 15 seconds and falls back to asking again", async () => {
    backend.on("POST /api/data-codes/claim", hangUntilAborted);
    backend.on("POST /api/data-codes/claim-status", () => json({ status: "ready", code: "LODGE-7H2K-99QX" }));
    const { page, popup } = await openPaystack();

    paystackSucceeds(popup);
    await wait(14_999);
    expect(sentClaim()[0].signal?.aborted).toBe(false);
    expect(sentStatus()).toHaveLength(0);
    expect(page.current.processingClaim).toBe(true);

    await wait(1);
    expect(sentClaim()[0].signal?.aborted).toBe(true);
    expect(page.current.recovering).toBe(true);

    await wait(2_000);
    expect(sentStatus()).toHaveLength(1);
    expect(sentStatus()[0].body.reservationId).toBe("held-code-41");

    await wait(700);
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
    expect(saveCode).toHaveBeenCalledTimes(1);
  });

  it("keeps asking every four seconds while the backend says the code is still pending", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ error: "Could not deliver the code." }, 502));
    let asked = 0;
    backend.on("POST /api/data-codes/claim-status", () =>
      ++asked < 3 ? json({ status: "pending" }) : json({ status: "ready", code: "LODGE-7H2K-99QX" }),
    );
    const { page, popup } = await openPaystack();

    paystackSucceeds(popup);
    await wait(2_000);
    expect(sentStatus()).toHaveLength(1);
    await wait(3_999);
    expect(sentStatus()).toHaveLength(1);
    await wait(1);
    expect(sentStatus()).toHaveLength(2);
    await wait(4_000);
    expect(sentStatus()).toHaveLength(3);
    // Every ask names the same held code.
    expect(sentStatus().map((request) => request.body.reservationId)).toEqual(["held-code-41", "held-code-41", "held-code-41"]);

    await wait(700);
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");

    // And once the code is on screen, the asking stops.
    await wait(60_000);
    expect(sentStatus()).toHaveLength(3);
    expect(saveCode).toHaveBeenCalledTimes(1);
  });

  it("carries on asking through a dropped connection or an unreadable answer", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ error: "Could not deliver the code." }, 500));
    let asked = 0;
    backend.on("POST /api/data-codes/claim-status", () => {
      asked += 1;
      if (asked === 1) return Promise.reject(new TypeError("Failed to fetch"));
      if (asked === 2) return new Response("<html>Bad Gateway</html>", { status: 502 });
      return json({ status: "ready", code: "LODGE-7H2K-99QX" });
    });
    const { page, popup } = await openPaystack();

    paystackSucceeds(popup);
    await wait(2_000 + 4_000 + 4_000 + 700);

    expect(sentStatus()).toHaveLength(3);
    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
  });

  it("tells the customer to keep their payment reference when the backend says no code could be issued", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ error: "Could not deliver the code." }, 500));
    backend.on("POST /api/data-codes/claim-status", () => json({ status: "unfulfilled" }));
    const { page, popup } = await openPaystack();

    const reference = paystackSucceeds(popup);
    await wait(2_000);

    expect(page.current.error).toBe(
      "Your payment was received but a code couldn't be issued (it may be out of stock). Our team has been notified — please keep your payment reference: " +
        reference,
    );
    expect(page.current.revealedCode).toBeNull();
    expect(page.current.showCodeSheet).toBe(false);
    expect(page.current.processingClaim).toBe(false);
    expect(page.current.recovering).toBe(false);
    expect(page.current.purchasing).toBe(false);
    expect(saveCode).not.toHaveBeenCalled();

    // It stops asking, and the paid-for hold is not given back by the page.
    await wait(60_000);
    expect(sentStatus()).toHaveLength(1);
    expect(sentRelease()).toHaveLength(0);
  });

  it("after 70 seconds of waiting, says the code is being issued and will be emailed", async () => {
    backend.on("POST /api/data-codes/claim", () => json({ error: "Could not deliver the code." }, 500));
    backend.on("POST /api/data-codes/claim-status", () => json({ status: "pending" }));
    const { page, popup } = await openPaystack();

    const reference = paystackSucceeds(popup);
    // 18 asks: the first after 2 s, then one every 4 s. The last is at 70 s.
    await wait(69_999);
    expect(sentStatus()).toHaveLength(17);
    expect(page.current.error).toBe("");
    expect(page.current.recovering).toBe(true);
    expect(page.current.processingClaim).toBe(true);

    await wait(1);
    expect(sentStatus()).toHaveLength(18);
    expect(page.current.error).toBe(
      "Your payment was confirmed and your code is being issued. It will be emailed to you and saved to your dashboard shortly — please keep your payment reference: " +
        reference,
    );
    expect(page.current.revealedCode).toBeNull();
    expect(page.current.recovering).toBe(false);
    expect(page.current.processingClaim).toBe(false);
    expect(page.current.purchasing).toBe(false);

    // Nothing more is asked, and the code is never given back or re-bought.
    await wait(5 * 60_000);
    expect(sentStatus()).toHaveLength(18);
    expect(sentClaim()).toHaveLength(1);
    expect(sentRelease()).toHaveLength(0);
    expect(sentReserve()).toHaveLength(1);
  });

  it("a claim that hung, then turned out to have worked, still shows exactly one code", async () => {
    backend.on("POST /api/data-codes/claim", hangUntilAborted);
    backend.on("POST /api/data-codes/claim-status", () => json({ status: "ready", code: "LODGE-7H2K-99QX" }));
    const { page, popup } = await openPaystack();

    paystackSucceeds(popup);
    await wait(15_000 + 2_000 + 700);
    await wait(5 * 60_000);

    expect(page.current.revealedCode).toBe("LODGE-7H2K-99QX");
    expect(saveCode).toHaveBeenCalledTimes(1);
    expect(sentClaim()).toHaveLength(1);
    expect(sentStatus()).toHaveLength(1);
  });
});

// ── Wallet ──────────────────────────────────────────────────────────────────

describe("paying from the wallet", () => {
  /** A customer whose wallet holds `balanceKobo`, on the plans page with the plan chosen. */
  async function openWithWallet(balanceKobo: number) {
    backend.on("GET /api/wallet", () => json(WALLET_WITH(balanceKobo)));
    const page = await openPlansPage();
    await act(async () => {
      await page.current.loadWallet();
    });
    await choosePlan(page);
    return page;
  }

  it("is the method offered when the balance covers the plan", async () => {
    const page = await openWithWallet(500_000);

    expect(page.current.walletCovers).toBe(true);
    expect(page.current.payMethod).toBe("wallet");
    // Card is only for customers the bank couldn't give an account number.
    expect(page.current.cardOffered).toBe(false);
  });

  it("holds a code, pays from the balance and shows the code, without Paystack or the card warning", async () => {
    backend.on("POST /api/wallet/pay", () =>
      json({ status: "ready", type: "data", code: "LODGE-WALLET-55", planName: "Weekly", balanceKobo: 165_000, paidFromWallet: true }),
    );
    const page = await openWithWallet(500_000);

    await tapPay(page);

    expect(sentReserve()).toHaveLength(1);
    expect(backend.sent("POST /api/wallet/pay")).toHaveLength(1);
    // The order names the plan and the held code; the backend works out the price.
    expect(backend.sent("POST /api/wallet/pay")[0].body).toEqual({
      planId: WEEKLY.id,
      hostel: HOSTEL,
      reservationId: "held-code-41",
    });
    expect(paystackPopups).toHaveLength(0);
    expect(page.current.showPaymentWarning).toBe(false);

    await wait(700);
    expect(page.current.revealedCode).toBe("LODGE-WALLET-55");
    expect(saveCode).toHaveBeenCalledWith("LODGE-WALLET-55", "Weekly", CHIAMAKA.uid);
    // The balance shown afterwards is the backend's figure.
    expect(page.current.walletBalanceKobo).toBe(165_000);
    expect(page.current.purchasing).toBe(false);
    expect(sentRelease()).toHaveLength(0);
    expect(backend.unanswered).toEqual([]);
  });

  it("gives the held code back and points to bank transfer when the backend says the wallet is short", async () => {
    backend.on("POST /api/wallet/pay", () => json({ error: "Your wallet has ₦1,000.", code: "WALLET_SHORT" }, 402));
    const page = await openWithWallet(500_000);

    await tapPay(page);

    expect(sentRelease()).toHaveLength(1);
    expect(sentRelease()[0].body).toEqual({ reservationId: "held-code-41" });
    expect(page.current.payMethod).toBe("transfer");
    expect(page.current.error).toBe(
      "Your wallet has ₦1,000. Pay by bank transfer instead — what's in your wallet still counts.",
    );
    expect(page.current.purchasing).toBe(false);
    expect(page.current.revealedCode).toBeNull();
  });

  it("keeps the code held when it can't tell whether the wallet was charged", async () => {
    backend.on("POST /api/wallet/pay", () => Promise.reject(new TypeError("Failed to fetch")));
    const page = await openWithWallet(500_000);

    await tapPay(page);

    // Giving the code back here could hand a paid-for code to someone else.
    expect(sentRelease()).toHaveLength(0);
    expect(page.current.error).toBe(
      "We couldn't confirm your order. If money left your wallet, your code will appear in your Account and email shortly.",
    );
    expect(page.current.purchasing).toBe(false);
  });

  it("does not give the code back when the money was taken but the code is still on its way", async () => {
    backend.on("POST /api/wallet/pay", () =>
      json({ error: "Your payment went through. Your code will be emailed shortly.", code: "WALLET_PAID_PENDING" }, 202),
    );
    const page = await openWithWallet(500_000);

    await tapPay(page);

    expect(sentRelease()).toHaveLength(0);
    expect(page.current.error).toBe("Your payment went through. Your code will be emailed shortly.");
    expect(page.current.purchasing).toBe(false);
  });

  it("refuses a sold-out plan before any hold or wallet charge", async () => {
    backend.on("POST /api/data-codes/check-availability", () => json({ available: false, count: 0 }));
    const page = await openWithWallet(500_000);

    await tapPay(page);

    expect(sentReserve()).toHaveLength(0);
    expect(backend.sent("POST /api/wallet/pay")).toHaveLength(0);
    expect(paystackPopups).toHaveLength(0);
  });

  it("charges nothing when no code could be held", async () => {
    backend.on("POST /api/data-codes/reserve", () => json({ error: "Weekly has just sold out at Ayoni Block A." }, 409));
    const page = await openWithWallet(500_000);

    await tapPay(page);

    expect(backend.sent("POST /api/wallet/pay")).toHaveLength(0);
    expect(page.current.error).toBe("Weekly has just sold out at Ayoni Block A.");
    expect(page.current.purchasing).toBe(false);
  });

  it("explains a dropped connection while holding a code in plain words, and charges nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.on("POST /api/data-codes/reserve", () => Promise.reject(new TypeError("Failed to fetch")));
    const page = await openWithWallet(500_000);

    await tapPay(page);

    expect(backend.sent("POST /api/wallet/pay")).toHaveLength(0);
    expect(page.current.error).toBe("Failed to start payment. Please try again.");
    expect(page.current.purchasing).toBe(false);
  });
});

// ── Bank transfer ───────────────────────────────────────────────────────────

describe("paying by bank transfer", () => {
  const WAITING_ORDER = {
    status: "waiting",
    pendingId: "pending-order-9",
    reservationId: "held-code-41",
    amountKobo: 335_000,
    toTransferKobo: 235_000,
    dva: { account_number: "9912345678", bank_name: "Wema Bank", account_name: "LODGE/CHIAMAKA OBI" },
  };

  async function openWithWallet(balanceKobo: number) {
    backend.on("GET /api/wallet", () => json(WALLET_WITH(balanceKobo)));
    const page = await openPlansPage();
    await act(async () => {
      await page.current.loadWallet();
    });
    await choosePlan(page);
    return page;
  }

  it("is the method offered when the wallet can't cover the plan", async () => {
    const page = await openWithWallet(100_000);

    expect(page.current.walletCovers).toBe(false);
    expect(page.current.payMethod).toBe("transfer");
  });

  it("cannot be switched to Wallet while the balance is short", async () => {
    const page = await openWithWallet(100_000);

    act(() => page.current.choosePayMethod("wallet"));

    expect(page.current.payMethod).toBe("transfer");
  });

  it("holds a code, places the order and shows what to transfer, as the backend worked it out", async () => {
    backend.on("POST /api/checkout/dva", () => json(WAITING_ORDER));
    const page = await openWithWallet(100_000);

    await tapPay(page);

    expect(backend.sent("POST /api/checkout/dva")[0].body).toEqual({
      planId: WEEKLY.id,
      hostel: HOSTEL,
      reservationId: "held-code-41",
    });
    expect(page.current.transferOrder).toMatchObject({
      pendingId: "pending-order-9",
      toTransferKobo: 235_000,
      dva: { account_number: "9912345678", bank_name: "Wema Bank" },
    });
    expect(paystackPopups).toHaveLength(0);
    expect(page.current.purchasing).toBe(false);
    expect(backend.unanswered).toEqual([]);
  });

  it("keeps the code held for the order, even when the customer closes the transfer details", async () => {
    backend.on("POST /api/checkout/dva", () => json(WAITING_ORDER));
    const page = await openWithWallet(100_000);
    await tapPay(page);

    act(() => page.current.closeTransfer(true));
    await settle();

    expect(sentRelease()).toHaveLength(0);
    expect(page.current.transferOrder).toBeNull();
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        message: "We'll email your code when your transfer arrives. It'll be in your Account too.",
      }),
    );
  });

  it("shows the code when the transfer lands", async () => {
    backend.on("POST /api/checkout/dva", () => json(WAITING_ORDER));
    const page = await openWithWallet(100_000);
    await tapPay(page);

    act(() => page.current.onTransferReady({ status: "ready", type: "data", code: "LODGE-XFER-07", planName: "Weekly", balanceKobo: 0 }));
    await wait(700);

    expect(page.current.transferOrder).toBeNull();
    expect(page.current.revealedCode).toBe("LODGE-XFER-07");
    expect(page.current.walletBalanceKobo).toBe(0);
    expect(saveCode).toHaveBeenCalledWith("LODGE-XFER-07", "Weekly", CHIAMAKA.uid);
  });

  it("offers Card, and gives the code back, when the bank can't open an account number", async () => {
    backend.on("POST /api/checkout/dva", () =>
      json({ error: "We couldn't get you an account number. Please pay by card.", code: "DVA_UNAVAILABLE" }, 503),
    );
    const page = await openWithWallet(100_000);
    expect(page.current.cardOffered).toBe(false);

    await tapPay(page);

    expect(sentRelease()).toHaveLength(1);
    expect(page.current.cardOffered).toBe(true);
    expect(page.current.payMethod).toBe("card");
    expect(page.current.error).toBe("We couldn't get you an account number. Please pay by card.");
  });
});
