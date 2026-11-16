/**
 * Guards lib/giveaway.ts: how the days an admin picks for a hostel's welcome
 * codes become the instants the backend stores.
 *
 * "New accounts only" means accounts made on or after the first instant, and
 * a claim is refused from the last one, so a day counted wrongly either shuts
 * residents out a day early or lets older accounts in.
 */
import { describe, expect, it } from "vitest";
import {
  STATUS_CHIP,
  STATUS_LABEL,
  endOfDayIso,
  formatDay,
  isoToDateInput,
  lastDay,
  startOfDayIso,
  toDateInput,
} from "@/lib/giveaway";

describe("the last day of a giveaway", () => {
  it("counts the first day: one week from the 15th ends on the 21st", () => {
    expect(lastDay("2026-11-15", 7)).toBe("2026-11-21");
  });

  it("two weeks from the 15th ends on the 28th", () => {
    expect(lastDay("2026-11-15", 14)).toBe("2026-11-28");
  });

  it("runs into the next month and the next year", () => {
    expect(lastDay("2026-11-28", 7)).toBe("2026-12-04");
    expect(lastDay("2026-12-28", 7)).toBe("2027-01-03");
  });
});

describe("a picked day as stored instants", () => {
  it("starts at the first minute of the day and ends at its last second, in the admin's time zone", () => {
    const start = new Date(startOfDayIso("2026-11-15"));
    const end = new Date(endOfDayIso("2026-11-15"));

    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 10, 15]);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    expect([end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([15, 23, 59, 59]);
  });

  it("comes back as the same day when the settings are opened again", () => {
    expect(isoToDateInput(startOfDayIso("2026-11-15"))).toBe("2026-11-15");
    expect(isoToDateInput(endOfDayIso("2026-11-28"))).toBe("2026-11-28");
  });

  it("is empty when nothing is stored or what is stored is not a date", () => {
    expect(isoToDateInput(null)).toBe("");
    expect(isoToDateInput("soon")).toBe("");
  });

  it("writes single-digit months and days with a leading zero", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("how a giveaway is shown", () => {
  it("has a label and a chip for every status the backend sends", () => {
    for (const status of ["off", "not_started", "ended", "out_of_codes", "open"] as const) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_CHIP[status]).toMatch(/-chip$/);
    }
  });

  it("shows a stored day as day, month, year, and a missing one as a dash", () => {
    expect(formatDay(startOfDayIso("2026-11-15"))).toBe("15 Nov 2026");
    expect(formatDay(null)).toBe("—");
  });
});
