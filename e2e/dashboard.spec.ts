/**
 * The dashboard (the customer's "Account" page): who they are, their wallet,
 * their hostel, live balances, past purchases with the code shown again on
 * request, and the empty state a new customer sees.
 */
import { checkPage } from "./support/checks";
import { CUSTOMERS, WALLET, naira } from "./support/data";
import { expect, test } from "./support/test";

const AMAKA = CUSTOMERS.amaka;

test("a returning customer sees their wallet, hostel, balances and purchases", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByText(AMAKA.displayName, { exact: true })).toBeVisible();
  await expect(page.getByText(AMAKA.email)).toBeVisible();

  // ── Wallet card: kobo from the API, shown as naira ─────────────────────
  await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible();
  await expect(page.getByText(naira(WALLET.states.funded.balanceKobo / 100), { exact: true })).toBeVisible();
  await expect(page.getByText(WALLET.dva.account_number)).toBeVisible();
  await expect(page.getByText(WALLET.dva.bank_name)).toBeVisible();
  await expect(page.getByText("LODGE INTERNET / CHIAMAKA OKAFOR")).toBeVisible();

  // ── Wallet activity: money in is +, money out is − ─────────────────────
  await expect(page.getByText("+₦15,000")).toBeVisible();
  await expect(page.getByText("Plan purchase · 20GB Monthly")).toBeVisible();
  await expect(page.getByText("−₦3,350")).toBeVisible();
  await expect(page.getByText("Refund", { exact: true })).toBeVisible();
  await expect(page.getByText("+₦850")).toBeVisible();

  // ── Hostel, live balance, purchases ────────────────────────────────────
  await expect(page.getByRole("link", { name: /Unity Lodge.*Buy more plans/ })).toHaveAttribute("href", "/unity-estate/unity-lodge/plans");
  await expect(page.getByText("12.4 GB")).toBeVisible();
  await expect(page.getByText("17 days left", { exact: false })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Recent purchases" })).toBeVisible();
  for (const purchase of AMAKA.purchases) {
    await expect(page.getByText(naira(purchase.price), { exact: true }).first()).toBeVisible();
  }
  // The unfilled order says so in words the customer can act on.
  await expect(page.getByRole("status").filter({ hasText: "Awaiting fulfilment" })).toContainText("Our team has been notified");
  await checkPage(page);
});

test("a code bought earlier can be shown again, hidden, and re-sent by email", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto("/dashboard");

  // Two delivered purchases have a code on file; the newest is listed first.
  const show = page.getByRole("button", { name: "Show code" });
  await expect(show).toHaveCount(2);
  const revealRequest = page.waitForRequest((request) => request.url().endsWith("/api/data-codes/reveal"));
  await show.first().click();
  expect((await revealRequest).postDataJSON()).toEqual({ purchaseId: "pur_1003" });

  // The live balance above already names this code; now the purchase row does too.
  await expect(page.getByText("Your access code")).toBeVisible();
  await expect(page.getByText(AMAKA.purchaseCodes.pur_1003)).toHaveCount(2);
  await checkPage(page);

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByText("Your access code")).toHaveCount(0);
  await expect(page.getByText(AMAKA.purchaseCodes.pur_1003)).toHaveCount(1);

  await page.getByRole("button", { name: "Resend email" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Email sent" })).toContainText(`We've re-sent the code to ${AMAKA.email}.`);
});

test("a new customer sees empty states that say what to do next", async ({ page, api }) => {
  await api.scenario({ wallet: "new" });
  await api.signIn("tunde");
  await page.goto("/dashboard");

  await expect(page.getByText(CUSTOMERS.tunde.displayName, { exact: true })).toBeVisible();
  await expect(page.getByText(naira(0), { exact: true })).toBeVisible();
  await expect(page.getByText("No wallet activity yet")).toBeVisible();
  await expect(page.getByText("Top-ups and plans paid from your wallet will show here.")).toBeVisible();
  await expect(page.getByText("No purchases yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Plans" })).toHaveAttribute("href", "/palm-grove/palm-court/plans");
  // Nothing bought, so no balances or saved codes sections at all.
  await expect(page.getByRole("heading", { name: "Your balances" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your active codes" })).toHaveCount(0);
  await checkPage(page);
});

test("with the wallet switched off, the account page has no wallet at all", async ({ page, api }) => {
  // A feature that isn't on doesn't appear (engineering standard P7).
  await api.scenario({ wallet: "off" });
  await api.signIn("amaka");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Recent purchases" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Wallet activity" })).toHaveCount(0);
  await checkPage(page);
});

test("when the bank couldn't open an account number, the wallet offers a retry and card top-up", async ({ page, api }) => {
  await api.scenario({ wallet: "dva-failed" });
  await api.signIn("amaka");
  await page.goto("/dashboard");

  await expect(page.getByText("The bank couldn't open your account number just now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // No amount typed: the form says what the least is.
  await expect(page.getByLabel("Top up by card")).toBeVisible();
  await page.getByRole("button", { name: "Top up" }).click();
  await expect(page.getByText("Top up at least ₦500.")).toBeVisible();
  await checkPage(page);

  // Too small an amount gets the same message from the page, tied to the
  // field. The browser's own bubble used to pop up instead and stop the
  // form before the page could say anything. (Reloaded, so the message from
  // the empty box above isn't still showing.)
  await page.reload();
  await page.getByLabel("Top up by card").fill("200");
  await page.getByRole("button", { name: "Top up" }).click();
  await expect(page.getByText("Top up at least ₦500.")).toBeVisible();
  await expect(page.getByLabel("Top up by card")).toHaveAccessibleDescription("Top up at least ₦500.");
});

test("a visitor who isn't signed in is sent to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
});
