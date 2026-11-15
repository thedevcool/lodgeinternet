// Runs before every unit test file: the DOM matchers (toBeInTheDocument, …)
// and a clean DOM and storage between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// How long `findBy…` / `waitFor` keep looking. The library's 1 second is not
// enough on a busy laptop; a passing test never waits this long.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
