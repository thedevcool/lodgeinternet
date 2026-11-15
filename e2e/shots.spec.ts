/**
 * Pictures of ten representative screens, for comparing the site's look
 * before and after a change. NOT part of the normal suite: it asserts
 * nothing about behaviour, and playwright.config.ts only runs it when
 * SHOTS=1 is set (on the 390 px light and dark projects, and nothing else).
 *
 * Each screen is saved, whole page, to test-results/shots/<project>/<name>.png.
 * The pages are drawn from the stand-in API's default fixtures, so two runs
 * of the same code give the same pictures.
 *
 * How to run it on the test server and copy the pictures back:
 * docs/testing-guide.md, section 7a.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { settle } from "./support/checks";
import { openCheckout } from "./support/checkout";
import { UNITY_LODGE_PLANS, plan } from "./support/data";
import { expect, test } from "./support/test";

/** Save the whole page once its entrance animations have finished. */
async function shoot(page: Page, name: string): Promise<void> {
  await settle(page);
  const project = test.info().project.name;
  await page.screenshot({ path: path.join("test-results", "shots", project, `${name}.png`), fullPage: true });
}

test("home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Unity Estate/ })).toBeVisible();
  await shoot(page, "home");
});

test("hostels", async ({ page }) => {
  await page.goto("/hostels");
  await expect(page.getByRole("link", { name: /Unity Lodge/ })).toBeVisible();
  await shoot(page, "hostels");
});

test("plans, with the checkout sheet open", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto(UNITY_LODGE_PLANS);
  await openCheckout(page, plan("20gb-monthly").name);
  await shoot(page, "plans-checkout");
});

test("dashboard, signed in, with codes", async ({ page, api }) => {
  await api.scenario({ wallet: "funded" });
  await api.signIn("amaka");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Recent purchases" })).toBeVisible();
  await shoot(page, "dashboard");
});

test("login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await shoot(page, "login");
});

test("register", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Palm Court" })).toBeVisible();
  await shoot(page, "register");
});

test("blog", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await shoot(page, "blog");
});

test("a blog post", async ({ page }) => {
  await page.goto("/blog/how-to-buy-a-data-plan");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(page, "blog-post");
});

test("blog review desk, signed in", async ({ page, api }) => {
  await api.signInAdmin("ifeoma");
  await page.goto("/blog/admin");
  await expect(page.getByRole("button", { name: /To review/ })).toBeVisible();
  await shoot(page, "blog-admin");
});

test("settings", async ({ page, api }) => {
  await api.signIn("amaka");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await shoot(page, "settings");
});
