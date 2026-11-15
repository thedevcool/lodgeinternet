/**
 * The blog review desk (/blog/admin): where the superadmin reads each post
 * as readers will, edits it, and approves, rejects or unpublishes it.
 * Nothing reaches the blog without this yes.
 *
 * Fixture posts and where each stands: e2e/fixtures/blog.json. ifeoma is the
 * superadmin; segun is an ordinary admin and must be refused.
 */
import admins from "./fixtures/admins.json";
import { checkPage } from "./support/checks";
import { alertOn } from "./support/locators";
import { expect, test } from "./support/test";

const WAITING_POST = "/blog/admin/your-wallet-explained";
const LIVE_POST = "/blog/admin/how-to-buy-a-data-plan";

test("the superadmin signs in and sees the desk; a wrong password and an ordinary admin are refused", async ({ page }) => {
  // Not signed in: the desk sends you to its sign-in page.
  await page.goto("/blog/admin");
  await expect(page).toHaveURL("/blog/admin/login");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await checkPage(page);

  await page.getByLabel("Username").fill("ifeoma");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alertOn(page)).toHaveText("That username and password don't match.");

  // An admin who isn't the superadmin has the right password and still no entry.
  await page.getByLabel("Username").fill("segun");
  await page.getByLabel("Password", { exact: true }).fill(admins.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alertOn(page)).toHaveText("Only the superadmin can review blog posts.");
  await expect(page).toHaveURL("/blog/admin/login");

  await page.getByLabel("Username").fill("ifeoma");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/blog/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Blog review" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/blog/admin/login");
});

test("an ordinary admin who reaches the desk anyway is told it is the superadmin's", async ({ page, api }) => {
  await api.signInAdmin("segun");
  await page.goto("/blog/admin");

  await expect(page.getByText("Only the superadmin can review blog posts.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Your wallet, explained/ })).toHaveCount(0);
  await checkPage(page);
});

test("the tabs sort posts by where they stand, with counts", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin");

  // Two waiting for a first yes and one update to a live post; two live; one rejected.
  const toReview = page.getByRole("button", { name: "To review · 3" });
  const live = page.getByRole("button", { name: "Live · 2" });
  const rejected = page.getByRole("button", { name: "Rejected · 1" });
  await expect(toReview).toHaveAttribute("aria-pressed", "true");

  const rows = page.getByRole("list").getByRole("link");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "What happens when you pay" })).toContainText("Update waiting");
  // The writer's note to the reviewer shows on the row.
  await expect(rows.filter({ hasText: "Your wallet, explained" })).toContainText("Please check the part about account numbers reads clearly.");
  // A post file that couldn't be read is named, so it isn't silently missing.
  await expect(page.getByText("1 post file(s) can't be read")).toBeVisible();
  await expect(page.getByText("draft-notes: the summary line is missing")).toBeVisible();
  await checkPage(page);

  await live.click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("How we hold your code");

  await rejected.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Our first year");
  await checkPage(page);
});

