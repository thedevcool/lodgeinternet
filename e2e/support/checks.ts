/**
 * The three checks every page a test visits must pass (engineering standards
 * F5 and W4: phone width, no sideways scroll, tap targets, readable to
 * everyone):
 *
 *   expectNoSidewaysScroll  the page is no wider than the phone
 *   expectTapTargets        everything you tap is at least 44 x 44 CSS px
 *   expectAccessible        axe-core finds no WCAG 2.1 A / AA violation
 *
 * `checkPage` runs all three. Each subtracts the defects already listed in
 * ./known-issues.ts and fails on anything else, naming the exact element so
 * the failure can be fixed or (if it is a real product defect that has to
 * wait) added to that list.
 *
 * The checks fail "softly": the test carries on, so one run reports every
 * finding on every page it visits instead of stopping at the first. Each
 * finding is also written, one JSON line apiece, to test-results/findings.jsonl,
 * which is the easy thing to read when there are many.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { knownIssueFor } from "./known-issues";

const MIN_TAP_PX = 44;
// Under Playwright's outputDir (playwright.config.ts), so it is wiped at the
// start of each run and travels with the failure report.
const FINDINGS_FILE = path.join(process.cwd(), "test-results", "findings.jsonl");

type Finding = { target: string; detail: string };

/** Write the findings down, then fail the test without stopping it. */
function report(page: Page, rule: string, findings: Finding[], headline: string): void {
  if (findings.length === 0) return;
  const pathname = pathOf(page);
  try {
    mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
    const project = test.info().project.name;
    for (const finding of findings) {
      appendFileSync(FINDINGS_FILE, JSON.stringify({ project, page: pathname, rule, ...finding }) + "\n");
    }
  } catch {
    // The list is a convenience; the failure below is what matters.
  }
  const lines = findings.map((finding) => `  ${finding.target}\n      ${finding.detail}`).join("\n");
  expect.soft(findings.length, `${pathname}: ${headline}\n${lines}\n`).toBe(0);
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/**
 * Wait for entrance animations to finish. Pages rise in and sheets slide up;
 * measured half-way, text is semi-transparent (a false contrast failure) and
 * boxes are mid-move. Spinners and skeleton shimmers never finish, so they
 * are left alone.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const running = () =>
      document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return animation.playState === "running" && timing !== undefined && timing.iterations !== Infinity;
      });
    const deadline = Date.now() + 3000;
    while (running().length > 0 && Date.now() < deadline) {
      await Promise.race([
        Promise.all(running().map((animation) => animation.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }
  });
}

/** The page fits the phone's width: nothing makes it scroll sideways. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  if (size.content <= size.viewport) return;
  if (knownIssueFor(pathOf(page), "sideways-scroll", "document")) return;
  report(page, "sideways-scroll", [{ target: "document", detail: `content is ${size.content}px wide on a ${size.viewport}px screen` }], "the page scrolls sideways");
}

type SmallTarget = { target: string; width: number; height: number };

/**
 * Every visible button, input, [role=button] and link that is styled as a
 * button is at least 44 x 44 CSS px.
 *
 * Links: a link counts as "styled as a button" when it is drawn as a box (a
 * fill, a border, rounded corners or padding of its own). A plain text link,
 * in a sentence or standing alone, is exempt. A tick box or radio dot is
 * measured with its label, because the label is what gets tapped.
 */
export async function expectTapTargets(page: Page): Promise<void> {
  const small = await page.evaluate((min): SmallTarget[] => {
    const drawnAsBox = (link: HTMLElement): boolean => {
      const style = getComputedStyle(link);
      if (style.display === "inline") return false;
      const filled = !/rgba\(.*,\s*0\)$|^transparent$/.test(style.backgroundColor);
      const bordered = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
      const rounded = parseFloat(style.borderTopLeftRadius) > 0;
      const padded = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some(
        (side) => parseFloat(style[side as "paddingTop"]) > 0,
      );
      return filled || bordered || rounded || padded;
    };

    const describe = (el: HTMLElement): string => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const label = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.labels?.[0]?.innerText : "";
      const name = (el.getAttribute("aria-label") || label || el.innerText || el.getAttribute("placeholder") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      const type = el instanceof HTMLInputElement ? `[type=${el.type}]` : "";
      return `${tag}${role ? `[role=${role}]` : ""}${type} "${name}"`;
    };

    const found: SmallTarget[] = [];
    const candidates = document.querySelectorAll<HTMLElement>(
      'button, [role="button"], input:not([type="hidden"]), select, textarea, a[href]',
    );
    for (const el of Array.from(candidates)) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      if (el.tagName === "A" && !el.hasAttribute("role") && !drawnAsBox(el)) continue;

      const tickOrDot = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
      const box = ((tickOrDot && el.closest("label")) || el).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // 0.1 px of slack: layout rounding, not a design choice.
      if (box.width >= min - 0.1 && box.height >= min - 0.1) continue;

      found.push({ target: describe(el), width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 });
    }
    return found;
  }, MIN_TAP_PX);

  const pathname = pathOf(page);
  const unexpected = small
    .filter((item) => !knownIssueFor(pathname, "tap-target-44", item.target))
    .map((item) => ({ target: item.target, detail: `is ${item.width} x ${item.height}` }));
  report(page, "tap-target-44", unexpected, `tap targets under ${MIN_TAP_PX} x ${MIN_TAP_PX} px`);
}

/**
 * axe-core, WCAG 2.1 levels A and AA: no violations.
 *
 * A finding's target is the selector axe reports. For "color-contrast" the
 * two colours are added, e.g. `.ui-footnote (#86868b on #ffffff)`: the same
 * token misused in fifty places is one defect, and known-issues.ts lists it
 * once by its colours.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

  const pathname = pathOf(page);
  const byRule = new Map<string, Finding[]>();
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const check = node.any[0] ?? node.all[0] ?? node.none[0];
      const colours = check?.data as { fgColor?: string; bgColor?: string } | undefined;
      const selector = node.target.join(" ");
      const target = violation.id === "color-contrast" && colours?.fgColor ? `${selector} (${colours.fgColor} on ${colours.bgColor})` : selector;
      if (knownIssueFor(pathname, violation.id, target)) continue;
      const finding = { target, detail: `${check?.message ?? violation.help} | ${node.html.slice(0, 180)}` };
      byRule.set(violation.id, [...(byRule.get(violation.id) ?? []), finding]);
    }
  }
  for (const [rule, findings] of Array.from(byRule)) report(page, rule, findings, `accessibility: ${rule}`);
}

/** All three checks, once the page has stopped moving. */
export async function checkPage(page: Page): Promise<void> {
  await settle(page);
  await expectNoSidewaysScroll(page);
  await expectTapTargets(page);
  await expectAccessible(page);
}
