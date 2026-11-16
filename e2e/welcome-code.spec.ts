/**
 * Welcome codes: a resident scans the poster in a newly set-up hostel,
 * creates an account and gets one free code.
 *
 * The poster's QR code opens /welcome/<token>. The stand-in knows one
 * giveaway, Palm Court's (e2e/mock-api.mjs, WELCOME), switched with the
 * `giveaway` scenario knob. Since 2026-11-16 no poster is needed: a resident
 * who signs up at the hostel is given the code on landing on the Account
 * page, and the last tests here follow that. Who may claim is the backend's decision; these
 * check that the website asks, shows the code, and shows the backend's
 * reason when it says no.
 */
import { checkPage } from "./support/checks";
import { CUSTOMERS, CUSTOMER_PASSWORD, VERIFICATION_CODE, WELCOME_CODE, WELCOME_GIVES, WELCOME_POSTER } from "./support/data";
import { alertOn } from "./support/locators";
import { expect, test } from "./support/test";

test("a new resident scans the poster, creates an account with the hostel already chosen, and gets the code", async ({ page, api }) => {
  await api.scenario({ giveaway: "open", wallet: "new" });
  await page.goto(WELCOME_POSTER);

  // ── What the poster offers ─────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 2, name: "Your first data code is free" })).toBeVisible();
  await expect(page.getByText("Welcome to Palm Court")).toBeVisible();
  await expect(page.getByText(`${WELCOME_GIVES}.`)).toBeVisible();
  await expect(page.getByText("One code per person, for Palm Court residents with a new account. Ends 29 November.")).toBeVisible();
  await checkPage(page);

  // ── Sign-up starts at the details: the poster already named the hostel ──
  await page.getByRole("link", { name: "Create my account" }).click();
  await expect(page.getByText("Create your account for Palm Court")).toBeVisible();
  await page.getByLabel("Full Name").fill("Ngozi Eze");
  await page.getByLabel("Email Address").fill("ngozi.eze@example.com");
  await page.getByLabel("Phone Number").fill("0803 555 0177");
  await page.getByLabel("Password", { exact: true }).fill("first-password");
  await page.getByLabel("Confirm Password").fill("first-password");
  const registerRequest = page.waitForRequest((request) => request.url().endsWith("/api/auth/register"));
  await page.getByRole("button", { name: "Create Account" }).click();
  expect((await registerRequest).postDataJSON()).toMatchObject({ hostel: "Palm Court" });

  await page.getByLabel("Verification Code").fill(VERIFICATION_CODE);
  await page.getByRole("button", { name: "Verify Email" }).click();

  // ── Back at the poster's page, signed in ───────────────────────────────
  await expect(page).toHaveURL(WELCOME_POSTER);
  await page.getByRole("button", { name: "Get my free code" }).click();
  await expect(page.getByText("Here is your welcome code")).toBeVisible();
  await expect(page.getByText(WELCOME_CODE)).toBeVisible();
  await expect(page.getByText(WELCOME_GIVES)).toBeVisible();
  await checkPage(page);

  // One claim was made, with the poster's token.
  const claims = (await api.state()).log.filter((entry) => entry.path === "/api/giveaways/claim");
  expect(claims.map((entry) => entry.body)).toEqual([{ token: "palm-court-poster-1" }]);

  // ── It stays on the Account page ───────────────────────────────────────
  await page.getByRole("link", { name: "Go to my account" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText("Your welcome code")).toBeVisible();
  await expect(page.getByText(WELCOME_CODE)).toBeVisible();
  await checkPage(page);
});

test("a resident who already claimed sees the same code again, and no second claim is made", async ({ page, api }) => {
  await api.scenario({ giveaway: "everyone" });
  await api.signIn("tunde");
  await page.goto(WELCOME_POSTER);
  await page.getByRole("button", { name: "Get my free code" }).click();
  await expect(page.getByText(WELCOME_CODE)).toBeVisible();

  await page.reload();

  await expect(page.getByText("Here is your welcome code")).toBeVisible();
  await expect(page.getByText(WELCOME_CODE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Get my free code" })).toHaveCount(0);
  expect((await api.state()).log.filter((entry) => entry.path === "/api/giveaways/claim")).toHaveLength(1);
});

test("an older account is told the codes are for new accounts, in the backend's words", async ({ page, api }) => {
  await api.scenario({ giveaway: "open" });
  await api.signIn("tunde");
  await page.goto(WELCOME_POSTER);

  await page.getByRole("button", { name: "Get my free code" }).click();

  await expect(alertOn(page)).toContainText("These welcome codes are for new accounts at Palm Court. Yours was made before they started.");
  await expect(page.getByText(WELCOME_CODE)).toHaveCount(0);
  await checkPage(page);
});

test("a resident of another hostel is refused, and one with an unconfirmed email is sent to confirm it", async ({ page, api }) => {
  await api.scenario({ giveaway: "everyone" });
  await api.signIn("amaka");
  await page.goto(WELCOME_POSTER);
  await page.getByRole("button", { name: "Get my free code" }).click();
  await expect(alertOn(page)).toContainText("These welcome codes are for residents of Palm Court. Your account belongs to Unity Lodge.");

  await api.signIn("kemi");
  await page.goto(WELCOME_POSTER);
  await page.getByRole("button", { name: "Get my free code" }).click();
  await expect(alertOn(page)).toContainText("Confirm your email first, then come back for your welcome code.");
  await expect(page.getByRole("link", { name: "Confirm my email" })).toHaveAttribute(
    "href",
    `/register?verify=1&redirect=${encodeURIComponent(WELCOME_POSTER)}`,
  );
  await checkPage(page);
});

test("a visitor with an account signs in from the poster, comes back to it and claims", async ({ page, api }) => {
  await api.scenario({ giveaway: "everyone" });
  await page.goto(WELCOME_POSTER);
  await expect(page.getByText("One code per person, for Palm Court residents. Ends 29 November.")).toBeVisible();

  await page.getByRole("link", { name: "I already have an account" }).click();
  await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(WELCOME_POSTER)}`);
  await page.getByLabel("Email Address").fill(CUSTOMERS.tunde.email);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(WELCOME_POSTER);
  await page.getByRole("button", { name: "Get my free code" }).click();
  await expect(page.getByText(WELCOME_CODE)).toBeVisible();
});

for (const { giveaway, title, message } of [
  { giveaway: "ended", title: "The welcome codes at Palm Court have ended", message: "You can still buy a plan for your hostel." },
  { giveaway: "out-of-codes", title: "All the welcome codes at Palm Court have been claimed", message: "You can still buy a plan for your hostel." },
  { giveaway: "none", title: "This poster is no longer in use", message: "Ask the Lodge Internet team at your hostel for the new poster." },
] as const) {
  test(`a poster whose giveaway is "${giveaway}" says so and offers no claim`, async ({ page, api }) => {
    await api.scenario({ giveaway });
    await page.goto(WELCOME_POSTER);

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole("link", { name: "Create my account" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Get my free code" })).toHaveCount(0);
    await checkPage(page);
  });
}

test("when the poster's page can't load, it says so and Try again loads it", async ({ page, api }) => {
  await api.scenario({ giveaway: "open", fail: [{ route: "GET /api/giveaways/poster/:token", status: 500, times: 1 }] });
  await page.goto(WELCOME_POSTER);

  await expect(page.getByText("Couldn’t load this page")).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Your first data code is free" })).toBeVisible();
});

test("an Account page with no welcome code shows no welcome-code section", async ({ page, api }) => {
  await api.scenario({ giveaway: "open" });
  await api.signIn("amaka");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByText("Your welcome code")).toHaveCount(0);
});

test("a resident who signs up at a switched-on hostel, with no poster, is given the code on landing on the Account page", async ({ page, api }) => {
  await api.scenario({ giveaway: "open", wallet: "new" });
  await page.goto("/register?hostel=Palm%20Court");

  await expect(page.getByText("Create your account for Palm Court")).toBeVisible();
  await page.getByLabel("Full Name").fill("Ngozi Eze");
  await page.getByLabel("Email Address").fill("ngozi.eze@example.com");
  await page.getByLabel("Phone Number").fill("0803 555 0177");
  await page.getByLabel("Password", { exact: true }).fill("first-password");
  await page.getByLabel("Confirm Password").fill("first-password");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.getByLabel("Verification Code").fill(VERIFICATION_CODE);
  await page.getByRole("button", { name: "Verify Email" }).click();

  // ── Landed: the code is in a sheet, nothing pressed ────────────────────
  await expect(page).toHaveURL("/dashboard");
  const sheet = page.getByRole("dialog", { name: "Your free welcome code" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(WELCOME_CODE)).toBeVisible();
  await expect(sheet.getByText(WELCOME_GIVES)).toBeVisible();
  await expect(sheet.getByText(/We've emailed it to you too/)).toBeVisible();
  await checkPage(page);

  // One claim, with no poster token.
  const claims = (await api.state()).log.filter((entry) => entry.path === "/api/giveaways/claim");
  expect(claims.map((entry) => entry.body)).toEqual([{}]);

  // ── Done: it stays on the page, and coming back opens no second sheet ──
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Your welcome code")).toBeVisible();
  await expect(page.getByText(WELCOME_CODE)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Your welcome code")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Your free welcome code" })).toHaveCount(0);
  await checkPage(page);
});

test("where everyone may claim, an older account gets a button on the Account page and the code when it is pressed", async ({ page, api }) => {
  await api.scenario({ giveaway: "everyone" });
  await api.signIn("tunde");
  await page.goto("/dashboard");

  await expect(page.getByText("A free welcome code")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Your free welcome code" })).toHaveCount(0);
  await checkPage(page);

  await page.getByRole("button", { name: "Get my free code" }).click();

  const sheet = page.getByRole("dialog", { name: "Your free welcome code" });
  await expect(sheet.getByText(WELCOME_CODE)).toBeVisible();
  await checkPage(page);
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Your welcome code")).toBeVisible();
});

test("an older account at a hostel giving to new accounts only is shown nothing about welcome codes", async ({ page, api }) => {
  await api.scenario({ giveaway: "open" });
  await api.signIn("tunde");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByText(/welcome code/i)).toHaveCount(0);
});

