/**
 * The blog, as readers see it: the list, the section filter, one post drawn
 * from every kind of block the backend can send, the live hostel list inside
 * a post, a 404 for a post that doesn't exist, and the footer's Blog link
 * (which only shows when there is something to read: engineering standard P7).
 *
 * The list and the posts are written on the Next server from the stand-in's
 * default fixtures (e2e/fixtures/blog.json). What the server shows when the
 * blog is empty or the API is down is in server-states.spec.ts.
 */
import { checkPage } from "./support/checks";
import { UNITY_LODGE_PLANS } from "./support/data";
import { expect, test } from "./support/test";

const POST = "/blog/how-to-buy-a-data-plan";

test("the list shows every live post, newest first, and nothing unapproved", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.getByRole("heading", { level: 1, name: "Blog" })).toBeVisible();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "How to buy a data plan",
    "What happens when you pay",
    "How we hold your code",
  ]);
  const lead = page.getByRole("link", { name: /How to buy a data plan/ });
  await expect(lead).toContainText("Guides");
  await expect(lead).toContainText("3 November 2026");
  await expect(lead).toContainText("For customers");
  // Posts still waiting for the superadmin, or rejected, are not here.
  await expect(page.getByText("Your wallet, explained")).toHaveCount(0);
  await expect(page.getByText("Our first year")).toHaveCount(0);
  await checkPage(page);
});

test("the section chips filter the list, and only sections with posts get a chip", async ({ page }) => {
  await page.goto("/blog");
  // "News" has no live post, so it has no chip.
  await expect(page.getByRole("link", { name: "News", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Engineering", exact: true }).click();
  await expect(page).toHaveURL("/blog?section=engineering");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["How we hold your code"]);
  await checkPage(page);

  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(page).toHaveURL("/blog");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);

  // A section that doesn't exist is ignored, not an error.
  await page.goto("/blog?section=nonsense");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
});

test("a post draws every kind of block and inline mark", async ({ page }) => {
  await page.goto("/blog");
  await page.getByRole("link", { name: /How to buy a data plan/ }).click();
  await expect(page).toHaveURL(POST);

  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { level: 1, name: "How to buy a data plan" })).toBeVisible();
  await expect(article.getByText("Lodge Internet · 3 November 2026 ·")).toContainText("min read");
  await expect(page).toHaveTitle("How to buy a data plan · Lodge Internet");

  // Headings, a quote, both kinds of list, and a code sample.
  await expect(article.getByRole("heading", { level: 2, name: "Find your hostel" })).toBeVisible();
  await expect(article.getByRole("heading", { level: 3, name: "What you pay" })).toBeVisible();
  await expect(article.getByRole("blockquote")).toHaveText("Keep the page open until your code is on screen.");
  await expect(article.getByRole("listitem").filter({ hasText: "TV plans are tied to one television." })).toBeVisible();
  await expect(article.getByRole("listitem").filter({ hasText: "Tap Continue, then Pay." })).toBeVisible();
  await expect(article.getByText("Enter code:  your 8 digits")).toBeVisible();

  // Inline marks: bold, italic, code, a link to our own page, a link to our
  // own domain. A link to anywhere else is shown as plain words.
  await expect(article.getByRole("strong").filter({ hasText: "your email" })).toBeVisible();
  await expect(article.getByRole("emphasis").filter({ hasText: "nothing else" })).toBeVisible();
  await expect(article.getByRole("code").filter({ hasText: "48213907" })).toBeVisible();
  await expect(article.getByRole("link", { name: "the hostel list" })).toHaveAttribute("href", "/hostels");
  await expect(article.getByRole("link", { name: "terms" })).toHaveAttribute("href", "https://lodgeinternet.com/legal/terms");
  await expect(article.getByText("this outside page")).toBeVisible();
  await expect(article.getByRole("link", { name: "this outside page" })).toHaveCount(0);
  // So is a link dressed up as one of our pages ("//host", "/\\host").
  await expect(article.getByText("this look-alike")).toBeVisible();
  await expect(article.getByRole("link", { name: /this look-alike|this one/ })).toHaveCount(0);
  // The marks themselves never leak onto the page.
  await expect(article.getByText("**")).toHaveCount(0);

  await expect(article.getByText("Last checked against the product on 10 November 2026. Updated 10 November 2026.")).toBeVisible();
  await checkPage(page);

  // Other posts in the same section are offered below.
  await expect(page.getByRole("link", { name: /What happens when you pay/ })).toHaveAttribute("href", "/blog/what-happens-when-you-pay");
  await article.getByRole("link", { name: "Blog", exact: true }).click();
  await expect(page).toHaveURL("/blog");
});

test("the hostel list inside a post is live, and each hostel leads to its plans", async ({ page, api }) => {
  // Held, so the placeholder that stands in while it loads can be seen.
  await api.scenario({ hold: ["GET /api/hostels"] });
  await page.goto(POST);
  await expect(page.getByLabel("Loading hostels")).toBeVisible();
  await api.release();

  const article = page.getByRole("article");
  await expect(article.getByText("Unity Estate", { exact: true })).toBeVisible();
  await expect(article.getByText("Other hostels", { exact: true })).toBeVisible();
  await expect(article.getByRole("link", { name: "Unity Lodge" })).toHaveAttribute("href", UNITY_LODGE_PLANS);
  await expect(article.getByRole("link", { name: "Riverside Lodge" })).toHaveAttribute("href", "/riverside-lodge/plans");
  await checkPage(page);

  await article.getByRole("link", { name: "Unity Lodge" }).click();
  await expect(page).toHaveURL(UNITY_LODGE_PLANS);
});

test("if the hostel list can't load, the post still reads and points to the hostels page", async ({ page, api }) => {
  await api.scenario({ fail: [{ route: "GET /api/hostels", status: 500 }] });
  await page.goto(POST);

  const article = page.getByRole("article");
  await expect(article.getByRole("link", { name: "See every hostel we serve" })).toHaveAttribute("href", "/hostels");
  await expect(article.getByRole("heading", { level: 2, name: "Choose a plan" })).toBeVisible();
  await checkPage(page);
});

test("a post that doesn't exist is a 404, not an empty page", async ({ page }) => {
  const response = await page.goto("/blog/no-such-post");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page isn’t available" })).toBeVisible();

  // A post that is written but not approved is just as absent.
  const unapproved = await page.goto("/blog/your-wallet-explained");
  expect(unapproved?.status()).toBe(404);
});

test("the footer links to the blog only when there is a post to read", async ({ page, api }) => {
  await page.goto("/support");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/blog");

  // No live posts: wait for the footer's own question to the API to be
  // answered, then the link must not be there.
  await api.scenario({ blog: "empty" });
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/blog");
  await page.goto("/support");
  expect(await (await answered).json()).toMatchObject({ posts: [] });
  await expect(footer.getByRole("link", { name: "Hostels" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Blog" })).toHaveCount(0);
});
