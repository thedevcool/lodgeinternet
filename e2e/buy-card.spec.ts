/**
 * Buying a plan by card: the journey customers rely on most.
 *
 * Reserve → pay → claim is the only way a code is issued (engineering
 * standard P4). These tests follow it from the home page to the code on
 * screen, and through the ways it can go wrong: the card form closed without
 * paying, the last code taken by someone else, a claim that fails, and a
 * payment the backend could not fill.
 *
 * The total is the server's (P2). The fixture plan "20GB Monthly" carries a
 * total the website's old fallback formula would not produce, so a page that
 * recomputes shows the wrong figure and fails here.
 *
 * Card is offered when the wallet is off (or the bank couldn't open the
 * customer's account), which is the scenario every test here sets.
 */
import { checkPage } from "./support/checks";
import { acknowledgePaymentWarning, checkoutSheet, openCheckout, planCard } from "./support/checkout";
import { CUSTOMERS, CUSTOMER_PASSWORD, UNITY_LODGE_PLANS, naira, plan, planIdAt } from "./support/data";
import { closePaystack, paystackOpenCount, paystackOpened, payWithPaystack } from "./support/paystack";
import { alertOn } from "./support/locators";
import { expect, test } from "./support/test";

const TWENTY_GB = plan("20gb-monthly");
const TOTAL = naira(TWENTY_GB.total);
// What the site's fallback formula makes of this plan's price. Never shown.
const RECOMPUTED_TOTAL = "3,304";

const CLAIM = "POST /api/data-codes/claim";

