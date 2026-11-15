/**
 * Buying a plan from the wallet, and by bank transfer.
 *
 * Neither opens Paystack. The wallet pays at once from the balance; a bank
 * transfer shows the customer their own account number and waits until the
 * backend says the money has landed. Wallet amounts arrive in kobo and are
 * shown in naira; the plan total is still the server's (P2, P3).
 */
import { checkPage } from "./support/checks";
import { openCheckout, planCard } from "./support/checkout";
import { UNITY_LODGE_PLANS, WALLET, naira, plan } from "./support/data";
import { paystackOpenCount } from "./support/paystack";
import { expect, test } from "./support/test";

const TWENTY_GB = plan("20gb-monthly");
const TOTAL = naira(TWENTY_GB.total);
const FUNDED_KOBO = WALLET.states.funded.balanceKobo;
const SHORT_KOBO = WALLET.states.short.balanceKobo;

test("a funded wallet pays in one tap, without Paystack", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  const methods = sheet.getByRole("radiogroup", { name: "Payment method" });
  // 1,250,000 kobo from the API is shown as naira.
  await expect(methods.getByRole("radio", { name: /Wallet/ })).toContainText(naira(FUNDED_KOBO / 100));
  await expect(methods.getByRole("radio", { name: /Wallet/ })).toBeChecked();
  await expect(methods.getByRole("radio", { name: /Bank transfer/ })).toBeVisible();
  // Card is only for customers whose bank account couldn't be opened.
  await expect(methods.getByRole("radio", { name: /Card/ })).toHaveCount(0);
  await checkPage(page);

  const payRequest = page.waitForRequest((request) => request.url().endsWith("/api/wallet/pay"));
  await sheet.getByRole("button", { name: `Pay ${TOTAL} from wallet` }).click();

  const code = page.getByRole("dialog", { name: "Your access code" });
  await expect(code.getByText(TWENTY_GB.code)).toBeVisible();

  // A code was held first and the order names it; no warning, no Paystack.
  const state = await api.state();
  expect(state.reservations).toHaveLength(1);
  expect((await payRequest).postDataJSON()).toEqual({
    planId: state.reservations[0].planId,
    hostel: "Unity Lodge",
    reservationId: state.reservations[0].reservationId,
  });
  expect(await paystackOpenCount(page)).toBe(0);
  expect(state.walletBalanceKobo).toBe(FUNDED_KOBO - TWENTY_GB.total * 100);
  await checkPage(page);

  // The new balance, as the server gave it, is on the next checkout.
  await code.getByRole("button", { name: "Done" }).click();
  await expect(code).toBeHidden();
  const again = await openCheckout(page, TWENTY_GB.name);
  await expect(again.getByRole("radio", { name: /Wallet/ })).toContainText(naira(state.walletBalanceKobo / 100));
});

