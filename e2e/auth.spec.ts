/**
 * Signing up and signing in: create an account with the 6-digit email code,
 * sign in, a wrong password, an unconfirmed email, the forgot-password
 * steps, and signing out.
 *
 * The stand-in "emails" fixed codes (e2e/fixtures/customers.json): one for
 * confirming an email, one for resetting a password.
 */
import { checkPage } from "./support/checks";
import { CUSTOMERS, CUSTOMER_PASSWORD, RESET_CODE, VERIFICATION_CODE } from "./support/data";
import { alertOn } from "./support/locators";
import { expect, test } from "./support/test";

test("register: choose a hostel, fill in details, confirm the email code, land on the account", async ({ page, api }) => {
  await api.scenario({ wallet: "new" });
  await page.goto("/register");

  // ── Step 1: hostel ─────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1, name: "Select Your Hostel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Palm Court" })).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: "Palm Court" }).click();

  // ── Step 2: details ────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
  await expect(page.getByText("Create your account for Palm Court")).toBeVisible();
  await page.getByLabel("Full Name").fill("Adaeze Nwosu");
  await page.getByLabel("Email Address").fill("Adaeze.Nwosu@example.com");
  await page.getByLabel("Phone Number").fill("0803 555 0142");
  await page.getByLabel("Password", { exact: true }).fill("first-password");
  await page.getByLabel("Confirm Password").fill("first-passwor");
  await expect(page.getByText("Passwords don't match yet.")).toBeVisible();
  await page.getByLabel("Confirm Password").fill("first-password");
  await expect(page.getByText("Passwords match.")).toBeVisible();
  await checkPage(page);

  const registerRequest = page.waitForRequest((request) => request.url().endsWith("/api/auth/register"));
  await page.getByRole("button", { name: "Create Account" }).click();
  // The profile is sent with the email in lower case and the chosen hostel.
  expect((await registerRequest).postDataJSON()).toMatchObject({
    email: "adaeze.nwosu@example.com",
    hostel: "Palm Court",
    displayName: "Adaeze Nwosu",
    phone: "0803 555 0142",
  });

  // ── Step 3: the 6-digit code ───────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1, name: "Verify Email" })).toBeVisible();
  // The page repeats the address as typed; what was sent (above) is lower case.
  await expect(page.getByText("Enter the 6-digit code sent to Adaeze.Nwosu@example.com")).toBeVisible();
  const verify = page.getByRole("button", { name: "Verify Email" });
  await expect(verify).toBeDisabled();
  await checkPage(page);

  // Letters are dropped, a wrong code is refused, the right one goes through.
  await page.getByLabel("Verification Code").fill("12ab34");
  await expect(page.getByLabel("Verification Code")).toHaveValue("1234");
  await page.getByLabel("Verification Code").fill("000000");
  await verify.click();
  await expect(alertOn(page)).toContainText("That code isn't right");

  await page.getByLabel("Verification Code").fill(VERIFICATION_CODE);
  await verify.click();
  await expect(page.getByRole("heading", { name: "Account Verified!" })).toBeVisible();
  await checkPage(page);

  // ── Signed in, on a new customer's account page ────────────────────────
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByText("Adaeze Nwosu", { exact: true })).toBeVisible();
  await expect(page.getByText("No purchases yet")).toBeVisible();
  await expect(page.getByRole("link", { name: /Palm Court.*Buy more plans/ })).toHaveAttribute("href", "/palm-grove/palm-court/plans");
});

test("register: where a school exists, a hostel outside any school can still be picked", async ({ page, api }) => {
  // Lakeside University has one college and one hostel; the other eight
  // hostels belong to no school. They used to be out of reach on this page.
  await api.scenario({ directory: "with-school" });
  await page.goto("/register");

  await expect(page.getByRole("button", { name: "Lakeside University" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not in a school? Choose your hostel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Riverside Lodge" })).toBeVisible();
  // A hostel inside the school is reached through its school, not listed here.
  await expect(page.getByRole("button", { name: "Newton Hall" })).toHaveCount(0);
  await checkPage(page);

  await page.getByRole("button", { name: "Palm Court" }).click();
  await expect(page.getByText("Create your account for Palm Court")).toBeVisible();

  // The school's own path still works: school, college, hostel.
  await page.getByRole("button", { name: "Change Hostel" }).click();
  await page.getByRole("button", { name: "Lakeside University" }).click();
  await page.getByRole("button", { name: "College of Science" }).click();
  await checkPage(page);
  await page.getByRole("button", { name: "Newton Hall" }).click();
  await expect(page.getByText("Create your account for Newton Hall")).toBeVisible();
});

test("register: an email that already has a confirmed account is told to sign in", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Unity Lodge" }).click();
  await page.getByLabel("Full Name").fill("Chiamaka Okafor");
  await page.getByLabel("Email Address").fill(CUSTOMERS.amaka.email);
  await page.getByLabel("Phone Number").fill("08031234567");
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByLabel("Confirm Password").fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(alertOn(page)).toContainText("This account is already verified. Please sign in instead.");
  await checkPage(page);
});

test("register: details the form can check are refused before anything is sent", async ({ page, api }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Unity Lodge" }).click();
  await page.getByLabel("Full Name").fill("Ife Ade");
  await page.getByLabel("Email Address").fill("ife.ade@example.com");
  await page.getByLabel("Phone Number").fill("12345");
  await page.getByLabel("Password", { exact: true }).fill("long-enough");
  await page.getByLabel("Confirm Password").fill("long-enough");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(alertOn(page)).toContainText("Enter a Nigerian mobile number");
  expect((await api.state()).log.filter((entry) => entry.path === "/api/auth/signup")).toHaveLength(0);

  // "Change Hostel" goes back a step without losing the page.
  await page.getByRole("button", { name: "Change Hostel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Select Your Hostel" })).toBeVisible();
});

test("sign in: the right password opens the account, and the top bar knows who you are", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await checkPage(page);

  await page.getByLabel("Email Address").fill(` ${CUSTOMERS.amaka.email.toUpperCase()} `);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  // The eye shows what was typed, for a customer on a small keyboard.
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText(CUSTOMERS.amaka.displayName, { exact: true })).toBeVisible();

  const menu = page.getByRole("button", { name: "Your account menu" });
  await menu.click();
  await expect(page.getByRole("menu", { name: "Account" })).toContainText(CUSTOMERS.amaka.email);
  await checkPage(page);
});

