/**
 * The smaller pages: legal, support, the waitlist, settings (the theme
 * switch), the maintenance lockdown and the not-found page.
 */
import legal from "./fixtures/legal.json";
import { checkPage } from "./support/checks";
import { alertOn } from "./support/locators";
import { expect, test } from "./support/test";

// ── Legal ───────────────────────────────────────────────────────────────────

test("legal: the index lists every document, and each opens with its dates", async ({ page }) => {
  await page.goto("/legal");
  await expect(page.getByRole("heading", { level: 1, name: "Legal" })).toBeVisible();

  const documents = page.getByRole("main").getByRole("listitem");
  await expect(documents).toHaveCount(legal.documents.length);
  await expect(documents.first()).toContainText("Terms of Service");
  await expect(documents.first()).toContainText("The agreement between you and Lodge Internet when you buy a plan.");
  await expect(documents.first()).toContainText("Updated 23 October 2026");
  await checkPage(page);

  await page.getByRole("main").getByRole("link", { name: /Privacy Policy/ }).click();
  await expect(page).toHaveURL("/legal/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  // Only the privacy policy carries a version and an effective date.
  await expect(page.getByText("Version 2.1 · Effective 1 November 2026 · Last updated 1 November 2026")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "1. What we collect" })).toBeVisible();
  await expect(page.getByRole("article").getByRole("listitem").filter({ hasText: "Purchases you make." })).toBeVisible();
  await expect(page).toHaveTitle("Privacy Policy · Lodge Internet");
  await checkPage(page);

  // The other documents are one tap away, from the page's own list.
  await page.getByRole("navigation", { name: "Legal pages" }).getByRole("link", { name: "Terms of Service" }).click();
  await expect(page).toHaveURL("/legal/terms");
  await expect(page.getByText("Last updated 23 October 2026")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Your account" })).toBeVisible();
});

test("legal: the short addresses redirect, and an unknown document is a 404", async ({ page }) => {
  // /privacy, /terms and /refunds are the addresses the app stores and Meta expect.
  await page.goto("/privacy");
  await expect(page).toHaveURL("/legal/privacy");
  await page.goto("/refunds");
  await expect(page).toHaveURL("/legal/refunds");
  await expect(page.getByRole("heading", { level: 1, name: "Refund & Wallet Policy" })).toBeVisible();

  const response = await page.goto("/legal/no-such-document");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page isn’t available" })).toBeVisible();
});

test("legal: every footer link opens a real document", async ({ page }) => {
  await page.goto("/support");
  const links = page.getByRole("contentinfo").getByRole("link");
  for (const document of legal.documents) {
    await expect(links.filter({ hasText: document.title })).toHaveAttribute("href", `/legal/${document.slug}`);
    expect((await page.request.get(`/legal/${document.slug}`)).status(), `/legal/${document.slug}`).toBe(200);
  }
});

// ── Support ─────────────────────────────────────────────────────────────────

test("support: questions open and close, and help is one tap away on WhatsApp", async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByRole("heading", { level: 1, name: "Support" })).toBeVisible();

  // The first answer is open to begin with; the others open on a tap.
  const first = page.getByRole("button", { name: "How do I connect to the internet?" });
  const renew = page.getByRole("button", { name: "How do I renew my plan?" });
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(renew).toHaveAttribute("aria-expanded", "false");
  await renew.click();
  await expect(renew).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Go to your hostel and select the plan you want to renew.")).toBeVisible();
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");

  const whatsapp = page.getByRole("link", { name: /Chat on WhatsApp/ });
  await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/2348030000000\?text=/);
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: /Chat with/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+$/);
  await checkPage(page);

  // The tab bar marks where you are.
  await expect(page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Support" })).toHaveAttribute("aria-current", "page");
});

// ── Waitlist ────────────────────────────────────────────────────────────────

