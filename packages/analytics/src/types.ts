/**
 * Inputs are canonical units only (kg, m, s, cm), mapped from the database by
 * the API. Original units never reach this package (ADR 0004).
 */

/** A local calendar day, `YYYY-MM-DD`. */
export type IsoDate = string;

export type BetterDirection = "higher" | "lower";

export interface StrengthSetInput {
  date: IsoDate;
  exerciseId: string;
  reps: number;
  loadKg: number;
}

export interface ConditioningInput {
  date: IsoDate;
  durationS: number;
  distanceM: number | null;
  /** CR-10 session RPE, 0–10. */
  sessionRpe: number;
}

export interface AssessmentInput {
  date: IsoDate;
  /** Seconds for sprints, centimetres for jumps. */
  valueCanonical: number;
  method: string;
  surface: string | null;
  footwear: string | null;
}

/** Shown to athletes as plain-language notes. Never turned into a confidence percentage. */
export type DataQualityFlag =
  | "insufficient_assessments"
  | "insufficient_training"
  | "short_window"
  | "method_changed"
  | "conditions_differ"
  | "stale_assessment"
  | "within_typical_noise";

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** One ISO week, identified by its Monday. */
export interface WeekKey {
  weekStart: IsoDate;
  isoWeek: string;
}