test("reading a post shows it as readers will, with the note and the code it describes", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin");
  await page.getByRole("link", { name: /Your wallet, explained/ }).click();
  await expect(page).toHaveURL(WAITING_POST);

  await expect(page.getByText("Note for you: Please check the part about account numbers reads clearly.")).toBeVisible();
  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { level: 1, name: "Your wallet, explained" })).toBeVisible();
  await expect(article.getByRole("heading", { level: 2, name: "Topping up" })).toBeVisible();
  await expect(article.getByText("Last checked against the product on 12 November 2026.")).toBeVisible();

  await page.getByText("The code this post describes (1)").click();
  await expect(page.getByText("frontend/components/wallet/WalletSection.tsx")).toBeVisible();

  await expect(page.getByRole("button", { name: "Approve and publish" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeEnabled();
  await checkPage(page);
});

test("editing: change the title, summary and body, save, and preview the result", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto(WAITING_POST);
  await page.getByRole("tab", { name: "Edit" }).click();

  // The editor starts from the post as written.
  await expect(page.getByLabel("Title")).toHaveValue("Your wallet, explained");
  await expect(page.getByRole("textbox", { name: "The post" })).toHaveValue(/^Your wallet is money you keep with Lodge Internet/);
  const save = page.getByRole("button", { name: "Save and preview" });
  await expect(save).toBeDisabled(); // nothing changed yet
  await checkPage(page);

  await page.getByLabel("Title").fill("Your wallet, in plain words");
  await page.getByLabel("Summary").fill("Top up by transfer, then pay for any plan in one tap.");
  await page.getByRole("textbox", { name: "The post" }).fill("Your wallet holds money for plans.\n\n## How to top up\n\n- Open your bank app.\n- Send to **your own** account number.");
  const draftRequest = page.waitForRequest((request) => request.url().endsWith("/draft") && request.method() === "PUT");
  await save.click();
  // The save names the version of the file that was open (so a post that
  // changed underneath is never approved unread).
  expect((await draftRequest).postDataJSON()).toMatchObject({ contentHash: "hash-wallet-04", title: "Your wallet, in plain words" });

  // Back in Read: the preview is the edited post, marked as not published.
  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { level: 1, name: "Your wallet, in plain words" })).toBeVisible();
  await expect(article.getByText("Top up by transfer, then pay for any plan in one tap.")).toBeVisible();
  await expect(article.getByRole("heading", { level: 2, name: "How to top up" })).toBeVisible();
  await expect(article.getByRole("listitem").filter({ hasText: "Send to your own account number." })).toBeVisible();
  await expect(page.getByText("Your edits, not published yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish with my edits" })).toBeEnabled();
  await checkPage(page);

  // On the desk the post is marked as edited; readers still see nothing.
  await page.getByRole("link", { name: "Blog review" }).click();
  // (The row keeps the title of the post as written until the edit is published.)
  await expect(page.getByRole("link", { name: /Your wallet, explained/ })).toContainText("Edited");

  // Discarding the edits brings the written post back.
  await page.getByRole("link", { name: /Your wallet, explained/ }).click();
  await page.getByRole("tab", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Discard my edits" }).click();
  await expect(page.getByRole("article").getByRole("heading", { level: 1, name: "Your wallet, explained" })).toBeVisible();
  await expect(page.getByText("Your edits, not published yet")).toHaveCount(0);
});

test("an edit with a price in it is listed as a problem, and can't be approved", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto(WAITING_POST);
  await page.getByRole("tab", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "The post" }).fill("Top up from ₦2,000 and you can buy a weekly plan straight away.");
  await page.getByRole("button", { name: "Save and preview" }).click();

  // Prices change; a post must never quote one.
  const problems = alertOn(page).filter({ hasText: "This can't go live yet" });
  await expect(problems.getByRole("listitem")).toHaveText(["contains a naira amount: '₦2,000'"]);
  await expect(page.getByRole("button", { name: "Publish with my edits" })).toBeDisabled();
  await checkPage(page);

  // Still not live for readers.
  expect((await page.request.get("http://localhost:4010/api/blog/your-wallet-explained")).status()).toBe(404);
});

test("approving publishes the post and moves it to Live", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto(WAITING_POST);
  const approveRequest = page.waitForRequest((request) => request.url().endsWith("/approve"));
  await page.getByRole("button", { name: "Approve and publish" }).click();
  expect((await approveRequest).postDataJSON()).toEqual({ contentHash: "hash-wallet-04" });

  await expect(page).toHaveURL("/blog/admin");
  await expect(page.getByRole("button", { name: "To review · 2" })).toBeVisible();
  await page.getByRole("button", { name: "Live · 3" }).click();
  await expect(page.getByRole("link", { name: /Your wallet, explained/ })).toContainText("Live");
});