test("waitlist: a student answers every step and joins", async ({ page }) => {
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Do you want to enjoy fast internet");
  await checkPage(page);
  await page.getByRole("button", { name: "Get on the Waitlist" }).click();

  await page.getByLabel("Email address").fill("not-an-email@nowhere");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(alertOn(page)).toHaveText("Please enter a valid email address");
  await page.getByLabel("Email address").fill("Zainab.Bello@Example.com");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Where are you joining from?" })).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: /Student \(Hostel\)/ }).click();

  await page.getByLabel("School name").fill("Lakeside University");
  await page.getByLabel("Hostel name").fill("Garden Court");
  await page.getByLabel("School address").fill("Ado-Ekiti");
  await page.getByLabel("How many people live in your hostel?").fill("120");
  await checkPage(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Our pricing" })).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: /Yes, I can afford it/ }).click();

  await page.getByLabel("WhatsApp number").fill("12345");
  await page.getByRole("button", { name: "Join the Waitlist" }).click();
  await expect(alertOn(page)).toContainText("That doesn't look like a Nigerian WhatsApp number.");

  await page.getByLabel("WhatsApp number").fill("0801 234 5678");
  const sent = page.waitForRequest((request) => request.url().endsWith("/api/waitlist"));
  await page.getByRole("button", { name: "Join the Waitlist" }).click();
  expect((await sent).postDataJSON()).toEqual({
    email: "zainab.bello@example.com",
    audienceType: "student",
    affordability: "yes",
    whatsappPhone: "0801 234 5678",
    schoolName: "Lakeside University",
    hostelName: "Garden Court",
    schoolAddress: "Ado-Ekiti",
    hostelOccupants: 120,
  });

  await expect(page.getByRole("heading", { name: "You're on the list!" })).toBeVisible();
  await expect(page.getByText("hostelmates")).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("waitlist: a resident's answers are kept when the server fails, and Back steps back", async ({ page, api }) => {
  await api.scenario({ fail: [{ route: "POST /api/waitlist", status: 500, times: 1 }] });
  await page.goto("/waitlist");
  await page.getByRole("button", { name: "Get on the Waitlist" }).click();
  await page.getByLabel("Email address").fill("emeka.obi@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Resident \(Home\)/ }).click();

  await page.getByLabel("Address").fill("14 Marina Road");
  await page.getByLabel("Estate name").fill("Harbour Estate");
  await page.getByLabel("City").fill("Lagos");
  await page.getByRole("button", { name: "Continue" }).click();

  // Back from pricing returns to the details, still filled in.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Estate name")).toHaveValue("Harbour Estate");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /I can manage/ }).click();

  await page.getByLabel("WhatsApp number").fill("08012345678");
  await page.getByRole("button", { name: "Join the Waitlist" }).click();
  await expect(alertOn(page)).toContainText("Something went wrong on our side. Please try again.");

  // Trying again works, with nothing retyped.
  await page.getByRole("button", { name: "Join the Waitlist" }).click();
  await expect(page.getByRole("heading", { name: "You're on the list!" })).toBeVisible();
  await expect(page.getByText("neighbours")).toBeVisible();
});

// ── Settings ────────────────────────────────────────────────────────────────

test("settings: the theme switch applies at once, is remembered, and is applied before the page paints", async ({ page, api }) => {
  await api.signIn("amaka");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  // Nothing that isn't live is advertised (standard P7): the "Lodge app,
  // coming soon" card that used to sit here is gone.
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  await expect(page.getByText("Lodge for iPhone and Android")).toHaveCount(0);
  await checkPage(page);

  const html = page.locator("html");
  const appearance = page.getByRole("main").getByRole("radiogroup", { name: "Appearance" });
  await expect(appearance.getByRole("radio", { name: "System" })).toBeChecked();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);

  // Dark: the page's own background turns black, straight away.
  await appearance.getByRole("radio", { name: "Dark" }).click();
  await expect(appearance.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  expect(await page.evaluate(() => localStorage.getItem("lodge:theme"))).toBe("dark");
  await checkPage(page);

  // Reload with every script file refused. Only the small script written
  // into the page itself can run, so if the page is dark now, the choice was
  // applied before anything painted (and the security policy let it run).
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.unroute("**/_next/static/**/*.js");

  // Light is remembered the same way; System forgets the choice.
  await page.reload();
  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 245, 247)");
  await appearance.getByRole("radio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  expect(await page.evaluate(() => localStorage.getItem("lodge:theme"))).toBeNull();
});

test("settings: the wallet design chosen here is the one on the account page", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto("/settings");

  const designs = page.getByRole("radiogroup", { name: "Wallet design" });
  await expect(designs.getByRole("radio", { name: /Classic/ })).toBeChecked();
  await designs.getByRole("radio", { name: /Ocean/ }).click();
  await expect(designs.getByRole("radio", { name: /Ocean/ })).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("lodge:wallet-design"))).toBe("ocean");
  await checkPage(page);

  // The coloured card must stay readable: the checks run on it too.
  await page.getByRole("link", { name: "Account" }).first().click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible();
  await checkPage(page);
});

test("settings: a visitor who isn't signed in is sent to sign in, and brought back", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL("/login?redirect=/settings");
});

