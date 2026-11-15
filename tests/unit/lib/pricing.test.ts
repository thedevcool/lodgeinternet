/**
 * Guards lib/pricing.ts: what a customer is shown and charged for a plan.
 *
 * The backend quotes `total` with every plan and checks the payment against
 * it (P1, P2), so the website must show that figure untouched. The formula
 * here is only a fallback for a plan that arrives without a total. If the
 * website ever showed its own arithmetic over the server's figure, the amount
 * quoted and the amount charged could differ.
 */
import { describe, expect, it } from "vitest";
import { BANK_CHARGE_NAIRA, checkoutTotal, planTotal } from "@/lib/pricing";

describe("what a plan costs", () => {
  it("shows the server's total when the plan has one", () => {
    expect(planTotal({ price: 3000, total: 3304 })).toBe(3304);
  });

  it("shows the server's total even when the fallback formula would say something else", () => {
    // 3,000 works out to 3,304 by the formula; the server's word still wins.
    expect(checkoutTotal(3000)).toBe(3304);
    expect(planTotal({ price: 3000, total: 3350 })).toBe(3350);
  });

  it("shows a server total of zero as zero, not the formula's figure", () => {
    expect(planTotal({ price: 3000, total: 0 })).toBe(0);
  });

  it("falls back to the formula only when the plan has no total", () => {
    expect(planTotal({ price: 3000 })).toBe(3304);
    expect(planTotal({ price: 3000, total: undefined })).toBe(3304);
  });
});

describe("the fallback formula", () => {
  it("adds the ₦100 bank charge, then the 5% service fee, then the 1.5% processing fee", () => {
    // (3,000 + 100) × 1.05 × 1.015 = 3,303.825, which rounds to 3,304.
    expect(BANK_CHARGE_NAIRA).toBe(100);
    expect(checkoutTotal(3000)).toBe(3304);
    // (500 + 100) × 1.05 × 1.015 = 639.45, which rounds to 639.
    expect(checkoutTotal(500)).toBe(639);
  });

  it("always gives whole naira", () => {
    for (const price of [0, 1, 99, 150, 333, 500, 1250, 2999, 3000, 7777, 15000, 49999]) {
      expect(Number.isInteger(checkoutTotal(price)), `total for a ₦${price} plan`).toBe(true);
    }
  });

  it("charges only the fees on the bank charge for a free plan", () => {
    // (0 + 100) × 1.05 × 1.015 = 106.575, which rounds to 107.
    expect(checkoutTotal(0)).toBe(107);
  });
});
