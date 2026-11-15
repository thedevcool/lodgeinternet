import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Unit and component tests (tests/unit). `npm test` runs them once,
 * `npm run test:coverage` adds a coverage report. End-to-end tests live in
 * e2e/ and run with Playwright (`npm run e2e`), not here.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    // Generous on purpose: tests that involve time use fake clocks, so this
    // only matters on a busy machine (and for the deliberately slow key
    // derivation behind saved codes, lib/localStorageCrypto.ts).
    testTimeout: 30_000,
    // Tests replace `fetch`, `location` and NEXT_PUBLIC_* settings; these put
    // the real ones back after every test so one test can't leak into the next.
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**", "store/**"],
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage",
    },
  },
});
