/**
 * Security headers: what the server sends with every page.
 *
 * The rest of the suite proves the policy from the other side (every test
 * fails if the policy blocks a script or a request the site needs). This
 * file reads the headers themselves. They don't depend on screen size or
 * theme, so one project is enough.
 */
import { expect, test } from "./support/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone-390", "headers are the same on every screen: checked once");
});

/** "script-src 'self' ..." → { "script-src": ["'self'", ...] } */
function parsePolicy(header: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of header.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives[name] = values;
  }
  return directives;
}

for (const path of ["/", "/unity-estate/unity-lodge/plans", "/blog", "/legal/privacy", "/this/page/does/not/exist"]) {
  test(`${path} is served with a strict content security policy and the fixed headers`, async ({ page }) => {
    const response = await page.goto(path);
    const headers = response!.headers();
    const policy = parsePolicy(headers["content-security-policy"] ?? "");

    // Scripts: our own files, this request's nonce, and Paystack. No
    // 'unsafe-inline' and no 'unsafe-eval': an injected script can't run.
    const nonce = policy["script-src"].find((value) => value.startsWith("'nonce-"));
    expect(nonce, "script-src carries a nonce").toMatch(/^'nonce-[A-Za-z0-9+/=]{16,}'$/);
    expect(policy["script-src"]).not.toContain("'unsafe-inline'");
    expect(policy["script-src"]).not.toContain("'unsafe-eval'");
    expect(policy["script-src"]).toEqual(["'self'", nonce, "https://js.paystack.co"]);

    // Nobody may put the site in a frame (clickjacking), old browsers included.
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");

    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  });
}

test("the nonce is new on every request, and the scripts on the page carry it", async ({ page }) => {
  const first = await page.goto("/");
  const firstNonce = /'nonce-([^']+)'/.exec(first!.headers()["content-security-policy"])![1];

  // Every script written into the page has this request's nonce.
  const nonces = await page.locator("script").evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
  expect(nonces.length).toBeGreaterThan(0);
  expect(new Set(nonces)).toEqual(new Set([firstNonce]));

  const second = await page.goto("/");
  const secondNonce = /'nonce-([^']+)'/.exec(second!.headers()["content-security-policy"])![1];
  expect(secondNonce).not.toBe(firstNonce);
});

// The admin console lives outside the customer layout, and its pages are
// client pages that Next would otherwise build once at deploy time. A page
// built ahead of time has no nonce on its start-up scripts, the policy blocks
// them, and the page is blank: that was production on 2026-11-15.
for (const path of ["/admin/login", "/admin/dashboard"]) {
  test(`${path}: the admin console's scripts carry the nonce, so the page is not blank`, async ({ page }) => {
    const response = await page.goto(path);
    const nonce = /'nonce-([^']+)'/.exec(response!.headers()["content-security-policy"])![1];

    const nonces = await page.locator("script").evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
    expect(nonces.length).toBeGreaterThan(0);
    expect(new Set(nonces)).toEqual(new Set([nonce]));

    // Signed out, the dashboard sends the admin to sign in; either way the
    // sign-in form is what a working console shows here.
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter username")).toBeVisible();
  });
}

test.describe("an injected script", () => {
  // The policy refusing it is the point: that refusal must not fail the test.
  test.use({ policyBlocksExpected: true });

  test("the policy stops a script that was not written by the site", async ({ page }) => {
    await page.goto("/support");
    // What an injected <script> would be: inline, and without the nonce.
    const ran = await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__injected = true";
      document.head.appendChild(script);
      return (window as unknown as { __injected?: boolean }).__injected === true;
    });
    expect(ran, "an inline script without the nonce must not run").toBe(false);
  });
});
