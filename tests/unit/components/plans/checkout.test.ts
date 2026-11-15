/**
 * Guards components/plans/checkout.ts: saving a bought code on the buyer's
 * device, and the wording of a plan's duration line.
 *
 * The dashboard reads the saved codes back from localStorage["lodgeCodes"]
 * (app/(client)/dashboard/page.tsx, with `decryptFromStorage`), so the key
 * and the shape of each entry are a contract between the two files. The code
 * itself must never sit in storage as plain text.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptFromStorage } from "@/lib/localStorageCrypto";
import { durationLabel, planTypeLine, saveCodeToLocalStorage } from "@/components/plans/checkout";

const BUYER = "user-chiamaka-01";
const SOMEONE_ELSE = "user-tunde-02";

type Saved = { code: string; planName: string; savedAt: number };

function savedCodes(): Saved[] {
  return JSON.parse(localStorage.getItem("lodgeCodes") ?? "[]");
}

describe("saving a bought code on this device", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    return () => {
      vi.useRealTimers();
    };
  });

  it("keeps the code where the dashboard looks for it, with the plan and the time", async () => {
    await saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER);

    const saved = savedCodes();
    expect(saved).toHaveLength(1);
    expect(saved[0].planName).toBe("Weekly");
    expect(saved[0].savedAt).toBe(new Date("2026-11-15T10:00:00Z").getTime());
  });

  it("gives the code back to the customer who bought it", async () => {
    await saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER);

    expect(await decryptFromStorage(savedCodes()[0].code, BUYER)).toBe("LODGE-7H2K-99QX");
  });

  it("never leaves the code readable in storage", async () => {
    await saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER);

    const everythingStored = Object.keys(localStorage)
      .map((key) => `${key}=${localStorage.getItem(key)}`)
      .join("\n");
    expect(everythingStored).not.toContain("LODGE-7H2K-99QX");
    expect(everythingStored).not.toContain(BUYER);
  });

  it("does not give the code to another customer signed in on the same browser", async () => {
    await saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER);

    expect(await decryptFromStorage(savedCodes()[0].code, SOMEONE_ELSE)).toBeNull();
  });

  it("puts the newest code first and keeps the earlier ones", async () => {
    await saveCodeToLocalStorage("FIRST-CODE", "Daily", BUYER);
    await saveCodeToLocalStorage("SECOND-CODE", "Weekly", BUYER);

    const saved = savedCodes();
    expect(saved.map((entry) => entry.planName)).toEqual(["Weekly", "Daily"]);
    expect(await decryptFromStorage(saved[0].code, BUYER)).toBe("SECOND-CODE");
    expect(await decryptFromStorage(saved[1].code, BUYER)).toBe("FIRST-CODE");
  });

  it("keeps only the 20 most recent codes", async () => {
    const older: Saved[] = Array.from({ length: 20 }, (_, i) => ({ code: `encrypted-${i}`, planName: `Plan ${i}`, savedAt: 1 }));
    localStorage.setItem("lodgeCodes", JSON.stringify(older));

    await saveCodeToLocalStorage("NEWEST-CODE", "Weekly", BUYER);

    const saved = savedCodes();
    expect(saved).toHaveLength(20);
    expect(saved[0].planName).toBe("Weekly");
    expect(saved[19].planName).toBe("Plan 18");
  });

  it("does not stop the checkout when the browser blocks storage, and says why in the log without the code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await expect(saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("LODGE-7H2K-99QX");
  });

  // A damaged list used to make JSON.parse throw, the catch swallowed it,
  // and no code was ever saved on that device again.
  it("still saves a new code when the saved list in storage is damaged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("lodgeCodes", "{not json");

    await saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER);

    // The damaged value is replaced by a fresh list holding the new code.
    expect(localStorage.getItem("lodgeCodes")).not.toBe("{not json");
    expect(savedCodes()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh list when the saved value is not a list at all", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("lodgeCodes", JSON.stringify({ code: "old", planName: "Weekly" }));

    await saveCodeToLocalStorage("LODGE-7H2K-99QX", "Weekly", BUYER);

    expect(savedCodes()).toHaveLength(1);
    expect(savedCodes()[0].planName).toBe("Weekly");
  });
});

describe("a plan's duration label", () => {
  it("names a day, a week and a month", () => {
    expect(durationLabel(1)).toBe("Daily");
    expect(durationLabel(7)).toBe("Weekly");
    expect(durationLabel(30)).toBe("Monthly");
  });

  it("counts the days for any other length", () => {
    expect(durationLabel(14)).toBe("14-Day");
    expect(durationLabel(90)).toBe("90-Day");
  });

  it("reads as Monthly when the plan has no duration", () => {
    expect(durationLabel(undefined)).toBe("Monthly");
    expect(durationLabel(0)).toBe("Monthly");
  });
});

describe("the line under a plan's name", () => {
  it("gives a device plan's length and how many devices it covers", () => {
    expect(planTypeLine({ planType: "device", duration: 7, usersCount: 5 })).toBe("Weekly Plan • 5 Devices");
    expect(planTypeLine({ planType: "device", duration: 30, usersCount: 3 })).toBe("Monthly Plan • 3 Devices");
  });

  it("says Device, not Devices, for one", () => {
    expect(planTypeLine({ planType: "device", duration: 1, usersCount: 1 })).toBe("Daily Plan • 1 Device");
    expect(planTypeLine({ planType: "unlimited", duration: 7, usersCount: 1 })).toBe("7 Day Unlimited • 1 Device");
  });

  it("gives an unlimited plan's days, and its devices when it has a limit", () => {
    expect(planTypeLine({ planType: "unlimited", duration: 7, usersCount: 3 })).toBe("7 Day Unlimited • 3 Devices");
    expect(planTypeLine({ planType: "unlimited", duration: 7 })).toBe("7 Day Unlimited");
    expect(planTypeLine({ planType: "unlimited" })).toBe("Daily Unlimited");
  });

  it("gives a TV plan's length in days", () => {
    expect(planTypeLine({ planType: "tv", duration: 30 })).toBe("30 Days Subscription");
  });
});
