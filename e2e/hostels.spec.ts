/**
 * Finding a hostel: the full list grouped by location, search and the
 * location chips, a location's own page, schools and colleges, and the
 * hostel lock (a signed-in customer belongs to one hostel and is only ever
 * shown that one).
 *
 * The directory is e2e/fixtures/directory.json. "UNITY ESTATE" is stored in
 * capitals there and must read "Unity Estate" on screen.
 */
import { checkPage } from "./support/checks";
import { PALM_COURT_PLANS, UNITY_LODGE_PLANS } from "./support/data";
import { expect, test } from "./support/test";

test("the hostel list is grouped by location, with standalone hostels last", async ({ page }) => {
  await page.goto("/hostels");
  await expect(page.getByRole("heading", { level: 1, name: "Select your hostel" })).toBeVisible();

  // Locations in alphabetical order, then the hostels with no location.
  // Cedar Heights has no hostels yet, so it isn't a group.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Palm Grove", "Unity Estate", "Other hostels"]);

  const unity = page.getByRole("region", { name: "Unity Estate" });
  await expect(unity.getByText("5 active hostels")).toBeVisible();
  await expect(unity.getByRole("link").filter({ hasText: "Unity Estate" })).toHaveCount(6); // the heading link + 5 rows
  await expect(unity.getByRole("link", { name: /Unity Lodge/ })).toHaveAttribute("href", UNITY_LODGE_PLANS);

  const other = page.getByRole("region", { name: "Other hostels" });
  await expect(other.getByText("1 active hostel", { exact: true })).toBeVisible();
  await expect(other.getByRole("link", { name: /Riverside Lodge/ })).toHaveAttribute("href", "/riverside-lodge/plans");
  await checkPage(page);
});

test("search narrows the list by hostel or location name, and says when nothing matches", async ({ page }) => {
  await page.goto("/hostels");
  const search = page.getByLabel("Search for your hostel");

  await search.fill("coco");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Palm Grove"]);
  await expect(page.getByRole("link", { name: /Coconut Hall/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Palm Court/ })).toHaveCount(0);

  // A location's name brings up everything in it.
  await search.fill("palm gr");
  await expect(page.getByRole("link", { name: /Palm Court/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Coconut Hall/ })).toBeVisible();

  await search.fill("zzz");
  await expect(page.getByText("No hostels match")).toBeVisible();
  await checkPage(page);

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
});

