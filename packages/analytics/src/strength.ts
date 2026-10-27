import { isoWeek, weekStart, weeksInRange } from "./dates";
import type { IsoDate, StrengthSetInput, WeekKey } from "./types";

/** Epley is only used up to 10 reps; accuracy falls off with higher reps and near failure. */
export const E1RM_MAX_REPS = 10;

/** reps × load. Bodyweight sets (load 0) contribute 0: documented, not imputed. */
export function setVolume(set: Pick<StrengthSetInput, "reps" | "loadKg">): number {
  return set.reps * set.loadKg;
}

export function sessionVolume(sets: readonly Pick<StrengthSetInput, "reps" | "loadKg">[]): number {
  return sets.reduce((sum, s) => sum + setVolume(s), 0);
}

/**
 * Estimated 1-rep max (Epley): load × (1 + reps / 30). Always an estimate.
 * Returns null outside 1–10 whole reps or for unloaded sets, where the
 * formula says nothing useful. One rep returns the load itself.
 */
export function estimateOneRepMax(loadKg: number, reps: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > E1RM_MAX_REPS) return null;
  if (!Number.isFinite(loadKg) || loadKg <= 0) return null;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}

export interface WeeklyBestE1rm extends WeekKey {
  e1rmKg: number;
  /** The set that produced the estimate. */
  date: IsoDate;
  reps: number;
  loadKg: number;
}

/**
 * Best estimated 1RM per ISO week, for weeks that have at least one qualifying
 * set. Pass sets for a single exercise: e1RMs of different lifts aren't comparable.
 */
export function bestE1rmByWeek(sets: readonly StrengthSetInput[]): WeeklyBestE1rm[] {
  const best = new Map<IsoDate, WeeklyBestE1rm>();
  for (const s of sets) {
    const e1rmKg = estimateOneRepMax(s.loadKg, s.reps);
    if (e1rmKg === null) continue;
    const key = weekStart(s.date);
    const current = best.get(key);
    if (!current || e1rmKg > current.e1rmKg) {
      best.set(key, { weekStart: key, isoWeek: isoWeek(s.date), e1rmKg, date: s.date, reps: s.reps, loadKg: s.loadKg });
    }
  }
  return [...best.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** Best estimated 1RM among sets dated within [from, to], or null. */
export function bestE1rmInRange(sets: readonly StrengthSetInput[], from: IsoDate, to: IsoDate) {
  let best: { e1rmKg: number; date: IsoDate; reps: number; loadKg: number } | null = null;
  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    const e1rmKg = estimateOneRepMax(s.loadKg, s.reps);
    if (e1rmKg !== null && (best === null || e1rmKg > best.e1rmKg)) {
      best = { e1rmKg, date: s.date, reps: s.reps, loadKg: s.loadKg };
    }
  }
  return best;
}

export interface WeeklyVolume extends WeekKey {
  volumeKg: number;
  sets: number;
}

/** Total volume per ISO week across [from, to]. Weeks without sets are included as 0. */
export function weeklyVolume(sets: readonly StrengthSetInput[], from: IsoDate, to: IsoDate): WeeklyVolume[] {
  const weeks = new Map(
    weeksInRange(from, to).map((w) => [w, { weekStart: w, isoWeek: isoWeek(w), volumeKg: 0, sets: 0 }]),
  );
  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    const week = weeks.get(weekStart(s.date));
    if (!week) continue;
    week.volumeKg += setVolume(s);
    week.sets += 1;
  }
  return [...weeks.values()];
}

export type PersonalRecord =
  | { kind: "rep_max"; date: IsoDate; reps: number; loadKg: number; previousBestKg: number }
  | { kind: "e1rm"; date: IsoDate; reps: number; loadKg: number; e1rmKg: number; previousBestKg: number };

/**
 * Personal records for one exercise, in date order. A set is a PR when it is
 * strictly greater than every earlier set: the heaviest load for that rep
 * count (`rep_max`), or the best estimated 1RM (`e1rm`). Ties are not PRs.
 * The first set at a rep count only sets the baseline; nothing earlier was beaten.
 * Sets on the same date are compared in the order given.
 */
export function personalRecords(sets: readonly StrengthSetInput[]): PersonalRecord[] {
  // Stable sort keeps the given order within a date.
  const ordered = sets.map((s, i) => ({ s, i })).sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i);
  const bestByReps = new Map<number, number>();
  let bestE1rm: number | null = null;
  const records: PersonalRecord[] = [];

  for (const { s } of ordered) {
    if (s.loadKg <= 0) continue;
    const previous = bestByReps.get(s.reps);
    if (previous === undefined) bestByReps.set(s.reps, s.loadKg);
    else if (s.loadKg > previous) {
      records.push({ kind: "rep_max", date: s.date, reps: s.reps, loadKg: s.loadKg, previousBestKg: previous });
      bestByReps.set(s.reps, s.loadKg);
    }

    const e1rmKg = estimateOneRepMax(s.loadKg, s.reps);
    if (e1rmKg === null) continue;
    if (bestE1rm === null) bestE1rm = e1rmKg;
    else if (e1rmKg > bestE1rm) {
      records.push({ kind: "e1rm", date: s.date, reps: s.reps, loadKg: s.loadKg, e1rmKg, previousBestKg: bestE1rm });
      bestE1rm = e1rmKg;
    }
  }
  return records;
}

/**
 * The exercise logged on the most distinct dates within [from, to]; ties go
 * to the one logged most recently, then to the lower ID. Callers pass only the
 * exercises that qualify (for translation: lower-body lifts).
 */
export function mostLoggedExercise(sets: readonly StrengthSetInput[], from: IsoDate, to: IsoDate): string | null {
  const dates = new Map<string, Set<IsoDate>>();
  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    let d = dates.get(s.exerciseId);
    if (!d) dates.set(s.exerciseId, (d = new Set()));
    d.add(s.date);
  }
  const ranked = [...dates.entries()].map(([id, d]) => ({ id, count: d.size, last: [...d].sort().at(-1)! }));
  ranked.sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.id.localeCompare(b.id));
  return ranked[0]?.id ?? null;
}