test("sign in: a wrong password says so and stays on the page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email Address").fill(CUSTOMERS.amaka.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(alertOn(page)).toHaveText("No account found with these credentials.");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
  await checkPage(page);
});

test("sign in: an account whose email was never confirmed is sent to enter the code", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email Address").fill(CUSTOMERS.kemi.email);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/register\?email=kemi\.balogun%40example\.com&verify=1/);
  await expect(page.getByRole("heading", { level: 1, name: "Verify Email" })).toBeVisible();

  await page.getByLabel("Verification Code").fill(VERIFICATION_CODE);
  await page.getByRole("button", { name: "Verify Email" }).click();
  await expect(page).toHaveURL("/dashboard");
});

test("forgot password: email, code, new password, then sign in with it", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();

  // ── Step 1: email ──────────────────────────────────────────────────────
  await expect(page).toHaveURL("/forgot-password");
  await expect(page.getByRole("heading", { level: 1, name: "Forgot Password" })).toBeVisible();
  await checkPage(page);
  await page.getByLabel("Email Address").fill(CUSTOMERS.tunde.email);
  await page.getByRole("button", { name: "Send Reset Code" }).click();

  // ── Step 2: code ───────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1, name: "Enter Reset Code" })).toBeVisible();
  await expect(page.getByText(`Enter the 6-digit code sent to ${CUSTOMERS.tunde.email}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await checkPage(page);
  await page.getByLabel("Verification Code").fill(RESET_CODE);
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Step 3: new password ───────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1, name: "Set New Password" })).toBeVisible();
  await page.getByLabel("New Password").fill("brand-new-pass");
  await page.getByLabel("Confirm Password").fill("brand-new-pas");
  await page.getByRole("button", { name: "Reset Password" }).click();
  await expect(alertOn(page)).toHaveText("Passwords do not match");
  await checkPage(page);

  await page.getByLabel("Confirm Password").fill("brand-new-pass");
  await page.getByRole("button", { name: "Reset Password" }).click();
  await expect(page.getByRole("heading", { name: "Password Updated!" })).toBeVisible();

  // ── Back at sign-in: the old password is dead, the new one works ───────
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email Address").fill(CUSTOMERS.tunde.email);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(alertOn(page)).toHaveText("No account found with these credentials.");

  await page.getByLabel("Password", { exact: true }).fill("brand-new-pass");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/dashboard");
});

test("forgot password: a wrong code is refused when the new password is sent", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email Address").fill(CUSTOMERS.tunde.email);
  await page.getByRole("button", { name: "Send Reset Code" }).click();
  await page.getByLabel("Verification Code").fill("999999");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("New Password").fill("brand-new-pass");
  await page.getByLabel("Confirm Password").fill("brand-new-pass");
  await page.getByRole("button", { name: "Reset Password" }).click();

  await expect(alertOn(page)).toContainText("That code isn't right");
  await expect(page.getByRole("heading", { level: 1, name: "Set New Password" })).toBeVisible();
});

test("forgot password: an account that never confirmed its email is told to finish that first", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email Address").fill(CUSTOMERS.kemi.email);
  await page.getByRole("button", { name: "Send Reset Code" }).click();

  await expect(alertOn(page)).toContainText("This account hasn't been verified yet.");
  await expect(page.getByRole("heading", { level: 1, name: "Forgot Password" })).toBeVisible();
});

test("sign out from the account page, and from the menu in the top bar", async ({ page, api }) => {
  await api.signIn("amaka");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign Out" }).click();

  // Home again, signed out: the top bar offers Sign in, and the account page
  // sends a visitor to sign in.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login");

  // The same from the menu.
  await api.signIn("amaka");
  await page.goto("/support");
  await page.getByRole("button", { name: "Your account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Account" })).toHaveAttribute("href", "/login");
});

test.describe("the one-time welcome", () => {
  test.use({ welcomeSheet: true });

  test("a signed-in customer meets the wallet once, and is taken to it", async ({ page, api }) => {
    await api.scenario({ wallet: "funded" });
    await api.signIn("amaka");
    await page.goto("/support");

    const welcome = page.getByRole("dialog", { name: "Meet your Lodge Wallet" });
    await expect(welcome.getByRole("heading", { name: "Paying just got easier" })).toBeVisible();
    await checkPage(page);
    await welcome.getByRole("button", { name: "Set up my wallet" }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible();

    // Seen once: it does not come back on the next page.
    await page.goto("/support");
    await expect(page.getByRole("heading", { level: 1, name: "Support" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("lodge:welcome-seen:v2-wallet"))).toBe("1");
    await expect(welcome).toHaveCount(0);
  });
});
