/**
 * Defects the tests have found in the website that are not fixed yet.
 *
 * The shared checks (./checks.ts) subtract exactly these, so the suite stays
 * green and anything NEW (another small button, another low-contrast label,
 * a page that scrolls sideways) fails. This is a to-do list for the product,
 * not a list of things that are fine: when one is fixed, delete its entry,
 * and the check guards it from then on.
 *
 *   page    which pages: "*" (any), an exact path ("/hostels"), or a path
 *           with "*" for one or more characters ("/blog/*")
 *   rule    "tap-target-44", "sideways-scroll", an axe rule id
 *           ("color-contrast", "label", ...), or "behaviour" (see below)
 *   target  the element. Tap targets: the check's own description, e.g.
 *           `button "Close"`. axe rules: the selector axe reports. A RegExp
 *           matches a family (the same component with different words in it).
 *   why     what is wrong and how to fix it
 *
 * rule "behaviour" is for a page that does the wrong thing rather than
 * draws the wrong thing (no error state, say). A spec for the right
 * behaviour is written anyway and marked `test.fail(...)` through
 * `knownBehaviour` below: it is expected to fail while the entry exists, and
 * Playwright reports it the day it starts passing, which is the day to
 * delete the entry.
 */
export type KnownIssue = {
  page: string;
  rule: string;
  target: string | RegExp;
  why: string;
};

// Empty since 2026-11-15: every defect the first run of the tests found (44 px
// tap targets, text contrast, the accessibility rules, three pages with no
// error state) has been fixed, and the checks guard each of them. A new entry
// looks like this:
//
//   {
//     page: "/hostels",
//     rule: "tap-target-44",
//     target: 'button "Clear search"',
//     why: "components/ui/SearchField.tsx: the clear button is 26 px. Fix: h-11 w-11 with the icon centred.",
//   },
export const KNOWN_ISSUES: KnownIssue[] = [];

/** Does `page` (a known issue's pattern) cover this path? */
function coversPath(pattern: string, pathname: string): boolean {
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+");
  return new RegExp(`^${escaped}$`).test(pathname);
}

/** The known issue that explains this finding, if there is one. */
export function knownIssueFor(pathname: string, rule: string, target: string): KnownIssue | undefined {
  return KNOWN_ISSUES.find(
    (issue) =>
      issue.rule === rule &&
      coversPath(issue.page, pathname) &&
      (typeof issue.target === "string" ? issue.target === target : issue.target.test(target)),
  );
}

/**
 * For `test.fail(...)`: why this behaviour is known to be wrong today, or
 * undefined once its entry has been deleted (the test must then pass).
 */
export function knownBehaviour(page: string, target: string): string | undefined {
  return KNOWN_ISSUES.find((issue) => issue.rule === "behaviour" && issue.page === page && issue.target === target)?.why;
}
