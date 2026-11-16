/**
 * Welcome codes (the giveaway), as the admin console sees them.
 *
 * The shapes here are what the backend sends (backend/app/routers/
 * admin_giveaways.py); the browser decides nothing about who may claim. The
 * only logic is turning the dates an admin picks into the instants the
 * backend stores: a giveaway starts at the first minute of its first day and
 * ends at the last second of its last day, in the admin's own time zone.
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

export type GiveawayController = {
  id: string;
  name: string;
  bonusWords: string[];
  bonusAvailable: number;
  bonusClaimed: number;
  /** What the next code gives ("2GB for 1 day, up to 3 devices"), if any is left. */
  gives: string | null;
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
  defaultBonusWords: string[];
  controllers: GiveawayController[];
  hostels: GiveawayHostel[];
};

export const STATUS_LABEL: Record<GiveawayStatus, string> = {
  off: "Off",
  not_started: "Not started",
  ended: "Ended",
  out_of_codes: "Out of codes",
  open: "On",
};

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
