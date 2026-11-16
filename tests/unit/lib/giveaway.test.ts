/**
 * Guards lib/giveaway.ts: how the days an admin picks for a hostel's welcome
 * codes become the instants the backend stores.
 *
 * "New accounts only" means accounts made on or after the first instant, and
 * a claim is refused from the last one, so a day counted wrongly either shuts
 * residents out a day early or lets older accounts in.
 *
 * Also how the page words what the backend reported. A hostel switched on
 * with no codes yet once read as off, and a group skipped by the sync was
 * mentioned nowhere, so the owner could not tell why his codes had not come
 * (2026-11-16). Both are held here.
 */
import { describe, expect, it } from "vitest";
import {
  STATUS_CHIP,
  STATUS_LABEL,
  describeSync,
  endOfDayIso,
  formatDay,
  formatMoment,
  isSwitchedOn,
  isoToDateInput,
  lastDay,
  startOfDayIso,
  statusLabel,
  toDateInput,
  type BonusSyncReport,
  type GiveawayHostel,
} from "@/lib/giveaway";

function hostel(overrides: Partial<GiveawayHostel> = {}, maxCodes: number | null = null): GiveawayHostel {
  return {
    hostelId: "h1",
    hostel: "Palm Court",
    controllerId: "c1",
    controller: "Palm Controller",
    bonusAvailable: 0,
    claimed: 0,
    status: "out_of_codes",
    giveaway: {
      enabled: true,
      startsAt: "2026-11-15T00:00:00Z",
      endsAt: "2026-11-21T22:59:59Z",
      openTo: "new",
      maxCodes,
      posterPath: "/welcome/abc",
      updatedBy: "root",
      updatedAt: "2026-11-15T09:00:00Z",
    },
    ...overrides,
  };
}

function report(overrides: Partial<BonusSyncReport> = {}): BonusSyncReport {
  return {
    ranAt: "2026-11-16T13:05:00Z",
    groupsRead: 4,
    groups: [],
    misnamedGroups: [],
    blockedGroups: [],
    unused: 0,
    added: 0,
    withdrawn: 0,
    available: 0,
    ...overrides,
  };
}

const WORDS = { bonus: ["bonus", "giveaway"], blocked: ["test", "testing"] };

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

describe("a hostel that is switched on", () => {
  it("reads as on while it waits for its codes, never as off", () => {
    const waiting = hostel();

    expect(isSwitchedOn(waiting)).toBe(true);
    expect(statusLabel(waiting)).toBe("On · no codes ready");
  });

  it("says its limit is reached when that, not the stock, is what stopped it", () => {
    expect(statusLabel(hostel({ claimed: 50, bonusAvailable: 12 }, 50))).toBe("On · limit reached");
  });

  it("reads as on before its first day, and plainly on once it is giving", () => {
    expect(statusLabel(hostel({ status: "not_started" }))).toBe("On · not started");
    expect(statusLabel(hostel({ status: "open", bonusAvailable: 40 }))).toBe("On");
  });

  it("is off only when its switch is off or it was never set up", () => {
    const never = hostel({ status: "off", giveaway: null });
    const off = hostel({ status: "off" });
    off.giveaway!.enabled = false;

    expect([isSwitchedOn(never), statusLabel(never)]).toEqual([false, "Off"]);
    expect([isSwitchedOn(off), statusLabel(off)]).toEqual([false, "Off"]);
  });
});

describe("what a fetch of the controller's codes found", () => {
  it("counts the codes ready, the new ones, and names the group", () => {
    const said = describeSync(report({ groups: ["BONUS|2GB|3|1|0"], unused: 40, added: 40, available: 40 }), "Palm Controller", WORDS);

    expect(said).toEqual({ ok: true, found: "40 codes ready on Palm Controller (40 new), from BONUS|2GB|3|1|0.", skipped: [] });
  });

  it("says one code, not one codes, and leaves out the new count when none is new", () => {
    const said = describeSync(report({ groups: ["BONUS|2GB|3|1|0"], unused: 1, available: 1 }), "Palm Controller", WORDS);

    expect(said.found).toBe("1 code ready on Palm Controller, from BONUS|2GB|3|1|0.");
  });

  it("says no group has a bonus word, with the words to use", () => {
    const said = describeSync(report(), "Palm Controller", WORDS);

    expect(said.ok).toBe(false);
    expect(said.found).toBe(
      "None of the 4 voucher groups on Palm Controller is a bonus group. Its name needs a bonus word (bonus, giveaway).",
    );
  });

  it("says why a group with a bonus word was skipped: a loose name, or a blocked word", () => {
    const said = describeSync(
      report({ misnamedGroups: ["Bonus codes"], blockedGroups: ["BONUS TEST|2GB|3|1|0"] }),
      "Palm Controller",
      WORDS,
    );

    expect(said.skipped).toEqual([
      'Skipped "Bonus codes": the name must have five parts, like BONUS|2GB|3|1|0 (name, data, devices, days, price).',
      'Skipped "BONUS TEST|2GB|3|1|0": its name also has a blocked word (test, testing), and a blocked group is never read.',
    ]);
  });

  it("tells an empty group from one whose codes are all claimed, and from a controller that listed nothing", () => {
    const group = ["BONUS|2GB|3|1|0"];

    expect(describeSync(report({ groups: group }), "Palm Controller", WORDS).found).toBe(
      "BONUS|2GB|3|1|0 is on Palm Controller, but it holds no unused codes.",
    );
    expect(describeSync(report({ groups: group, unused: 3 }), "Palm Controller", WORDS).found).toBe(
      "Every code in BONUS|2GB|3|1|0 has been claimed.",
    );
    expect(describeSync(report({ groupsRead: 0 }), "Palm Controller", WORDS).found).toBe(
      "Palm Controller listed no voucher groups at all. Check its connection on the Controllers page.",
    );
  });

  it("shows when a fetch ran as day, month and time, and a missing one as a dash", () => {
    expect(formatMoment(new Date(2026, 10, 16, 14, 5).toISOString())).toBe("16 Nov, 14:05");
    expect(formatMoment(null)).toBe("—");
  });
});