test("a wallet that can't cover the plan pays by bank transfer, and moves on when the money lands", async ({ page, api }) => {
  await api.scenario({ wallet: "short" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  const shortBy = naira(TWENTY_GB.total - SHORT_KOBO / 100);
  const wallet = sheet.getByRole("radio", { name: /Wallet/ });
  await expect(wallet).toContainText(naira(SHORT_KOBO / 100));
  await expect(wallet).toContainText(`Top up ${shortBy} more to use your wallet`);
  await expect(wallet).toHaveAttribute("aria-disabled", "true");
  await expect(sheet.getByRole("radio", { name: /Bank transfer/ })).toBeChecked();

  await sheet.getByRole("button", { name: `Pay ${TOTAL} by transfer` }).click();

  // The customer's own account number, and only the difference to send.
  const transfer = page.getByRole("dialog", { name: "Pay by bank transfer" });
  await expect(transfer.getByRole("heading", { name: `Transfer ${shortBy} to your account` })).toBeVisible();
  await expect(transfer.getByText(WALLET.dva.account_number)).toBeVisible();
  await expect(transfer.getByText(WALLET.dva.bank_name)).toBeVisible();
  await expect(transfer.getByText(`${naira(SHORT_KOBO / 100)} already in your wallet counts towards the ${TOTAL} total.`)).toBeVisible();
  await expect(transfer.getByRole("status")).toHaveText("Waiting for your transfer…");
  await checkPage(page);
  expect(await paystackOpenCount(page)).toBe(0);

  // The stand-in says the transfer arrived. The sheet asks every 5 seconds,
  // so the code appears on its next ask.
  await api.transferLanded();
  const code = page.getByRole("dialog", { name: "Your access code" });
  await expect(code.getByText(TWENTY_GB.code)).toBeVisible({ timeout: 15_000 });
  await expect(transfer).toBeHidden();

  // The order kept the code that was held when Pay was tapped.
  const state = await api.state();
  expect(state.orders).toHaveLength(1);
  expect(state.orders[0]).toMatchObject({ reservationId: state.reservations[0].reservationId, paid: true });
  expect(state.reservations[0].released).toBe(false);
});

test("closing the transfer sheet cancels nothing: the code stays held", async ({ page, api }) => {
  await api.scenario({ wallet: "short" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  await sheet.getByRole("button", { name: `Pay ${TOTAL} by transfer` }).click();
  const transfer = page.getByRole("dialog", { name: "Pay by bank transfer" });
  await transfer.getByRole("button", { name: "Close", exact: true }).last().click();

  await expect(transfer).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "We'll finish your order" })).toContainText(
    "We'll email your code when your transfer arrives.",
  );
  const state = await api.state();
  expect(state.reservations[0].released).toBe(false);
  expect(state.log.filter((entry) => entry.path === "/api/data-codes/release")).toHaveLength(0);
});

test("when the bank couldn't open an account, card is offered beside the wallet", async ({ page, api }) => {
  await api.scenario({ wallet: "dva-failed" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const sheet = await openCheckout(page, TWENTY_GB.name);
  const methods = sheet.getByRole("radiogroup", { name: "Payment method" });
  await expect(methods.getByRole("radio", { name: /Wallet/ })).toContainText(naira(0));
  await expect(methods.getByRole("radio", { name: /Card/ })).toBeChecked();
  await expect(sheet.getByRole("button", { name: `Pay ${TOTAL}`, exact: true })).toBeEnabled();
  await checkPage(page);

  // Choosing bank transfer anyway is refused by the bank; card is picked again.
  await methods.getByRole("radio", { name: /Bank transfer/ }).click();
  await sheet.getByRole("button", { name: `Pay ${TOTAL} by transfer` }).click();
  await expect(sheet.getByRole("alert")).toContainText("Bank transfer isn't available right now. Please pay by card.");
  await expect(methods.getByRole("radio", { name: /Card/ })).toBeChecked();
  // The code held for the refused order went back.
  await expect.poll(async () => (await api.state()).reservations.map((r) => r.released)).toEqual([true]);
});

test("the plans page keeps a 5-device, an unlimited and a TV tab apart, each with the server's totals", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);

  const tabs = page.getByRole("tablist", { name: "Plan type" });
  await expect(tabs.getByRole("tab", { name: "3 Devices" })).toHaveAttribute("aria-selected", "true");

  await tabs.getByRole("tab", { name: "5 Devices" }).click();
  const five = plan("40gb-monthly-5");
  await expect(planCard(page, five.name)).toContainText(naira(five.total));
  await expect(planCard(page, five.name)).toContainText("5 Devices");

  await tabs.getByRole("tab", { name: "Unlimited" }).click();
  const unlimited = plan("unlimited-weekly");
  await expect(planCard(page, unlimited.name)).toContainText(naira(unlimited.total));

  await tabs.getByRole("tab", { name: "TV" }).click();
  const tv = plan("tv-monthly");
  await expect(planCard(page, tv.name)).toContainText(naira(tv.total));
  await expect(planCard(page, tv.name)).toContainText("30 Days Subscription");
  await checkPage(page);
});
