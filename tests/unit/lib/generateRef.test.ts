/**
 * Guards lib/generateRef.ts: the payment reference the website gives
 * Paystack (HOSTEL-PLANTYPE-YYYYMMDD-XXXXXX).
 *
 * Support reads these references to find a payment, and the customer is told
 * to keep theirs when a code is slow, so the shape has to stay readable and
 * free of characters Paystack would refuse.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePaymentRef } from "@/lib/generateRef";

const MARCH_9 = new Date(2026, 2, 9);

describe("a payment reference", () => {
  it("reads hostel, plan type, date, then six random characters", () => {
    expect(generatePaymentRef("Ayoni", "device", MARCH_9)).toMatch(/^AYONI-DEVICE-20260309-[A-Z0-9]{6}$/);
  });

  it("names the plan type: TV, UNLIM for unlimited, DEVICE for anything else", () => {
    expect(generatePaymentRef("Ayoni", "tv", MARCH_9)).toMatch(/^AYONI-TV-20260309-/);
    expect(generatePaymentRef("Ayoni", "unlimited", MARCH_9)).toMatch(/^AYONI-UNLIM-20260309-/);
    expect(generatePaymentRef("Ayoni", "device", MARCH_9)).toMatch(/^AYONI-DEVICE-20260309-/);
    expect(generatePaymentRef("Ayoni", "", MARCH_9)).toMatch(/^AYONI-DEVICE-20260309-/);
  });

  it("turns spaces in the hostel's name into dashes and drops punctuation", () => {
    expect(generatePaymentRef("Ayoni Block A", "device", MARCH_9)).toMatch(/^AYONI-BLOCK-A-DEVICE-20260309-/);
    expect(generatePaymentRef("Road 8, Iworoko", "tv", MARCH_9)).toMatch(/^ROAD-8-IWOROKO-TV-20260309-/);
    expect(generatePaymentRef("H’ALL En-Suite", "tv", MARCH_9)).toMatch(/^HALL-EN-SUITE-TV-20260309-/);
  });

  it("says UNKNOWN when there is no hostel", () => {
    expect(generatePaymentRef("", "device", MARCH_9)).toMatch(/^UNKNOWN-DEVICE-20260309-/);
  });

  it("pads single-digit months and days", () => {
    expect(generatePaymentRef("Ayoni", "tv", new Date(2027, 0, 5))).toMatch(/^AYONI-TV-20270105-/);
    expect(generatePaymentRef("Ayoni", "tv", new Date(2026, 11, 31))).toMatch(/^AYONI-TV-20261231-/);
  });

  it("only ever contains capitals, digits and dashes", () => {
    for (const hostel of ["Ayoni Block A", "St. Mary's (Annex)", "ß-Haus #4", "  spaced  out  "]) {
      expect(generatePaymentRef(hostel, "unlimited", MARCH_9)).toMatch(/^[A-Z0-9-]+$/);
    }
  });
});

describe("a payment reference made right now", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  it("uses today's date when none is given", () => {
    vi.setSystemTime(new Date(2026, 10, 15, 9, 30));
    expect(generatePaymentRef("Ayoni", "device")).toMatch(/^AYONI-DEVICE-20261115-[A-Z0-9]{6}$/);
  });

  it("takes its last six characters from chance, so two payments differ", () => {
    // Pin the dice to show where the suffix comes from: 0 picks "A", just
    // under 1 picks "9" (the last of the 36 characters).
    const dice = vi.spyOn(Math, "random");
    dice.mockReturnValue(0);
    expect(generatePaymentRef("Ayoni", "device", MARCH_9)).toBe("AYONI-DEVICE-20260309-AAAAAA");
    dice.mockReturnValue(0.999999);
    expect(generatePaymentRef("Ayoni", "device", MARCH_9)).toBe("AYONI-DEVICE-20260309-999999");
  });
});
