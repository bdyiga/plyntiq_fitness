import { isoWeek, weekStart, weeksInRange } from "./dates";
import type { IsoDate, WeekKey } from "./types";

export interface WeeklyFrequency extends WeekKey {
  /** Distinct training dates in the week. */
  sessions: number;
}

/** Distinct training dates per ISO week across [from, to]. Weeks with no sessions count as 0. */
export function weeklyFrequency(dates: readonly IsoDate[], from: IsoDate, to: IsoDate): WeeklyFrequency[] {
  const perWeek = new Map(weeksInRange(from, to).map((w) => [w, new Set<IsoDate>()]));
  for (const d of dates) {
    if (d < from || d > to) continue;
    perWeek.get(weekStart(d))?.add(d);
  }
  return [...perWeek.entries()].map(([w, set]) => ({ weekStart: w, isoWeek: isoWeek(w), sessions: set.size }));
}

export interface Consistency {
  weeksWithTraining: number;
  weeksInRange: number;
  /** weeksWithTraining ÷ weeksInRange, 0–1. Descriptive only. */
  ratio: number;
}

/** Share of ISO weeks in [from, to] with at least one session. */
export function consistency(dates: readonly IsoDate[], from: IsoDate, to: IsoDate): Consistency {
  const weeks = weeklyFrequency(dates, from, to);
  const weeksWithTraining = weeks.filter((w) => w.sessions > 0).length;
  return { weeksWithTraining, weeksInRange: weeks.length, ratio: weeksWithTraining / weeks.length };
}
