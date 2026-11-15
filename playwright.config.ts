/**
 * End-to-end tests (e2e/), run with `npm run e2e`.
 *
 * What runs: the real website, built for production, in a phone-sized
 * Chromium, against a stand-in for the backend (e2e/mock-api.mjs) and a
 * stand-in for Paystack (e2e/paystack-stub.js). Nothing here talks to the
 * real backend, the real Paystack or the internet.
 *
 * Why a production build and not `next dev`: the security policy
 * (middleware.ts), the server-written pages (blog, legal) and their caching
 * only behave as customers get them in a real build. The policy is left on
 * (no `bypassCSP`): a script or request it blocks should fail a test.
 *
 * Unit tests live in tests/unit and run with Vitest (`npm test`), not here.
 */
import { defineConfig } from "@playwright/test";

const SITE = "http://localhost:3100";
const API = "http://localhost:4010";

// Nearly every customer is on a phone (engineering standard P10), so every
// project is one: touch, a mobile browser, no hover.
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

function phone(width: number, height: number, colorScheme: "light" | "dark") {
  return {
    browserName: "chromium" as const,
    viewport: { width, height },
    // Layout is measured in CSS pixels, which this doesn't change. A real
    // phone's 3x would have the test machine paint nine times the pixels
    // (blurred glass included) for nothing the tests look at.
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_CHROME,
    colorScheme,
  };
}

// These tests change what the Next SERVER is told by the API. The server has
// no idea which test is asking, so that state is shared by everyone: they
// run in their own project, one at a time, after everything else is done.
const SERVER_STATES = /server-states\.spec\.ts/;

// e2e/shots.spec.ts takes before-and-after pictures of the site. It checks
// nothing, so the normal run leaves it out; `SHOTS=1` runs it and only it,
// at 390 px in light and dark.
const SHOTS = /shots\.spec\.ts/;
const TAKING_SHOTS = process.env.SHOTS === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI and the test server are small machines (2 CPUs) that also run the
  // site and the stand-in API: two browsers at once is what they can carry.
  workers: process.env.CI ? 2 : undefined,
  // A test is a few page loads and accessibility scans; the slowest also
  // waits on the site's own 5 s bank-transfer poll. Sized for the small
  // machines: anything near a minute is stuck, not slow.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",

  use: {
    baseURL: SITE,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Nigerian customers: dates and money are formatted for them.
    locale: "en-NG",
    timezoneId: "Africa/Lagos",
  },

  projects: TAKING_SHOTS
    ? [
        { name: "phone-390", use: phone(390, 844, "light"), testMatch: SHOTS },
        { name: "phone-390-dark", use: phone(390, 844, "dark"), testMatch: SHOTS },
      ]
    : [
        { name: "phone-360", use: phone(360, 740, "light"), testIgnore: [SERVER_STATES, SHOTS] },
        { name: "phone-390", use: phone(390, 844, "light"), testIgnore: [SERVER_STATES, SHOTS] },
        { name: "phone-390-dark", use: phone(390, 844, "dark"), testIgnore: [SERVER_STATES, SHOTS] },
        {
          name: "server-states",
          use: phone(390, 844, "light"),
          testMatch: SERVER_STATES,
          fullyParallel: false,
          dependencies: ["phone-360", "phone-390", "phone-390-dark"],
        },
      ],

  // Started in this order, each waited for before the next: the build reads
  // the legal pages from the stand-in API, so the API has to be up first.
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: `${API}/__health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_API_PORT: "4010", MOCK_SITE_ORIGIN: SITE },
    },
    {
      // The saved copies of earlier API answers are dropped first, so a
      // changed fixture is what the pages show.
      command:
        `node -e "require('fs').rmSync('.next/cache/fetch-cache',{recursive:true,force:true})"` +
        " && npx next build && npx next start -p 3100",
      url: SITE,
      // `next build` takes several minutes on a 2-CPU machine.
      timeout: 900_000,
      reuseExistingServer: !process.env.CI,
      env: {
        // These win over .env.local. NEXT_PUBLIC_ values are fixed into the
        // build, which is why the site is built here and not reused from a
        // build made for another API.
        NEXT_PUBLIC_API_BASE_URL: API,
        NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_e2e",
        // A made-up number, so the WhatsApp buttons show (as in production)
        // without the tests depending on anyone's .env.local.
        NEXT_PUBLIC_WHATSAPP_NUMBER: "2348030000000",
        NEXT_PUBLIC_WHATSAPP_URL: "",
        NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "",
        NEXT_PUBLIC_TELEGRAM_URL: "",
      },
    },
  ],
});
