import { describe, expect, it } from "vitest";
import { sessionRpeLoad, weeklyConditioning } from "./conditioning";
import { consistency, weeklyFrequency } from "./frequency";

describe("weekly frequency and consistency", () => {
  const dates = ["2026-10-06", "2026-10-06", "2026-10-08", "2026-10-22", "2026-09-30"];

  it("counts distinct dates per week, with empty weeks as 0", () => {
    expect(weeklyFrequency(dates, "2026-10-05", "2026-10-25").map((w) => w.sessions)).toEqual([2, 0, 1]);
  });

  it("is the share of weeks with at least one session", () => {
    const c = consistency(dates, "2026-10-05", "2026-10-25");
    expect(c).toEqual({ weeksWithTraining: 2, weeksInRange: 3, ratio: 2 / 3 });
    expect(consistency([], "2026-10-05", "2026-10-11").ratio).toBe(0);
  });
});

describe("conditioning", () => {
  it("computes sRPE load as minutes × RPE (arbitrary units)", () => {
    expect(sessionRpeLoad(30 * 60, 7)).toBe(210);
    expect(sessionRpeLoad(90, 0)).toBe(0);
  });

  it("totals per week; sessions without distance add no distance", () => {
    const weeks = weeklyConditioning(
      [
        { date: "2026-10-06", durationS: 1800, distanceM: 5000, sessionRpe: 6 },
        { date: "2026-10-07", durationS: 600, distanceM: null, sessionRpe: 9 },
      ],
      "2026-10-05",
      "2026-10-18",
    );
    expect(weeks).toEqual([
      { weekStart: "2026-10-05", isoWeek: "2026-W41", sessions: 2, durationS: 2400, distanceM: 5000, srpeLoad: 270 },
      { weekStart: "2026-10-12", isoWeek: "2026-W42", sessions: 0, durationS: 0, distanceM: 0, srpeLoad: 0 },
    ]);
  });
});
