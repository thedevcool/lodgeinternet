/**
 * States (engineering standard F4): every data view has a loading state that
 * is a skeleton and not a blank screen, an empty state, and an error state
 * with a way to try again.
 *
 * The stand-in API is made to hold an answer (loading), return nothing
 * (empty), answer 500 or cut the connection (error). Covered here: the plans
 * page, the hostel list and home, the dashboard, and the blog review desk.
 * The blog's own list is written on the server: see server-states.spec.ts.
 * The dashboard's empty state (a new customer) is in dashboard.spec.ts.
 *
 * The plans page and the dashboard used to have no error state: a failed
 * load read as "nothing here" ("No plans available", "No purchases yet").
 */
import { checkPage } from "./support/checks";
import { planCard, planCards } from "./support/checkout";
import { UNITY_LODGE_PLANS, plan } from "./support/data";
import { expect, test } from "./support/test";

const HOSTELS = "GET /api/hostels";
const PLANS = "GET /api/data-plans";
const ACCOUNT = "GET /api/auth/user";
const REVIEW_DESK = "GET /api/admin/blog";

// ── Plans page ──────────────────────────────────────────────────────────────

test("plans: a skeleton shows while the plans load, then the plans", async ({ page, api }) => {
  await api.scenario({ hold: [PLANS] });
  await page.goto(UNITY_LODGE_PLANS);

  // The hostel's name is already there; the list is a skeleton, not a gap.
  await expect(page.getByRole("heading", { level: 1, name: "Unity Lodge" })).toBeVisible();
  await expect(page.getByLabel("Loading plans…")).toBeVisible();
  await expect(page.getByText("Loading plans…")).toBeVisible();
  await expect(planCards(page)).toHaveCount(0);
  await checkPage(page);

  await api.release();
  await expect(planCard(page, plan("20gb-monthly").name)).toBeVisible();
  await expect(page.getByLabel("Loading plans…")).toHaveCount(0);
});

test("plans: while the hostel itself is still being looked up, the whole page is a skeleton", async ({ page, api }) => {
  await api.scenario({ hold: [HOSTELS] });
  await page.goto(UNITY_LODGE_PLANS);

  await expect(page.getByLabel("Loading plans…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await api.release();
  await expect(page.getByRole("heading", { level: 1, name: "Unity Lodge" })).toBeVisible();
});

test("plans: a hostel with nothing to sell says so on every tab", async ({ page, api }) => {
  await api.scenario({ plans: "empty" });
  await page.goto(UNITY_LODGE_PLANS);

  await expect(page.getByText("No plans available for 3 devices at the moment.")).toBeVisible();
  await expect(page.getByText("Check another tab, or ask us on WhatsApp.")).toBeVisible();
  await checkPage(page);

  await page.getByRole("tab", { name: "Unlimited" }).click();
  await expect(page.getByText("No unlimited plans available at the moment.")).toBeVisible();
  await page.getByRole("tab", { name: "TV" }).click();
  await expect(page.getByText("No TV plans available at the moment.")).toBeVisible();
});

for (const failure of [
  { name: "the server answers 500", fail: { route: PLANS, status: 500 } },
  { name: "the connection drops", fail: { route: PLANS, drop: true } },
]) {
  test(`plans: when ${failure.name}, the page says the plans couldn't load and offers to try again`, async ({ page, api }) => {
    await api.scenario({ fail: [failure.fail] });
    await page.goto(UNITY_LODGE_PLANS);
    await expect(page.getByRole("heading", { level: 1, name: "Unity Lodge" })).toBeVisible();

    // Not "No plans available": the hostel has plans, we just couldn't fetch them.
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible({ timeout: 4_000 });
    await expect(page.getByText("Couldn’t load the plans")).toBeVisible();
    await expect(page.getByText("No plans available for 3 devices at the moment.")).toHaveCount(0);
    await checkPage(page);

    // The backend is back: one tap recovers, no reload needed.
    await api.scenario();
    await retry.click();
    await expect(planCard(page, plan("20gb-monthly").name)).toBeVisible();
    await expect(page.getByText("Couldn’t load the plans")).toHaveCount(0);
  });
}

// ── Hostel list and home ────────────────────────────────────────────────────

test("hostels: a skeleton shows while the list loads, then the list", async ({ page, api }) => {
  await api.scenario({ hold: [HOSTELS] });
  await page.goto("/hostels");

  await expect(page.getByRole("heading", { level: 1, name: "Select your hostel" })).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search for your hostel")).toHaveCount(0);
  await checkPage(page);

  await api.release();
  await expect(page.getByRole("link", { name: /Unity Lodge/ })).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true })).toHaveCount(0);
});