test("rejecting needs a note saying what to change", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto(WAITING_POST);
  await page.getByRole("button", { name: "Reject", exact: true }).click();

  const reject = page.getByRole("button", { name: "Reject with this note" });
  await expect(reject).toBeDisabled();
  await page.getByLabel("What needs to change?").fill("   ");
  await expect(reject).toBeDisabled(); // spaces are not a note
  await checkPage(page);

  // Cancel puts the verdict buttons back, untouched.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Approve and publish" })).toBeEnabled();

  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByLabel("What needs to change?").fill("Say how long a transfer takes to arrive.");
  const rejectRequest = page.waitForRequest((request) => request.url().endsWith("/reject"));
  await reject.click();
  expect((await rejectRequest).postDataJSON()).toEqual({ contentHash: "hash-wallet-04", note: "Say how long a transfer takes to arrive." });

  await expect(page).toHaveURL("/blog/admin");
  await page.getByRole("button", { name: "Rejected · 2" }).click();
  await page.getByRole("link", { name: /Your wallet, explained/ }).click();
  await expect(page.getByText("Last verdict by ifeoma: Say how long a transfer takes to arrive.")).toBeVisible();
  await expect(page.getByText("Rejected. Edit it here and publish")).toBeVisible();
});

test("a live post can be taken off the blog", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto(LIVE_POST);
  await expect(page.getByText("First published 3 November 2026")).toBeVisible();
  // Live and unedited: there is nothing to approve or reject, only this.
  await expect(page.getByRole("button", { name: /Approve|Publish/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  await checkPage(page);

  await page.getByRole("button", { name: "Take it off the blog" }).click();
  await expect(page).toHaveURL("/blog/admin");
  await expect(page.getByRole("button", { name: "Live · 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "To review · 4" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: /How to buy a data plan/ })).toContainText("Waiting");
});

test("new covers on live posts are approved together with one button", async ({ page, api }) => {
  // Two live posts have a new cover illustration and nothing else changed.
  await api.scenario({ covers: "new" });
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin");

  await expect(page.getByText("2 live posts have a new cover illustration.")).toBeVisible();
  await expect(page.getByRole("button", { name: "To review · 5" })).toBeVisible();
  const rows = page.getByRole("list").getByRole("link");
  await expect(rows.filter({ hasText: "New cover only" })).toHaveCount(2);
  await checkPage(page);

  // Opening one shows the drawing and says the words are already live.
  await rows.filter({ hasText: "How we hold your code" }).click();
  await expect(page.getByText("The words are live already. Only the cover illustration is new")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve the new cover" })).toBeEnabled();
  await expect(page.getByRole("article").locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await checkPage(page);
  await page.getByRole("link", { name: "Blog review" }).click();

  const approveRequest = page.waitForRequest((request) => request.url().endsWith("/api/admin/blog-covers/approve"));
  await page.getByRole("button", { name: "Approve all 2 covers" }).click();
  expect((await approveRequest).method()).toBe("POST");

  // Both are plain live posts again, and readers are given the covers.
  await expect(page.getByRole("button", { name: "To review · 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Live · 2" })).toBeVisible();
  await expect(page.getByText("a new cover illustration")).toHaveCount(0);
  await expect(page.getByText("New cover only")).toHaveCount(0);
  const readers = await (await page.request.get("http://localhost:4010/api/blog")).json();
  expect(readers.posts.map((post: { slug: string; cover: string | null }) => [post.slug, post.cover])).toEqual([
    ["how-to-buy-a-data-plan", "/api/blog/how-to-buy-a-data-plan/cover.svg?v=hash-buy-01"],
    ["what-happens-when-you-pay", null],
    ["how-we-hold-your-code", "/api/blog/how-we-hold-your-code/cover.svg?v=hash-hold-03"],
  ]);
});

test("a post that isn't in the repository says so", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin/never-written");
  await expect(page.getByText("This post isn't in the repository any more.")).toBeVisible();
  await checkPage(page);
});
