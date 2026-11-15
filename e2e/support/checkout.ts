/**
 * The steps every buying test repeats on a hostel's plans page: pick a plan,
 * open the checkout sheet, press Pay. Kept here so the specs read as what the
 * customer does, and so a change to the checkout's wording is fixed once.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** The plan cards for the open tab. */
export function planCards(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Plans" });
}

/** One plan's card, by the plan's name. */
export function planCard(page: Page, name: string): Locator {
  return planCards(page).getByRole("radio", { name: new RegExp(name) });
}

/** The "Complete your payment" sheet. */
export function checkoutSheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Complete your payment" });
}

/** Tap a plan, then Continue on the bar that rises: the checkout sheet is open. */
export async function openCheckout(page: Page, planName: string): Promise<Locator> {
  await planCard(page, planName).click();
  await expect(planCard(page, planName)).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  const sheet = checkoutSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * The one-time warning before the first card payment ("keep this page open
 * until your code is displayed"). The only way on is "I Understand".
 */
export async function acknowledgePaymentWarning(page: Page): Promise<void> {
  const warning = page.getByRole("alertdialog", { name: "Before you pay" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "I Understand" }).click();
  await expect(warning).toBeHidden();
}