test("first purchase: home, find the hostel, pick a plan, pay by card, get the code", async ({ page, api }) => {
  // The whole journey with the three checks at every step: ten page states.
  test.slow();
  // The claim is held so the "preparing your code" moment can be looked at.
  await api.scenario({ wallet: "off", hold: [CLAIM] });
  // Bola has an account but has never chosen a hostel, so she still sees the
  // whole directory and is asked to confirm her hostel on this first purchase.
  const bola = await api.signIn("bola");

  // ── Home: find the hostel ──────────────────────────────────────────────
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Select your hostel" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Unity Estate.*5 hostels/ })).toBeVisible();
  await checkPage(page);

  await page.getByLabel("Search locations or hostels").fill("unity lo");
  const result = page.getByRole("link", { name: /Unity Lodge/ });
  await expect(result).toBeVisible();
  await checkPage(page);
  await result.click();

  // ── Plans: the server's total, on the card and on the bar ──────────────
  await expect(page).toHaveURL(UNITY_LODGE_PLANS);
  await expect(page.getByRole("heading", { level: 1, name: "Unity Lodge" })).toBeVisible();
  await expect(planCard(page, TWENTY_GB.name)).toContainText(TOTAL);
  await expect(planCard(page, TWENTY_GB.name)).toContainText("Only 3 left");
  await checkPage(page);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  await expect(sheet.getByText("Total to Pay")).toBeVisible();
  await expect(sheet.getByRole("definition")).toHaveText(TOTAL);
  await expect(sheet.getByText(`Purchasing as ${bola.email}`)).toBeVisible();
  await expect(page.getByText(RECOMPUTED_TOTAL)).toHaveCount(0);
  await checkPage(page);

  // ── Pay: confirm the hostel, read the warning, and only then Paystack ──
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();

  const confirm = page.getByRole("dialog", { name: "Confirm Your Hostel" });
  await expect(confirm.getByRole("radio", { name: "Unity Lodge" })).toBeChecked();
  await checkPage(page);
  await confirm.getByRole("button", { name: "Confirm & Buy" }).click();

  await expect(page.getByRole("alertdialog", { name: "Before you pay" })).toBeVisible();
  await checkPage(page);
  expect(await paystackOpenCount(page), "Paystack must not open before the warning is read").toBe(0);
  await acknowledgePaymentWarning(page);

  // A code is held before Paystack opens, and Paystack is told which one.
  const paystack = await paystackOpened(page);
  const held = (await api.state()).reservations;
  expect(held).toHaveLength(1);
  expect(held[0]).toMatchObject({ planId: planIdAt("unity-lodge", "20gb-monthly"), hostel: "Unity Lodge", uid: bola.uid, released: false });
  expect(paystack.metadata.reservationId).toBe(held[0].reservationId);
  expect(paystack.metadata).toMatchObject({ planId: held[0].planId, planName: TWENTY_GB.name, hostel: "Unity Lodge" });

  // Paystack is asked for the server's total, in kobo, and nothing else.
  expect(paystack.amount).toBe(TWENTY_GB.total * 100);
  expect(paystack).toMatchObject({ key: "pk_test_e2e", email: bola.email, currency: "NGN" });
  // The platform's share comes from the server too (GET /api/checkout/reserve-split):
  // Paystack is given the main account's part, the total less that share.
  const split = (await api.state()).log.find((entry) => entry.path === "/api/checkout/reserve-split");
  expect(split?.query).toBe(`?priceNaira=${TWENTY_GB.price}`);
  expect(paystack.subaccount).toBe("ACCT_e2e_reserve");
  expect(paystack.transaction_charge).toBe(TWENTY_GB.total * 100 - 7500);

  // While the card form is open the sheet waits and can't be paid twice.
  await expect(sheet.getByRole("button", { name: "Processing..." })).toBeDisabled();

  // ── Paid: "preparing", then the code ───────────────────────────────────
  const claimRequest = page.waitForRequest((request) => request.url().endsWith("/api/data-codes/claim"));
  await payWithPaystack(page);

  const preparing = page.getByRole("dialog", { name: "Preparing your access code" });
  await expect(preparing.getByRole("heading", { name: "Payment successful!" })).toBeVisible();
  await expect(preparing.getByText("Preparing your access code…")).toBeVisible();
  await checkPage(page);

  // The claim names the same held code and the reference Paystack was given.
  expect((await claimRequest).postDataJSON()).toMatchObject({
    planId: held[0].planId,
    hostel: "Unity Lodge",
    email: bola.email,
    paymentRef: paystack.ref,
    reservationId: held[0].reservationId,
  });

  await api.release(CLAIM);
  const code = page.getByRole("dialog", { name: "Your access code" });
  await expect(code.getByRole("heading", { name: "You’re connected!" })).toBeVisible();
  await expect(code.getByText(TWENTY_GB.code)).toBeVisible();
  await expect(code.getByText(`we’ve emailed it to ${bola.email}`)).toBeVisible();
  await checkPage(page);

  // Paystack's form closing after a payment is not "closed without paying":
  // the code that was just sold must not be handed back.
  const after = await api.state();
  expect(after.reservations[0]).toMatchObject({ released: false, claimed: true });
  expect(after.log.filter((entry) => entry.path === "/api/data-codes/release")).toHaveLength(0);
  expect(after.claims).toEqual([
    { paymentRef: paystack.ref, planId: held[0].planId, reservationId: held[0].reservationId, code: TWENTY_GB.code },
  ]);

  // ── The code is kept on this phone and shown again on the Account page ──
  await code.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Your active codes" })).toBeVisible();
  // Bola has no earlier purchases, so the only code to show is the saved one.
  await page.getByRole("button", { name: "Show code" }).click();
  await expect(page.getByText(TWENTY_GB.code)).toBeVisible();
  await checkPage(page);
});

