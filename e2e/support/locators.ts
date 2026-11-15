/**
 * Locators the specs share that plain `getByRole` can't express.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * The error message on the page (role "alert").
 *
 * Next.js keeps an invisible, empty role="alert" element on every page (its
 * route announcer for screen readers), so `page.getByRole("alert")` alone
 * always finds two. This is the site's own.
 */
export function alertOn(page: Page): Locator {
  return page.getByRole("alert").and(page.locator(":not(#__next-route-announcer__)"));
}
