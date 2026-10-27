/**
 * Performance Translation Engine (analytics.md). Puts the change in one lift's
 * estimated 1RM next to the change in one assessment over the same period.
 * It describes two measured changes side by side; it does not relate them,
 * score them or say that one caused the other.
 */
import { dailyAssessmentValues, type DailyAssessment } from "./assessments";
import { percentChange } from "./change";
import { addDays, daysBetween } from "./dates";
import { bestE1rmInRange } from "./strength";
import type { AssessmentInput, BetterDirection, DataQualityFlag, IsoDate, StrengthSetInput } from "./types";

/** Training baselines are the best e1RM in the 14 days up to and including an assessment date. */
export const BASELINE_DAYS = 14;
export const SHORT_WINDOW_DAYS = 28;
export const STALE_AFTER_DAYS = 60;

/**
 * Typical test-to-test variability, in canonical units, by assessment and method.
 * Only hand-timed sprints have a value so far (analytics.md: ±0.1–0.2 s, midpoint).
 * Other methods get no `within_typical_noise` flag until the M4 evidence table
 * verifies a value for them. We don't invent one.
 */
export const TYPICAL_NOISE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  sprint_20m: { hand_timed: 0.15 },
};

export interface TranslationInput {
  definitionId: string;
  betterDirection: BetterDirection;
  assessments: readonly AssessmentInput[];
  /** The one exercise being compared, or null when the athlete has none to compare. */
  exerciseId: string | null;
  sets: readonly StrengthSetInput[];
  /** The athlete's current local date, for the staleness check. */
  today: IsoDate;
}

export interface TranslationPoint {
  date: IsoDate;
  value: number;
}

export interface TrainingPoint {
  /** Date of the set that produced the best estimate in the baseline window. */
  date: IsoDate;
  e1rmKg: number;
  reps: number;
  loadKg: number;
}

export interface TranslationResult {
  definitionId: string;
  exerciseId: string | null;
  window: { from: IsoDate; to: IsoDate; days: number } | null;
  assessment: {
    first: DailyAssessment | null;
    latest: DailyAssessment | null;
    /** latest − first, canonical units. */
    absoluteChange: number | null;
    /** Positive = improved, whatever the direction. */
    percentImprovement: number | null;
    points: TranslationPoint[];
  };
  training: {
    baseline: TrainingPoint | null;
    current: TrainingPoint | null;
    absoluteChangeKg: number | null;
    percentChange: number | null;
  };
  dataQuality: DataQualityFlag[];
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Differ only when both days recorded the attribute; an unrecorded one is unknown, not different. */
function recordedAndDifferent(a: readonly string[], b: readonly string[]): boolean {
  return a.length > 0 && b.length > 0 && !sameValues(a, b);
}

export function translate(input: TranslationInput): TranslationResult {
  const days = dailyAssessmentValues(input.assessments);
  const flags = new Set<DataQualityFlag>();
  const first = days[0] ?? null;
  const latest = days.length >= 2 ? days[days.length - 1]! : null;

  const result: TranslationResult = {
    definitionId: input.definitionId,
    exerciseId: input.exerciseId,
    window: null,
    assessment: {
      first,
      latest,
      absoluteChange: null,
      percentImprovement: null,
      points: days.map((d) => ({ date: d.date, value: d.value })),
    },
    training: { baseline: null, current: null, absoluteChangeKg: null, percentChange: null },
    dataQuality: [],
  };

  if (first === null || latest === null) {
    flags.add("insufficient_assessments");
    if (first && daysBetween(first.date, input.today) > STALE_AFTER_DAYS) flags.add("stale_assessment");
    result.dataQuality = [...flags];
    return result;
  }

  const windowDays = daysBetween(first.date, latest.date);
  result.window = { from: first.date, to: latest.date, days: windowDays };
  result.assessment.absoluteChange = latest.value - first.value;
  result.assessment.percentImprovement = percentChange(first.value, latest.value, input.betterDirection);

  const baseline = bestE1rmInRange(input.sets, addDays(first.date, -(BASELINE_DAYS - 1)), first.date);
  const current = bestE1rmInRange(input.sets, addDays(latest.date, -(BASELINE_DAYS - 1)), latest.date);
  result.training.baseline = baseline;
  result.training.current = current;
  if (baseline && current) {
    result.training.absoluteChangeKg = current.e1rmKg - baseline.e1rmKg;
    result.training.percentChange = percentChange(baseline.e1rmKg, current.e1rmKg, "higher");
  } else {
    flags.add("insufficient_training");
  }

  if (windowDays < SHORT_WINDOW_DAYS) flags.add("short_window");
  const methodChanged = !sameValues(first.methods, latest.methods);
  if (methodChanged) flags.add("method_changed");
  if (recordedAndDifferent(first.surfaces, latest.surfaces) || recordedAndDifferent(first.footwear, latest.footwear)) {
    flags.add("conditions_differ");
  }
  if (daysBetween(latest.date, input.today) > STALE_AFTER_DAYS) flags.add("stale_assessment");

  // Noise is only meaningful when both tests used the same single method.
  const method = !methodChanged && first.methods.length === 1 ? first.methods[0]! : null;
  const noise = method ? TYPICAL_NOISE[input.definitionId]?.[method] : undefined;
  if (noise !== undefined && Math.abs(latest.value - first.value) < noise) flags.add("within_typical_noise");

  result.dataQuality = [...flags];
  return result;
}
