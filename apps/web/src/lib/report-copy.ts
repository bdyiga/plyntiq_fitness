/**
 * Every sentence the Translation report shows. The PRD forbids causal claims:
 * the report puts two measured changes side by side "over the same period" and
 * never says one produced the other. `report-copy.test.ts` fails the build if a
 * causal phrase appears here or in the rendered page.
 */
import type { DataQualityFlag } from "@plyntiq/analytics";
import { roundTo } from "@plyntiq/shared";

export const REPORT_INTRO =
  "Each card puts the change in one lift next to the change in one test, over the same period. " +
  "It shows what was measured, not why: sport training, sleep, testing conditions and many other things also affect results.";

export const SIDE_BY_SIDE_NOTE =
  "These are two separate measurements shown together. They can't show whether one change is responsible for the other.";

/** "≈ 3.1%" when rounding hides digits, "12.0%" when it doesn't. */
export function formatPercent(value: number): string {
  const abs = Math.abs(value);
  const rounded = roundTo(abs, 1);
  return `${Math.abs(rounded - abs) > 1e-9 ? "≈ " : ""}${rounded.toFixed(1)}%`;
}

/** Direction words for a test result: positive improvement is faster (sprint) or higher (jump). */
export function assessmentChangeText(percentImprovement: number, betterDirection: "lower" | "higher"): string {
  if (Math.abs(percentImprovement) < 1e-9) return "no change";
  const better = percentImprovement > 0;
  const word = betterDirection === "lower" ? (better ? "faster" : "slower") : better ? "higher" : "lower";
  return `${formatPercent(percentImprovement)} ${word}`;
}

export function trainingChangeText(percentChange: number): string {
  if (Math.abs(percentChange) < 1e-9) return "no change";
  return `${formatPercent(percentChange)} ${percentChange > 0 ? "higher" : "lower"}`;
}

export function summarySentence(p: {
  from: string;
  to: string;
  days: number;
  exerciseName: string;
  trainingChange: string;
  testName: string;
  testChange: string;
}): string {
  return (
    `Over the same period (${p.from} to ${p.to}, ${p.days} days), your estimated ${p.exerciseName} 1RM was ` +
    `${p.trainingChange} and your ${p.testName} result was ${p.testChange}.`
  );
}

interface FlagContext {
  testName: string;
  exerciseName: string | null;
  firstMethods: string;
  latestMethods: string;
}

/** Plain-language notes for each data-quality flag. Shown as text, never as a score. */
export function flagMessage(flag: DataQualityFlag, ctx: FlagContext): string {
  switch (flag) {
    case "insufficient_assessments":
      return `You need ${ctx.testName} results on at least two different days to see a change.`;
    case "insufficient_training":
      return ctx.exerciseName
        ? `There are no ${ctx.exerciseName} sets of 1–10 reps in the 14 days up to your first or latest test, so there's no training change to show.`
        : "Log a lower-body lift, such as a squat or deadlift, to see training next to your test results.";
    case "short_window":
      return "Your first and latest tests are less than 4 weeks apart. Over short periods, changes are often day-to-day variation.";
    case "method_changed":
      return `Your first and latest tests used different methods (${ctx.firstMethods}, then ${ctx.latestMethods}), so the results may not be directly comparable.`;
    case "conditions_differ":
      return "The surface or footwear was different between your first and latest tests, which can affect results.";
    case "stale_assessment":
      return "Your latest test is more than 60 days old. A new test would show where you are now.";
    case "within_typical_noise":
      return "The change is smaller than the usual test-to-test variation for hand timing (about 0.15 s), so it may not be a real change.";
  }
}