for (const failure of [
  { name: "the server answers 500", fail: { route: HOSTELS, status: 500 } },
  { name: "the connection drops", fail: { route: HOSTELS, drop: true } },
]) {
  test(`hostels: when ${failure.name}, the error state's Try again loads the list`, async ({ page, api }) => {
    await api.scenario({ fail: [failure.fail] });
    await page.goto("/hostels");

    await expect(page.getByText("Couldn’t load this page")).toBeVisible();
    await expect(page.getByText("Check your connection and try again.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Unity Lodge/ })).toHaveCount(0);
    await checkPage(page);

    // The backend is back: one tap recovers, no reload needed.
    await api.scenario();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("link", { name: /Unity Lodge/ })).toBeVisible();
    await expect(page.getByText("Couldn’t load this page")).toHaveCount(0);
  });
}

test("hostels: with no hostels at all, the list, home and sign-up each say so", async ({ page, api }) => {
  await api.scenario({ directory: "empty" });

  // Not "No hostels match": nobody searched. And nothing to filter or search.
  await page.goto("/hostels");
  await expect(page.getByText("No hostels available yet")).toBeVisible();
  await expect(page.getByText("No hostels match")).toHaveCount(0);
  await expect(page.getByLabel("Search for your hostel")).toHaveCount(0);
  await checkPage(page);

  await page.goto("/");
  await expect(page.getByText("No hostels available yet")).toBeVisible();
  await checkPage(page);

  await page.goto("/register");
  await expect(page.getByText("No hostels available", { exact: true })).toBeVisible();
  await checkPage(page);
});

test("home: skeleton while loading, an error with Try again when the directory is down", async ({ page, api }) => {
  await api.scenario({ hold: [HOSTELS] });
  await page.goto("/");
  await expect(page.getByLabel("Loading", { exact: true })).toBeVisible();
  // The headline is on screen at once: only the list waits.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reliable Internet & TV.");
  await api.release();
  await expect(page.getByRole("link", { name: /Unity Estate/ })).toBeVisible();

  await api.scenario({ fail: [{ route: HOSTELS, status: 500 }] });
  await page.goto("/");
  await expect(page.getByText("Couldn’t load this page")).toBeVisible();
  await checkPage(page);
  await api.scenario();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: /Unity Estate/ })).toBeVisible();
});

test("a location page: an error with Try again when the directory is down", async ({ page, api }) => {
  await api.scenario({ fail: [{ route: HOSTELS, drop: true }] });
  await page.goto("/unity-estate");
  await expect(page.getByText("Couldn’t load this page")).toBeVisible();

  await api.scenario();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Unity Estate" })).toBeVisible();
});

// ── Dashboard ───────────────────────────────────────────────────────────────

test("dashboard: a skeleton shows while the account loads", async ({ page, api }) => {
  await api.scenario({ hold: [ACCOUNT] });
  await api.signIn("amaka");
  await page.goto("/dashboard");

  await expect(page.getByText("Loading your dashboard...")).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No purchases yet")).toHaveCount(0);
  await checkPage(page);

  await api.release();
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByText("Chiamaka Okafor", { exact: true })).toBeVisible();
});

for (const failure of [
  { name: "the server answers 500", fail: { route: ACCOUNT, status: 500 } },
  { name: "the connection drops", fail: { route: ACCOUNT, drop: true } },
]) {
  test(`dashboard: when ${failure.name}, the page says the account couldn't load and offers to try again`, async ({ page, api }) => {
    await api.scenario({ fail: [failure.fail] });
    await api.signIn("amaka");
    await page.goto("/dashboard");

    // Amaka has three purchases. A failed load must not tell her she has none.
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible({ timeout: 4_000 });
    await expect(page.getByText("Couldn’t load your account")).toBeVisible();
    await expect(page.getByText("No purchases yet")).toHaveCount(0);
    await checkPage(page);

    await api.scenario();
    await retry.click();
    await expect(page.getByText("Chiamaka Okafor", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show code" })).toHaveCount(2);
  });
}

// ── Blog review desk ────────────────────────────────────────────────────────

test("review desk: skeleton while loading, an error with Try again when the list fails", async ({ page, api }) => {
  await api.scenario({ hold: [REVIEW_DESK] });
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin");
  await expect(page.getByLabel("Loading", { exact: true })).toBeVisible();
  await checkPage(page);
  await api.release();
  await expect(page.getByRole("button", { name: "To review · 3" })).toBeVisible();

  await api.scenario({ fail: [{ route: REVIEW_DESK, status: 500 }] });
  await page.goto("/blog/admin");
  await expect(page.getByText("The review list didn't load. Check your connection and try again.")).toBeVisible();
  await checkPage(page);
  await api.scenario();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "To review · 3" })).toBeVisible();
});

test("review desk: a tab with nothing in it says so", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin/our-first-year");
  // Edit the one rejected post and publish it: Rejected is then empty.
  await page.getByRole("tab", { name: "Edit" }).click();
  await page.getByLabel("Summary").fill("What we built in our first year, and what comes next.");
  await page.getByRole("button", { name: "Save and preview" }).click();
  await page.getByRole("button", { name: "Publish with my edits" }).click();

  await expect(page).toHaveURL("/blog/admin");
  await page.getByRole("button", { name: "Rejected · 0" }).click();
  await expect(page.getByText("Nothing rejected")).toBeVisible();
  await checkPage(page);
});