// ── Maintenance ─────────────────────────────────────────────────────────────

test("maintenance: during a lockdown every page leads to the notice, with the admin's message", async ({ page, api }) => {
  await api.scenario({ maintenance: true });
  await page.goto("/hostels");

  await expect(page).toHaveURL("/maintenance");
  await expect(page.getByRole("heading", { level: 1, name: "Site Temporarily Unavailable" })).toBeVisible();
  await expect(page.getByText("We are upgrading the network tonight. Back by 6 am.")).toBeVisible();
  // No way out that would only bounce back here.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Tabs" })).toHaveCount(0);
  await checkPage(page);

  // Lockdown lifted: the site's pages open again.
  await api.scenario({ maintenance: false });
  await page.goto("/hostels");
  await expect(page).toHaveURL("/hostels");
  await expect(page.getByRole("heading", { level: 1, name: "Select your hostel" })).toBeVisible();
});

test("maintenance: once the lockdown is lifted, Check again brings the site back", async ({ page, api }) => {
  await api.scenario({ maintenance: true });
  await page.goto("/");
  await expect(page).toHaveURL("/maintenance");
  // The notice has asked once and been told "locked" (it shows the admin's
  // message). Waiting for that keeps the test about the button: a notice
  // still asking when the lockdown ends goes home by itself.
  await expect(page.getByText("We are upgrading the network tonight. Back by 6 am.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check again" })).toBeEnabled();

  // The customer is still on the notice when the lockdown ends, with one
  // button and no other way off the page.
  await api.scenario({ maintenance: false });
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page).toHaveURL("/", { timeout: 4_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Site Temporarily Unavailable" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reliable Internet & TV.");
});

test("maintenance: while the lockdown lasts, Check again stays on the notice", async ({ page, api }) => {
  await api.scenario({ maintenance: true });
  await page.goto("/maintenance");
  await expect(page.getByText("We are upgrading the network tonight. Back by 6 am.")).toBeVisible();

  const asked = page.waitForResponse((response) => response.url().endsWith("/api/service-status"));
  await page.getByRole("button", { name: "Check again" }).click();
  await asked;
  await expect(page).toHaveURL("/maintenance");
  await expect(page.getByRole("heading", { level: 1, name: "Site Temporarily Unavailable" })).toBeVisible();
});

// ── Not found ───────────────────────────────────────────────────────────────

test("not found: an address that is nothing gets a 404 page with two ways on", async ({ page }) => {
  const response = await page.goto("/this/page/does/not/exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page isn’t available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find your hostel" })).toHaveAttribute("href", "/hostels");
  await checkPage(page);

  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reliable Internet & TV.");
});
