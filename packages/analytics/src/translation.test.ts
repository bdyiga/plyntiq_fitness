import { describe, expect, it } from "vitest";
import { dailyAssessmentValues } from "./assessments";
import { ChangeError, percentChange } from "./change";
import { translate, type TranslationInput } from "./translation";
import type { AssessmentInput, StrengthSetInput } from "./types";

describe("percent change", () => {
  it("matches the PRD examples, positive = improved", () => {
    expect(percentChange(100, 112, "higher")).toBeCloseTo(12.0, 10);
    expect(percentChange(3.2, 3.1, "lower")).toBeCloseTo(3.125, 10);
  });

  it("is negative when performance got worse", () => {
    expect(percentChange(3.1, 3.2, "lower")).toBeLessThan(0);
    expect(percentChange(60, 57, "higher")).toBeCloseTo(-5, 10);
  });

  it("rejects a zero, negative or non-finite first value", () => {
    expect(() => percentChange(0, 1, "higher")).toThrow(ChangeError);
    expect(() => percentChange(-1, 1, "higher")).toThrow(ChangeError);
    expect(() => percentChange(Number.NaN, 1, "lower")).toThrow(ChangeError);
  });
});

const sprint = (date: string, value: number, extra: Partial<AssessmentInput> = {}): AssessmentInput => ({
  date,
  valueCanonical: value,
  method: "timing_gates",
  surface: "grass",
  footwear: "boots",
  ...extra,
});
const squat = (date: string, reps: number, loadKg: number): StrengthSetInput => ({
  date,
  exerciseId: "back_squat",
  reps,
  loadKg,
});

function input(overrides: Partial<TranslationInput>): TranslationInput {
  return {
    definitionId: "sprint_20m",
    betterDirection: "lower",
    exerciseId: "back_squat",
    assessments: [sprint("2026-08-01", 3.2), sprint("2026-10-01", 3.1)],
    sets: [squat("2026-07-25", 1, 100), squat("2026-09-28", 1, 112)],
    today: "2026-10-15",
    ...overrides,
  };
}

