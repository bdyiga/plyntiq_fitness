import { isoWeek, weekStart, weeksInRange } from "./dates";
import type { ConditioningInput, IsoDate, WeekKey } from "./types";

/**
 * Session-RPE load: duration in minutes × CR-10 session RPE, in arbitrary
 * units. An estimate of how hard a session felt, **not a measurement of fatigue**.
 */
export function sessionRpeLoad(durationS: number, sessionRpe: number): number {
  return (durationS / 60) * sessionRpe;
}

export interface WeeklyConditioning extends WeekKey {
  sessions: number;
  durationS: number;
  /** Sum of the sessions that recorded a distance. */
  distanceM: number;
  srpeLoad: number;
}

/** Weekly totals across [from, to]. Weeks without sessions are included as 0. */
export function weeklyConditioning(
  sessions: readonly ConditioningInput[],
  from: IsoDate,
  to: IsoDate,
): WeeklyConditioning[] {
  const weeks = new Map(
    weeksInRange(from, to).map((w) => [
      w,
      { weekStart: w, isoWeek: isoWeek(w), sessions: 0, durationS: 0, distanceM: 0, srpeLoad: 0 },
    ]),
  );
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    const week = weeks.get(weekStart(s.date));
    if (!week) continue;
    week.sessions += 1;
    week.durationS += s.durationS;
    week.distanceM += s.distanceM ?? 0;
    week.srpeLoad += sessionRpeLoad(s.durationS, s.sessionRpe);
  }
  return [...weeks.values()];
}