test("closing Paystack without paying gives the held code back", async ({ page, api }) => {
  await api.scenario({ wallet: "off" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();
  await acknowledgePaymentWarning(page);
  await paystackOpened(page);

  // One of the three codes is now held for this customer.
  await expect(planCard(page, TWENTY_GB.name)).toContainText("Only 2 left");
  // The sheet is locked while paying: Escape must not close it.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();

  await closePaystack(page);

  await expect.poll(async () => (await api.state()).reservations[0].released, { message: "the held code was never released" }).toBe(true);
  // Nothing was claimed, and the customer can try again straight away.
  expect((await api.state()).claims).toHaveLength(0);
  await expect(sheet.getByRole("button", { name: `Pay ${TOTAL}` })).toBeEnabled();
  await expect(planCard(page, TWENTY_GB.name)).toContainText("Only 3 left");
  await checkPage(page);
});

test("a sold-out plan can't be chosen, and a code taken at the last second can't be paid for", async ({ page, api }) => {
  await api.scenario({ wallet: "off", reserve: "sold-out" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  // Sold out on the list: the card says so and can't be picked.
  const soldOut = planCard(page, plan("90gb-monthly").name);
  await expect(soldOut).toContainText("Sold out");
  await expect(soldOut).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);

  // In stock on the list, but the last code goes to someone else first: the
  // hold is refused, the customer is told, and Paystack never opens.
  const sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();
  await acknowledgePaymentWarning(page);

  await expect(sheet.getByRole("alert")).toContainText("the last code for this plan was just taken");
  expect(await paystackOpenCount(page)).toBe(0);
  expect((await api.state()).reservations).toHaveLength(0);
  await checkPage(page);
});

test("a plan with no codes left by the time the page checks is marked sold out", async ({ page, api }) => {
  await api.scenario({ wallet: "off", stock: { "20gb-monthly": 0, "40gb-monthly": 2 } });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  await expect(planCard(page, TWENTY_GB.name)).toContainText("Sold out");
  await expect(planCard(page, TWENTY_GB.name)).toBeDisabled();
  await expect(planCard(page, plan("40gb-monthly").name)).toContainText("Only 2 left");
  await expect(planCard(page, plan("40gb-monthly").name)).toBeEnabled();
  await checkPage(page);
});

test("a claim that fails falls back to checking again, and the code still shows", async ({ page, api }) => {
  await api.scenario({ wallet: "off", claim: "error" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();
  await acknowledgePaymentWarning(page);
  const paystack = await paystackOpened(page);

  const statusRequest = page.waitForRequest((request) => request.url().endsWith("/api/data-codes/claim-status"));
  await payWithPaystack(page);

  // The claim answers 500; the page says the payment is safe and keeps looking.
  await expect(page.getByText("Payment confirmed — securing your code…")).toBeVisible();
  expect((await statusRequest).postDataJSON()).toMatchObject({
    paymentRef: paystack.ref,
    reservationId: paystack.metadata.reservationId,
  });

  const code = page.getByRole("dialog", { name: "Your access code" });
  await expect(code.getByText(TWENTY_GB.code)).toBeVisible();
  await checkPage(page);
});

test("a payment that couldn't be filled shows the payment reference to keep", async ({ page, api }) => {
  await api.scenario({ wallet: "off", claim: "unfulfilled" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();
  await acknowledgePaymentWarning(page);
  const paystack = await paystackOpened(page);
  await payWithPaystack(page);

  const notice = alertOn(page).filter({ hasText: "Your payment was received" });
  await expect(notice).toContainText("a code couldn't be issued");
  await expect(notice).toContainText(`please keep your payment reference: ${paystack.ref}`);
  // No code sheet, and no code anywhere on the page.
  await expect(page.getByRole("dialog", { name: "Your access code" })).toHaveCount(0);
  await expect(page.getByText(TWENTY_GB.code)).toHaveCount(0);
  await checkPage(page);
});

test("the payment warning is shown once: the second purchase goes straight to Paystack", async ({ page, api }) => {
  await api.scenario({ wallet: "off" });
  const amaka = await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  let sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();
  await acknowledgePaymentWarning(page);
  await paystackOpened(page);
  await closePaystack(page);
  await expect(sheet.getByRole("button", { name: `Pay ${TOTAL}` })).toBeEnabled();

  // The choice is remembered for this customer on this phone, across a reload.
  await page.reload();
  sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();
  await paystackOpened(page);
  await expect(page.getByRole("alertdialog", { name: "Before you pay" })).toHaveCount(0);
  expect(await page.evaluate((uid) => localStorage.getItem(`lodge-payment-return-warning:${uid}`), amaka.uid)).toBe("acknowledged");
});

test("TV plan by card: paid, but the TV can't be connected yet, so the server's message shows before the account page", async ({ page, api }) => {
  // A returning TV customer (MAC address on file) goes straight to payment.
  await api.scenario({ wallet: "off", tv: "returning" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);
  await page.getByRole("tab", { name: "TV" }).click();

  const tv = plan("tv-monthly");
  const sheet = await openCheckout(page, tv.name);
  await expect(sheet.getByRole("definition")).toHaveText(naira(tv.total));
  await checkPage(page);
  await sheet.getByRole("button", { name: "Continue to Purchase" }).click();
  await acknowledgePaymentWarning(page);

  const paystack = await paystackOpened(page);
  expect(paystack.amount).toBe(tv.total * 100);
  expect(paystack.metadata).toMatchObject({ planId: planIdAt("unity-lodge", "tv-monthly"), planType: "tv", hostel: "Unity Lodge" });

  const purchaseRequest = page.waitForRequest((request) => request.url().endsWith("/api/tv/purchase"));
  await payWithPaystack(page);
  expect((await purchaseRequest).postDataJSON()).toMatchObject({
    planId: planIdAt("unity-lodge", "tv-monthly"),
    paymentRef: paystack.ref,
    hostel: "Unity Lodge",
    isNewUser: false,
  });

  // The stand-in answers accessGranted: false with a message; the customer
  // reads it, and is then taken to the account page.
  const notice = page.getByRole("status").filter({ hasText: "Payment received" });
  await expect(notice).toContainText("We couldn't connect your TV just yet. Our team has been told and will finish it shortly.");
  await expect(page).toHaveURL("/dashboard", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "TV subscriptions" })).toBeVisible();
});

test("a signed-out visitor who taps Pay is sent to create an account, and back", async ({ page, api }) => {
  await api.scenario({ wallet: "off" });
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  // Signed out, the sheet asks for an email and shows the same server total.
  await expect(sheet.getByRole("definition")).toHaveText(TOTAL);
  await sheet.getByLabel("Email address (for receipt)").fill("ada.nwosu@example.com");
  await checkPage(page);
  await sheet.getByRole("button", { name: `Pay ${TOTAL}` }).click();

  await expect(page).toHaveURL(/\/register\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("hostel")).toBe("Unity Lodge");
  expect(url.searchParams.get("email")).toBe("ada.nwosu@example.com");
  expect(url.searchParams.get("redirect")).toBe(UNITY_LODGE_PLANS);
  await expect(page.getByRole("status").filter({ hasText: "Sign In Required" })).toBeVisible();

  // Nothing was held and Paystack never opened for someone we can't identify.
  expect((await api.state()).reservations).toHaveLength(0);

  // They already have an account: "Sign In" keeps the way back to the plans
  // page (it used to drop it, and signing in ended on the dashboard). So does
  // the "Log in" tab at the top of the form.
  const withWayBack = `/login?redirect=${encodeURIComponent(UNITY_LODGE_PLANS)}`;
  await expect(page.getByRole("tab", { name: "Log in" })).toHaveAttribute("href", withWayBack);
  await page.getByRole("link", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(withWayBack);
  // And back again, should they need an account after all.
  await expect(page.getByRole("link", { name: "Create Account", exact: true })).toHaveAttribute(
    "href",
    `/register?redirect=${encodeURIComponent(UNITY_LODGE_PLANS)}`,
  );
  await page.getByLabel("Email Address").fill(CUSTOMERS.amaka.email);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(UNITY_LODGE_PLANS);
  await expect(checkoutSheet(page)).toHaveCount(0);
});