describe("daily assessment values", () => {
  it("averages same-day trials and sorts by date", () => {
    const days = dailyAssessmentValues([
      sprint("2026-10-01", 3.1),
      sprint("2026-08-01", 3.2),
      sprint("2026-10-01", 3.3, { method: "hand_timed", surface: null }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-08-01", "2026-10-01"]);
    expect(days[1]!.value).toBeCloseTo(3.2, 10);
    expect(days[1]).toMatchObject({ trials: 2, methods: ["hand_timed", "timing_gates"], surfaces: ["grass"] });
  });
});

describe("translation engine", () => {
  it("reports both changes side by side for the PRD example, with no flags", () => {
    const r = translate(input({}));
    expect(r.window).toEqual({ from: "2026-08-01", to: "2026-10-01", days: 61 });
    expect(r.assessment.absoluteChange).toBeCloseTo(-0.1, 10);
    expect(r.assessment.percentImprovement).toBeCloseTo(3.125, 10);
    expect(r.training.baseline).toMatchObject({ date: "2026-07-25", e1rmKg: 100 });
    expect(r.training.current).toMatchObject({ date: "2026-09-28", e1rmKg: 112 });
    expect(r.training.percentChange).toBeCloseTo(12, 10);
    expect(r.dataQuality).toEqual([]);
  });

  it("uses the 14 days up to and including each assessment for the training baselines", () => {
    const r = translate(
      input({
        sets: [
          squat("2026-07-18", 1, 150), // 14 days before 08-01: outside the window
          squat("2026-07-19", 1, 100), // day 1 of the window
          squat("2026-08-01", 1, 101), // assessment day: inside
          squat("2026-08-02", 1, 200), // after: belongs to neither baseline
          squat("2026-10-01", 1, 112),
        ],
      }),
    );
    expect(r.training.baseline).toMatchObject({ date: "2026-08-01", e1rmKg: 101 });
    expect(r.training.current).toMatchObject({ date: "2026-10-01", e1rmKg: 112 });
  });

  it("flags insufficient assessments with fewer than 2 dates", () => {
    expect(translate(input({ assessments: [] })).dataQuality).toEqual(["insufficient_assessments"]);
    const sameDay = translate(input({ assessments: [sprint("2026-10-01", 3.1), sprint("2026-10-01", 3.0)] }));
    expect(sameDay.dataQuality).toEqual(["insufficient_assessments"]);
    expect(sameDay.window).toBeNull();
    expect(sameDay.assessment.percentImprovement).toBeNull();
  });

  it("flags a single old assessment as stale too", () => {
    const r = translate(input({ assessments: [sprint("2026-06-01", 3.2)] }));
    expect(r.dataQuality).toEqual(["insufficient_assessments", "stale_assessment"]);
  });

  it("flags insufficient training when either baseline window has no qualifying lift", () => {
    const r = translate(input({ sets: [squat("2026-09-28", 1, 112), squat("2026-07-25", 12, 80)] }));
    expect(r.dataQuality).toEqual(["insufficient_training"]);
    expect(r.training.baseline).toBeNull();
    expect(r.training.percentChange).toBeNull();
  });

  it("flags a window shorter than 28 days", () => {
    const r = translate(
      input({
        assessments: [sprint("2026-09-04", 3.2), sprint("2026-10-01", 3.1)],
        sets: [squat("2026-09-01", 1, 100), squat("2026-10-01", 1, 105)],
      }),
    );
    expect(r.window?.days).toBe(27);
    expect(r.dataQuality).toEqual(["short_window"]);
  });

  it("flags a change of method, and doesn't compare against noise across methods", () => {
    const r = translate(
      input({ assessments: [sprint("2026-08-01", 3.2, { method: "hand_timed" }), sprint("2026-10-01", 3.15)] }),
    );
    expect(r.dataQuality).toEqual(["method_changed"]);
  });

  it("flags different surface or footwear, but not when one side is unrecorded", () => {
    const turf = translate(
      input({ assessments: [sprint("2026-08-01", 3.2), sprint("2026-10-01", 3.1, { surface: "artificial_turf" })] }),
    );
    expect(turf.dataQuality).toEqual(["conditions_differ"]);
    const shoes = translate(
      input({ assessments: [sprint("2026-08-01", 3.2), sprint("2026-10-01", 3.1, { footwear: "trainers" })] }),
    );
    expect(shoes.dataQuality).toEqual(["conditions_differ"]);
    const unknown = translate(
      input({ assessments: [sprint("2026-08-01", 3.2, { surface: null }), sprint("2026-10-01", 3.1)] }),
    );
    expect(unknown.dataQuality).toEqual([]);
  });

  it("flags a latest assessment more than 60 days before today", () => {
    // Latest assessment 2026-10-01: 60 days later is still current, 61 is stale.
    expect(translate(input({ today: "2026-11-30" })).dataQuality).toEqual([]);
    expect(translate(input({ today: "2026-12-01" })).dataQuality).toEqual(["stale_assessment"]);
  });

  it("flags hand-timed sprint changes smaller than 0.15 s as within typical noise", () => {
    const hand = { method: "hand_timed" };
    const small = translate(input({ assessments: [sprint("2026-08-01", 3.2, hand), sprint("2026-10-01", 3.1, hand)] }));
    expect(small.dataQuality).toEqual(["within_typical_noise"]);
    const large = translate(input({ assessments: [sprint("2026-08-01", 3.4, hand), sprint("2026-10-01", 3.1, hand)] }));
    expect(large.dataQuality).toEqual([]);
  });

  it("raises no noise flag for methods without a verified typical-noise value", () => {
    // Timing gates, and every jump method, have no value until the M4 evidence table.
    expect(translate(input({})).dataQuality).not.toContain("within_typical_noise");
    const jump = translate(
      input({
        definitionId: "vertical_jump",
        betterDirection: "higher",
        assessments: [
          sprint("2026-08-01", 50, { method: "jump_mat" }),
          sprint("2026-10-01", 50.5, { method: "jump_mat" }),
        ],
      }),
    );
    expect(jump.dataQuality).toEqual([]);
    expect(jump.assessment.percentImprovement).toBeCloseTo(1, 10);
  });

  it("can raise several flags at once", () => {
    const r = translate(
      input({
        assessments: [sprint("2026-08-01", 3.2, { method: "hand_timed" }), sprint("2026-08-15", 3.1)],
        sets: [],
        today: "2026-12-01",
      }),
    );
    expect(r.dataQuality.sort()).toEqual(
      ["insufficient_training", "method_changed", "short_window", "stale_assessment"].sort(),
    );
  });
});
