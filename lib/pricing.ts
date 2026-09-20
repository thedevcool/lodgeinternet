/**
 * Checkout pricing — the single source of truth for what a customer pays.
 *
 * Plans are advertised at their bare price; checkout adds a ₦100 bank charge,
 * a 5% service fee, and the 1.5% payment-processing fee, all folded into one
 * charges line. Every site that charges or displays a total must go through
 * here: the figure quoted has to equal the figure charged, and the two plans
 * pages are near-duplicates that would otherwise drift apart.
 *
 * This deliberately differs from `bot_checkout_total` in the backend
 * (app/routers/bot_plans.py): the WhatsApp bot adds the 5% but not the 1.5%,
 * so the same plan costs slightly less there. Change one and the other does
 * not follow.
 */

export const BANK_CHARGE_NAIRA = 100;
export const SERVICE_FEE_RATE = 1.05;
export const PROCESSING_FEE_RATE = 1.015;

/** Total payable, in whole naira, for a plan at `price`. */
export function checkoutTotal(price: number): number {
  const subtotal = price + BANK_CHARGE_NAIRA;
  return Math.round(subtotal * SERVICE_FEE_RATE * PROCESSING_FEE_RATE);
}

/**
 * Everything added on top of the plan price, in whole naira.
 *
 * Shown as a single charges line rather than itemised, so a receipt still adds
 * up: price + charges === total.
 */
export function checkoutCharges(price: number): number {
  return checkoutTotal(price) - price;
}

// ─── Prefer the server's figures ─────────────────────────────────────────────
// The backend quotes `total` and `charges` with every plan and verifies the
// payment against that same total, so the browser no longer decides what a
// checkout costs. The formula above stays as a fallback for a plan served by
// an older backend, and the two agree by construction.

type PricedPlan = { price: number; total?: number; charges?: number };

/** What to charge for this plan. */
export function planTotal(plan: PricedPlan): number {
  return typeof plan.total === "number" ? plan.total : checkoutTotal(plan.price);
}

/** What to show on the "charges" line. */
export function planCharges(plan: PricedPlan): number {
  return typeof plan.charges === "number" ? plan.charges : checkoutCharges(plan.price);
}
