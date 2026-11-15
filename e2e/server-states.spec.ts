/**
 * What the server-written pages show when the API has nothing, or is down:
 * the blog list, the legal index and one legal document.
 *
 * These pages are written by the Next server, which asks the API itself. The
 * server's requests carry no trace of which test caused them, so the
 * scenario here is set on the stand-in's shared "server" world, and that is
 * why this file runs in its own project, alone, after every other test has
 * finished (playwright.config.ts).
 *
 * The server also keeps the API's answers for a minute or more, so on their
 * own these tests would be shown yesterday's page. The browser therefore
 * asks in Next's draft mode (the `__prerender_bypass` cookie, with the id
 * from the build): the page is written afresh for that one request, and
 * nothing it sees is kept for other visitors. The last test proves that.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { StandIn } from "./support/api";
import { checkPage } from "./support/checks";
import { expect, test } from "./support/test";

/** The build's draft-mode id (changes with every `next build`). */
function draftModeId(): string {
  const manifest = path.join(process.cwd(), ".next", "prerender-manifest.json");
  return JSON.parse(readFileSync(manifest, "utf8")).preview.previewModeId;
}

let server: StandIn;

test.beforeEach(async ({ context, request }) => {
  server = new StandIn(request, context, "server");
  await context.addCookies([{ name: "__prerender_bypass", value: draftModeId(), domain: "localhost", path: "/" }]);
});

test.afterEach(async () => {
  // Whatever happens, the next page anyone asks for gets the normal answers.
  await server.scenario();
});

test("blog: with no live posts the list says so, and offers no empty section chips", async ({ page, api }) => {
  await server.scenario({ blog: "empty" });
  await api.scenario({ blog: "empty" }); // the browser's own question (the footer link)
  await page.goto("/blog");

  await expect(page.getByRole("heading", { level: 1, name: "Blog" })).toBeVisible();
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await expect(page.getByText("New posts land here as we publish them.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Guides", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  await checkPage(page);
});

for (const failure of [
  { name: "the API answers 500", fail: { route: "GET /api/blog", status: 500 } },
  { name: "the connection to the API drops", fail: { route: "GET /api/blog", drop: true } },
]) {
  test(`blog: when ${failure.name}, the list says it didn't load, and Try again recovers`, async ({ page }) => {
    await server.scenario({ fail: [failure.fail] });
    await page.goto("/blog");

    await expect(page.getByText("The blog didn't load")).toBeVisible();
    await expect(page.getByText("Our server didn't answer. Give it a minute and try again.")).toBeVisible();
    // Not the empty state: there are posts, they just couldn't be fetched.
    await expect(page.getByText("Nothing here yet")).toHaveCount(0);
    await checkPage(page);

    // The API is back: Try again asks the server for the page afresh.
    await server.scenario();
    await page.getByRole("link", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
    await expect(page.getByText("The blog didn't load")).toHaveCount(0);
  });
}

test.describe("covers", () => {
  // Covers are images served by the API. middleware.ts allows them from the
  // API on this machine under test (img-src), as it allows https in
  // production, so the picture must really draw. A cover has no pixel size
  // of its own (it scales to its box), so "drawn" is asked of the browser
  // directly: decode() fails for an image that was blocked or is broken.
  test("blog: a post with a cover shows it on the list and on the post", async ({ page, request, api }) => {
    // Two worlds are involved: the Next server writes the page from the
    // "server" world, and the browser then fetches the picture itself, from
    // this test's own world. The cover has to be approved in both.
    await server.scenario({ covers: "approved" });
    await api.scenario({ covers: "approved" });
    await page.goto("/blog");

    const address = "http://localhost:4010/api/blog/how-to-buy-a-data-plan/cover.svg?v=hash-buy-01";
    const lead = page.getByRole("link", { name: /How to buy a data plan/ });
    // Decoration only: an empty alt, so screen readers skip it.
    await expect(lead.locator("img")).toHaveAttribute("src", address);
    await expect(lead.locator("img")).toHaveAttribute("alt", "");
    expect(await lead.locator("img").evaluate((img: HTMLImageElement) => img.decode().then(() => true, () => false))).toBe(true);
    // A post without a cover has no picture, and no gap where one would be.
    await expect(page.getByRole("link", { name: /What happens when you pay/ }).locator("img")).toHaveCount(0);
    await checkPage(page);

    const picture = await request.get(address);
    expect(picture.status()).toBe(200);
    expect(picture.headers()["content-type"]).toBe("image/svg+xml");
    expect(await picture.text()).toContain('viewBox="0 0 1200 630"');

    await lead.click();
    await expect(page).toHaveURL("/blog/how-to-buy-a-data-plan");
    const cover = page.getByRole("article").locator("img");
    await expect(cover).toHaveAttribute("src", address);
    expect(await cover.evaluate((img: HTMLImageElement) => img.decode().then(() => true, () => false))).toBe(true);
    await checkPage(page);
  });
});

test("legal: when the API is down, the index still lists every document by name", async ({ page }) => {
  await server.scenario({ fail: [{ route: "GET /api/legal", status: 500 }] });
  await page.goto("/legal");

  const documents = page.getByRole("main").getByRole("listitem");
  await expect(documents).toHaveCount(6);
  await expect(documents.first()).toHaveText("Terms of Service");
  await expect(page.getByRole("main").getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/legal/privacy");
  await checkPage(page);
});

for (const failure of [
  { name: "the API answers 500", fail: { route: "GET /api/legal/:slug", status: 500 } },
  { name: "the connection to the API drops", fail: { route: "GET /api/legal/:slug", drop: true } },
]) {
  // This used to be the 404 page: "couldn't ask" read as "no such document".
  test(`legal: when ${failure.name}, a document says it didn't load (not a 404), and Try again recovers`, async ({ page }) => {
    await server.scenario({ fail: [failure.fail] });
    const response = await page.goto("/legal/privacy");

    expect(response?.status()).not.toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByText("This page didn’t load")).toBeVisible();
    await expect(page.getByText("Our server didn’t answer. Give it a moment and try again.")).toBeVisible();
    await expect(page.getByText("This page isn’t available")).toHaveCount(0);
    await checkPage(page);

    // The API is back: Try again reloads the page, and the document is there.
    await server.scenario();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "1. What we collect" })).toBeVisible();
    await expect(page.getByText("This page didn’t load")).toHaveCount(0);
  });
}

test("legal: a document that doesn't exist is still a 404 while the API is up", async ({ page }) => {
  const response = await page.goto("/legal/no-such-document");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page isn’t available" })).toBeVisible();
});

test("none of the above was kept: an ordinary visitor still gets the normal pages", async ({ request }) => {
  // No draft cookie here: this is the saved page everyone else is served.
  const blog = await (await request.get("/blog")).text();
  expect(blog).toContain("How to buy a data plan");
  expect(blog).not.toContain("Nothing here yet");
  expect(blog).not.toContain("The blog didn't load");

  const legal = await (await request.get("/legal")).text();
  expect(legal).toContain("The agreement between you and Lodge Internet when you buy a plan.");

  const privacy = await request.get("/legal/privacy");
  expect(privacy.status()).toBe(200);
  expect(await privacy.text()).toContain("1. What we collect");
});
