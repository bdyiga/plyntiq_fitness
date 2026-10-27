import { describe, expect, it } from "vitest";
import {
  bestE1rmByWeek,
  estimateOneRepMax,
  mostLoggedExercise,
  personalRecords,
  sessionVolume,
  setVolume,
  weeklyVolume,
} from "./strength";
import type { StrengthSetInput } from "./types";

const set = (date: string, reps: number, loadKg: number, exerciseId = "back_squat"): StrengthSetInput => ({
  date,
  exerciseId,
  reps,
  loadKg,
});

describe("volume", () => {
  it("multiplies reps by load and sums a session", () => {
    expect(setVolume({ reps: 5, loadKg: 100 })).toBe(500);
    expect(sessionVolume([set("2026-10-01", 5, 100), set("2026-10-01", 3, 110)])).toBe(830);
    expect(sessionVolume([])).toBe(0);
  });

  it("counts bodyweight sets (load 0) as zero volume", () => {
    expect(setVolume({ reps: 12, loadKg: 0 })).toBe(0);
  });

  it("totals per week and includes empty weeks", () => {
    const weeks = weeklyVolume(
      [set("2026-10-05", 5, 100), set("2026-10-07", 5, 100), set("2026-10-21", 2, 50), set("2026-12-01", 1, 999)],
      "2026-10-05",
      "2026-10-25",
    );
    expect(weeks.map((w) => [w.weekStart, w.volumeKg, w.sets])).toEqual([
      ["2026-10-05", 1000, 2],
      ["2026-10-12", 0, 0],
      ["2026-10-19", 100, 1],
    ]);
  });
});

describe("estimated 1-rep max (Epley)", () => {
  it("applies load × (1 + reps/30)", () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.6667, 4);
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.3333, 4);
  });

  it("returns the load itself for a single", () => {
    expect(estimateOneRepMax(140, 1)).toBe(140);
  });

  it("gives no estimate above 10 reps, below 1, for fractions or unloaded sets", () => {
    expect(estimateOneRepMax(60, 11)).toBeNull();
    expect(estimateOneRepMax(60, 0)).toBeNull();
    expect(estimateOneRepMax(60, 2.5)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(-10, 5)).toBeNull();
  });

  it("keeps the best estimate per week, unsorted input", () => {
    const weeks = bestE1rmByWeek([
      set("2026-10-14", 3, 120), // week of 12th: 132
      set("2026-10-06", 5, 100), // week of 5th: 116.67
      set("2026-10-13", 1, 130), // 130, beaten by the triple
      set("2026-10-07", 12, 90), // over 10 reps: ignored
    ]);
    expect(weeks.map((w) => [w.weekStart, w.isoWeek, w.date])).toEqual([
      ["2026-10-05", "2026-W41", "2026-10-06"],
      ["2026-10-12", "2026-W42", "2026-10-14"],
    ]);
    expect(weeks[1]!.e1rmKg).toBeCloseTo(132, 10);
    expect(bestE1rmByWeek([])).toEqual([]);
  });

  it("matches the PRD example: 100 → 112 kg", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(112, 1)).toBe(112);
  });
});

describe("personal records", () => {
  it("records loads strictly heavier than every earlier set at that rep count", () => {
    const prs = personalRecords([
      set("2026-10-01", 5, 100),
      set("2026-10-08", 5, 100), // tie: not a PR
      set("2026-10-15", 5, 105),
    ]);
    expect(prs.filter((p) => p.kind === "rep_max")).toEqual([
      { kind: "rep_max", date: "2026-10-15", reps: 5, loadKg: 105, previousBestKg: 100 },
    ]);
  });

  it("treats the first set at a rep count as a baseline, not a PR", () => {
    expect(personalRecords([set("2026-10-01", 3, 80)])).toEqual([]);
  });

  it("records a better estimated 1RM even at a new rep count", () => {
    const prs = personalRecords([set("2026-10-01", 5, 100), set("2026-10-08", 3, 112)]);
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ kind: "e1rm", date: "2026-10-08", previousBestKg: expect.closeTo(116.667, 2) });
  });

  it("sorts by date but keeps the given order within a day", () => {
    const prs = personalRecords([set("2026-10-08", 5, 110), set("2026-10-08", 5, 115), set("2026-10-01", 5, 100)]);
    expect(prs.filter((p) => p.kind === "rep_max").map((p) => p.loadKg)).toEqual([110, 115]);
  });

  it("ignores bodyweight sets", () => {
    expect(personalRecords([set("2026-10-01", 10, 0), set("2026-10-02", 12, 0)])).toEqual([]);
  });
});

describe("most-logged exercise", () => {
  it("counts distinct dates, not sets, and breaks ties by recency", () => {
    const sets = [
      set("2026-10-01", 5, 100, "back_squat"),
      set("2026-10-01", 5, 100, "back_squat"),
      set("2026-10-01", 5, 140, "deadlift"),
      set("2026-10-08", 5, 140, "deadlift"),
      set("2026-10-03", 5, 80, "front_squat"),
      set("2026-10-09", 5, 80, "front_squat"),
    ];
    expect(mostLoggedExercise(sets, "2026-10-01", "2026-10-31")).toBe("front_squat");
    expect(mostLoggedExercise(sets, "2026-10-02", "2026-10-08")).toBe("deadlift");
    expect(mostLoggedExercise(sets, "2027-01-01", "2027-01-31")).toBeNull();
  });
});
