/**
 * Driving the stand-in for Paystack (e2e/paystack-stub.js) from a spec:
 * wait for the checkout to open it, read what the website handed over, then
 * pay or close as the customer would.
 */
import { expect, type Page } from "@playwright/test";

/** What the website gave PaystackPop.setup() (the parts a test can compare). */
export type PaystackOptions = {
  key: string;
  email: string;
  /** In kobo. */
  amount: number;
  currency: string;
  ref: string;
  subaccount?: string;
  transaction_charge?: number;
  bearer?: string;
  metadata: { planId: string; planName: string; planType: string; hostel: string; reservationId?: string };
};

type PaystackStub = {
  opened: number;
  options: (PaystackOptions & { callback: unknown; onClose: unknown }) | null;
  pay: (reference?: string) => void;
  close: () => void;
};

declare global {
  interface Window {
    __paystack?: PaystackStub;
  }
}

/** How many times the card form has been opened on this page (0 if the script never loaded). */
export function paystackOpenCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__paystack?.opened ?? 0);
}

/** Wait until the checkout has opened Paystack, and return what it was given. */
export async function paystackOpened(page: Page): Promise<PaystackOptions> {
  await expect.poll(() => paystackOpenCount(page), { message: "Paystack was never opened" }).toBe(1);
  return page.evaluate(() => {
    // Functions can't cross to the test; everything else is copied as is.
    const { callback: _callback, onClose: _onClose, ...rest } = window.__paystack!.options!;
    return rest;
  });
}

/** The customer pays: Paystack calls the site back with the payment reference. */
export async function payWithPaystack(page: Page): Promise<void> {
  await page.evaluate(() => window.__paystack!.pay());
}

/** The customer shuts the card form without paying. */
export async function closePaystack(page: Page): Promise<void> {
  await page.evaluate(() => window.__paystack!.close());
}
