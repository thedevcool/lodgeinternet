/**
 * Checkout pricing — the single source of truth for what a customer pays.
 *
 * A plan's total is its price plus a ₦100 bank charge, a 5% service fee and
 * the 1.5% payment-processing fee. Customers only ever see that total, from
 * the plan list through to the Pay button: never the bare price with charges
 * added later. Every place that charges or displays a price must go through
 * here: the figure quoted has to equal the figure charged.
 *
 * The WhatsApp bot charges the same total: `bot_checkout_total` in the
 * backend (app/routers/bot_plans.py) delegates to the backend's
 * `site_checkout_total`. Change this formula and that one must change too.
 */

export const BANK_CHARGE_NAIRA = 100;
export const SERVICE_FEE_RATE = 1.05;
export const PROCESSING_FEE_RATE = 1.015;

/** Total payable, in whole naira, for a plan at `price`. */
export function checkoutTotal(price: number): number {
  const subtotal = price + BANK_CHARGE_NAIRA;
  return Math.round(subtotal * SERVICE_FEE_RATE * PROCESSING_FEE_RATE);
}

// ─── Prefer the server's figures ─────────────────────────────────────────────
// The backend quotes `total` with every plan and verifies the payment against
// that same total, so the browser no longer decides what a checkout costs. The
// formula above stays as a fallback for a plan served by an older backend, and
// the two agree by construction.

type PricedPlan = { price: number; total?: number };

/** What to show and charge for this plan. */
export function planTotal(plan: PricedPlan): number {
  return typeof plan.total === "number" ? plan.total : checkoutTotal(plan.price);
}
