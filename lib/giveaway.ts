/**
 * Welcome codes (the giveaway), as the admin console sees them.
 *
 * The shapes here are what the backend sends (backend/app/routers/
 * admin_giveaways.py); the browser decides nothing about who may claim. The
 * logic here is of two kinds. One turns the dates an admin picks into the
 * instants the backend stores: a giveaway starts at the first minute of its
 * first day and ends at the last second of its last day, in the admin's own
 * time zone. The other puts what the backend reported into words: a hostel's
 * chip, and what a fetch of the controller's codes found or skipped.
 */

export type GiveawayStatus = "off" | "not_started" | "ended" | "out_of_codes" | "open";

export type GiveawaySettings = {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  openTo: "new" | "everyone";
  maxCodes: number | null;
  /** The page the poster's QR code opens, e.g. "/welcome/abc…". */
  posterPath: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

/** One fetch of a controller's welcome codes: what it found and what it skipped. */
export type BonusSyncReport = {
  ranAt: string | null;
  /** Every voucher group the controller listed, bonus or not. */
  groupsRead: number;
  /** The bonus groups whose unused codes were taken in. */
  groups: string[];
  /** A bonus word in the name, but not the five-part name. Skipped. */
  misnamedGroups: string[];
  /** A bonus word and a blocked word in the name. Blocked wins. Skipped. */
  blockedGroups: string[];
  /** Unused vouchers in the bonus groups on the controller. */
  unused: number;
  added: number;
  withdrawn: number;
  /** Codes ready to give out after this fetch. */
  available: number;
};

export type GiveawayController = {
  id: string;
  name: string;
  bonusWords: string[];
  bonusAvailable: number;
  bonusClaimed: number;
  /** What the next code gives ("2GB for 1 day, up to 3 devices"), if any is left. */
  gives: string | null;
  /** The latest fetch of its codes, from this page or from a full sync. */
  lastBonusSync: BonusSyncReport | null;
};

export type GiveawayHostel = {
  hostelId: string;
  hostel: string;
  controllerId: string | null;
  controller: string | null;
  bonusAvailable: number;
  claimed: number;
  status: GiveawayStatus;
  giveaway: GiveawaySettings | null;
};

export type GiveawayOverview = {
  bonusWords: string[];
  /** Words that keep a group out of every sync ("test"). They beat a bonus word. */
  blockedWords: string[];
  defaultBonusWords: string[];
  controllers: GiveawayController[];
  hostels: GiveawayHostel[];
};

export const STATUS_LABEL: Record<GiveawayStatus, string> = {
  off: "Off",
  not_started: "On · not started",
  ended: "Ended",
  out_of_codes: "On · no codes ready",
  open: "On",
};

/**
 * What a hostel's chip says. The switch comes first: a hostel that is
 * switched on but has nothing to give yet reads "On", with what it is waiting
 * for. It used to read as off, which sent the admin back to a switch that was
 * already on.
 */
export function statusLabel(hostel: GiveawayHostel): string {
  const ceiling = hostel.giveaway?.maxCodes;
  if (hostel.status === "out_of_codes" && ceiling && hostel.claimed >= ceiling) return "On · limit reached";
  return STATUS_LABEL[hostel.status];
}

/** Whether the hostel's switch is on, whatever its dates or its stock. */
export function isSwitchedOn(hostel: GiveawayHostel): boolean {
  return hostel.giveaway?.enabled === true;
}

/** Whole class strings: Tailwind can't see a class assembled at runtime. */
export const STATUS_CHIP: Record<GiveawayStatus, string> = {
  off: "slate-chip",
  not_started: "warning-chip",
  ended: "slate-chip",
  out_of_codes: "warning-chip",
  open: "status-chip",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A date as the `<input type="date">` value for the admin's own time zone. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The stored instant back to the day the admin picked ("" when unset). */
export function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : toDateInput(date);
}

/** The day `days` after a picked day: a 7-day giveaway from the 1st ends on the 7th. */
export function lastDay(firstDay: string, days: number): string {
  const [year, month, day] = firstDay.split("-").map(Number);
  return toDateInput(new Date(year, month - 1, day + days - 1));
}

/** The first minute of a picked day, as the instant the backend stores. */
export function startOfDayIso(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 0, 0, 0).toISOString();
}

/** The last second of a picked day. */
export function endOfDayIso(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 23, 59, 59).toISOString();
}

/** "15 Nov 2026", for a stored instant. */
export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "16 Nov, 14:05", for when a fetch ran. */
export function formatMoment(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * A fetch of a controller's codes, in words: one line for what it found, and
 * one for each group it skipped, with the reason. The skipped lines are the
 * point. A group named for the giveaway that brings no codes must say why on
 * the page, or the admin can only guess.
 */
export function describeSync(
  report: BonusSyncReport,
  controller: string,
  words: { bonus: string[]; blocked: string[] },
): { ok: boolean; found: string; skipped: string[] } {
  const groups = report.groups.join(", ");
  let found: string;
  if (report.groups.length > 0 && report.available > 0) {
    const fresh = report.added > 0 ? ` (${report.added} new)` : "";
    found = `${count(report.available, "code")} ready on ${controller}${fresh}, from ${groups}.`;
  } else if (report.groups.length > 0 && report.unused === 0) {
    found = `${groups} is on ${controller}, but it holds no unused codes.`;
  } else if (report.groups.length > 0) {
    found = `Every code in ${groups} has been claimed.`;
  } else if (report.groupsRead === 0) {
    found = `${controller} listed no voucher groups at all. Check its connection on the Controllers page.`;
  } else {
    found = `None of the ${count(report.groupsRead, "voucher group")} on ${controller} is a bonus group. Its name needs a bonus word (${words.bonus.join(", ")}).`;
  }

  const skipped = [
    ...report.misnamedGroups.map(
      (name) => `Skipped "${name}": the name must have five parts, like BONUS|2GB|3|1|0 (name, data, devices, days, price).`,
    ),
    ...report.blockedGroups.map(
      (name) => `Skipped "${name}": its name also has a blocked word (${words.blocked.join(", ")}), and a blocked group is never read.`,
    ),
  ];
  return { ok: report.available > 0, found, skipped };
}