test("a location chip shows only that location", async ({ page }) => {
  await page.goto("/hostels");
  await page.getByRole("button", { name: "Unity Estate", exact: true }).click();

  await expect(page.getByRole("button", { name: "Unity Estate", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Unity Estate"]);
  await checkPage(page);

  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
});

test("a location page lists its hostels, searches within them and leads to plans", async ({ page }) => {
  await page.goto("/hostels");
  await page.getByRole("heading", { level: 2, name: "Unity Estate" }).getByRole("link").click();

  await expect(page).toHaveURL("/unity-estate");
  await expect(page.getByRole("heading", { level: 1, name: "Unity Estate" })).toBeVisible();
  await expect(page.getByText("5 hostels", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Properties");
  await checkPage(page);

  // Five hostels is enough for the in-location search to appear.
  await page.getByLabel("Search your hostel").fill("villa");
  await expect(page.getByRole("link", { name: /Sunrise Villa/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Unity Lodge/ })).toHaveCount(0);
  await page.getByLabel("Search your hostel").fill("nowhere");
  await expect(page.getByText("No hostel called “nowhere”")).toBeVisible();
  await page.getByLabel("Search your hostel").fill("");

  await page.getByRole("link", { name: /Unity Lodge/ }).click();
  await expect(page).toHaveURL(UNITY_LODGE_PLANS);
  await expect(page.getByRole("heading", { level: 1, name: "Unity Lodge" })).toBeVisible();
});

test("home lists only places with a hostel to buy from: no 'Coming soon'", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Unity Estate.*5 hostels/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Palm Grove.*2 hostels/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Riverside Lodge/ })).toBeVisible();

  // Cedar Heights has no hostels yet (standard P7: what isn't live doesn't appear).
  await expect(page.getByText("Cedar Heights")).toHaveCount(0);
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  await checkPage(page);

  // Searching for it finds nothing either.
  await page.getByLabel("Search locations or hostels").fill("cedar");
  await expect(page.getByText("No results for “cedar”")).toBeVisible();
  await expect(page.getByRole("link", { name: /Cedar Heights/ })).toHaveCount(0);
});

test("a location with no hostels yet says so; a small one has no search box", async ({ page }) => {
  await page.goto("/cedar-heights");
  await expect(page.getByRole("heading", { level: 1, name: "Cedar Heights" })).toBeVisible();
  await expect(page.getByText("No hostels in this location yet.")).toBeVisible();
  await checkPage(page);

  await page.goto("/palm-grove");
  await expect(page.getByRole("link", { name: /Palm Court/ })).toBeVisible();
  await expect(page.getByLabel("Search your hostel")).toHaveCount(0);
});

test("old and unknown addresses still land somewhere useful", async ({ page }) => {
  // A hostel with no location: its short address goes to its plans.
  await page.goto("/riverside-lodge");
  await expect(page).toHaveURL("/riverside-lodge/plans");
  await expect(page.getByRole("heading", { level: 1, name: "Riverside Lodge" })).toBeVisible();

  // A name that is nothing at all goes home.
  await page.goto("/no-such-place");
  await expect(page).toHaveURL("/");
  await page.goto("/unity-estate/no-such-hostel/plans");
  await expect(page).toHaveURL("/");
});

test("a school lists its colleges, and a college its hostels", async ({ page, api }) => {
  await api.scenario({ directory: "with-school" });
  await page.goto("/");
  await page.getByRole("link", { name: /Lakeside University.*1 college/ }).click();

  await expect(page).toHaveURL("/lakeside-university");
  await expect(page.getByRole("heading", { level: 1, name: "Lakeside University" })).toBeVisible();
  await checkPage(page);
  await page.getByRole("link", { name: /College of Science.*1 hostel/ }).click();

  await expect(page).toHaveURL("/lakeside-university/college-of-science");
  await expect(page.getByRole("heading", { level: 1, name: "College of Science" })).toBeVisible();
  await checkPage(page);
  await page.getByRole("link", { name: /Newton Hall/ }).click();

  await expect(page).toHaveURL("/college-of-science/newton-hall/plans");
  await expect(page.getByRole("heading", { level: 1, name: "Newton Hall" })).toBeVisible();
});

test("the hostel lock: a signed-in customer is shown only their own hostel", async ({ page, api }) => {
  await api.signIn("amaka");

  // The list, a location page and the home page all show just Unity Lodge.
  await page.goto("/hostels");
  await expect(page.getByRole("heading", { level: 1, name: "Your hostel" })).toBeVisible();
  await expect(page.getByText("Your account belongs to this hostel.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Buy data" })).toHaveAttribute("href", UNITY_LODGE_PLANS);
  await expect(page.getByText("Palm Court")).toHaveCount(0);
  await checkPage(page);

  await page.goto("/palm-grove");
  await expect(page.getByRole("heading", { level: 1, name: "Your hostel" })).toBeVisible();
  await expect(page.getByText("Palm Court")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByText("Your hostel", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search locations or hostels")).toHaveCount(0);
  await checkPage(page);

  // Another hostel's plans say whose account this is, and sell nothing.
  await page.goto(PALM_COURT_PLANS);
  await expect(page.getByText("Your account belongs to Unity Lodge, so plans for Palm Court aren’t available to you.")).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Plans" })).toHaveCount(0);
  await checkPage(page);

  await page.getByRole("link", { name: "Buy data" }).click();
  await expect(page).toHaveURL(UNITY_LODGE_PLANS);
  await expect(page.getByRole("radiogroup", { name: "Plans" })).toBeVisible();
});
