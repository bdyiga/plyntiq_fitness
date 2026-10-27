/**
 * Calendar helpers for `YYYY-MM-DD` training dates (ADR 0004). Dates are local
 * calendar days with no time zone, so all arithmetic runs on UTC midnights and
 * daylight-saving changes cannot shift a day.
 */
import type { IsoDate } from "./types";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DateError extends Error {
  override name = "DateError";
}

function toUtcMs(date: IsoDate): number {
  if (!ISO_DATE.test(date)) throw new DateError(`Not a YYYY-MM-DD date: ${date}`);
  const ms = Date.parse(`${date}T00:00:00Z`);
  // Date.parse accepts 2026-02-30 by rolling over; reject anything that doesn't round-trip.
  if (Number.isNaN(ms) || fromUtcMs(ms) !== date) throw new DateError(`Not a real date: ${date}`);
  return ms;
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** The Monday that starts the ISO week containing `date`. */
export function weekStart(date: IsoDate): IsoDate {
  const ms = toUtcMs(date);
  const mondayOffset = (new Date(ms).getUTCDay() + 6) % 7;
  return fromUtcMs(ms - mondayOffset * DAY_MS);
}

/** ISO 8601 week label, e.g. `2026-W05`. The week belongs to the year of its Thursday. */
export function isoWeek(date: IsoDate): string {
  const thursday = new Date(toUtcMs(weekStart(date)) + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of every ISO week from the week of `from` to the week of `to`, inclusive. */
export function weeksInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  if (daysBetween(from, to) < 0) throw new DateError("`from` must not be after `to`");
  const weeks: IsoDate[] = [];
  for (let w = weekStart(from); daysBetween(w, to) >= 0; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

/** Inclusive on both ends. */
export function isWithin(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}
