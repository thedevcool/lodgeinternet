/**
 * The `test` every spec imports instead of Playwright's own.
 *
 * It adds, to every test, without the spec asking:
 *   - `api`: this test's own world on the stand-in API (see ./api.ts), reset
 *     to the default scenario, so tests never see each other's data;
 *   - the stand-in for Paystack, served in place of Paystack's script;
 *   - a closed door to the internet: any other request off this machine is
 *     refused and fails the test, so the suite can't quietly depend on it;
 *   - a failed test if the page throws an uncaught error or the security
 *     policy (middleware.ts) blocks something.
 *
 * Specs still import `expect` from here, so there is one import line.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { StandIn } from "./api";

const PAYSTACK_SCRIPT = "https://js.paystack.co/v1/inline.js";
const PAYSTACK_STUB = path.join(__dirname, "..", "paystack-stub.js");

// The one-time "Meet your wallet" sheet opens 600 ms after a signed-in
// customer's first page. Tests that aren't about it mark it as already seen,
// or it would cover whatever they came to look at.
const WELCOME_SEEN_KEY = "lodge:welcome-seen:v2-wallet";

type Fixtures = {
  api: StandIn;
  /** Set with `test.use({ welcomeSheet: true })` to let the welcome sheet show. */
  welcomeSheet: boolean;
  /** Set with `test.use({ policyBlocksExpected: true })` in a test that makes the security policy block something on purpose. */
  policyBlocksExpected: boolean;
  guard: void;
};

export const test = base.extend<Fixtures>({
  welcomeSheet: [false, { option: true }],
  policyBlocksExpected: [false, { option: true }],

  api: async ({ context, request }, use) => {
    const session = randomUUID();
    // Cookies ignore ports: set for "localhost", the browser sends it to the
    // API on :4010 from pages on :3100.
    await context.addCookies([{ name: "e2e_session", value: session, domain: "localhost", path: "/" }]);
    const api = new StandIn(request, context, session);
    await api.scenario();
    await use(api);
    // Nothing may be left waiting on this world once the test is over.
    await api.release();
  },

  guard: [
    async ({ context, api, welcomeSheet, policyBlocksExpected }, use, testInfo) => {
      void api; // every test gets its own world, even one that never touches it
      const blocked: string[] = [];
      const pageErrors: string[] = [];

      if (!welcomeSheet) {
        await context.addInitScript((key) => {
          try {
            window.localStorage.setItem(key, "1");
          } catch {
            // storage blocked: the sheet may show, and the test will say so
          }
        }, WELCOME_SEEN_KEY);
      }

      await context.route(
        (url) => url.hostname !== "localhost",
        async (route) => {
          const url = route.request().url();
          if (url.startsWith(PAYSTACK_SCRIPT)) {
            await route.fulfill({ path: PAYSTACK_STUB, contentType: "application/javascript" });
            return;
          }
          blocked.push(url);
          await route.abort();
        },
      );

      context.on("page", (page) => {
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("console", (message) => {
          if (!policyBlocksExpected && message.type() === "error" && /Content Security Policy/i.test(message.text())) {
            pageErrors.push(`Security policy blocked something: ${message.text()}`);
          }
        });
      });

      await use();

      if (testInfo.status === testInfo.expectedStatus) {
        expect(blocked, "the page tried to reach the internet").toEqual([]);
        expect(pageErrors, "the page threw an error or broke the security policy").toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
