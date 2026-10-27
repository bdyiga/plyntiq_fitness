import type { AssessmentAnalyticsDto, ConditioningAnalyticsDto, StrengthAnalyticsDto } from "@plyntiq/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EXERCISES, ME, mockApi } from "./mock-api";
import { renderRoute } from "./render";

beforeAll(() => {
  // jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => vi.restoreAllMocks());

const week = (weekStart: string) => ({ weekStart, isoWeek: "2026-W00" });

const STRENGTH: StrengthAnalyticsDto = {
  range: { from: "2026-08-04", to: "2026-10-26" },
  exercise: { id: "back_squat", name: "Back squat", isLowerBody: true },
  weeklyVolume: [
    { ...week("2026-10-12"), volumeKg: 1000, sets: 2 },
    { ...week("2026-10-19"), volumeKg: 0, sets: 0 },
  ],
  bestE1rmByWeek: [{ ...week("2026-10-12"), e1rmKg: 116.6667, date: "2026-10-14", reps: 5, loadKg: 100 }],
  personalRecords: [{ kind: "rep_max", date: "2026-10-14", reps: 5, loadKg: 100, previousBestKg: 90 }],
  weeklyFrequency: [
    { ...week("2026-10-12"), sessions: 2 },
    { ...week("2026-10-19"), sessions: 0 },
  ],
  consistency: { weeksWithTraining: 1, weeksInRange: 2, ratio: 0.5 },
};

const CONDITIONING: ConditioningAnalyticsDto = {
  range: STRENGTH.range,
  weeks: [{ ...week("2026-10-12"), sessions: 1, durationS: 1800, distanceM: 5000, srpeLoad: 180 }],
};

const assessment = (id: "sprint_20m" | "vertical_jump"): AssessmentAnalyticsDto =>
  id === "sprint_20m"
    ? {
        range: STRENGTH.range,
        definition: { id, name: "20 m sprint", canonicalUnit: "s", betterDirection: "lower" },
        days: [
          { date: "2026-09-01", value: 3.2, trials: 2, methods: ["hand_timed"], surfaces: [], footwear: [] },
          { date: "2026-10-01", value: 3.1, trials: 1, methods: ["timing_gates"], surfaces: [], footwear: [] },
        ],
      }
    : {
        range: STRENGTH.range,
        definition: { id, name: "Vertical jump", canonicalUnit: "cm", betterDirection: "higher" },
        days: [],
      };

function mockProgress(strength: StrengthAnalyticsDto = STRENGTH) {
  return mockApi({
    "GET /api/me": ME,
    "GET /api/exercises": { exercises: EXERCISES },
    "GET /api/workouts": { items: [], nextCursor: null },
    "GET /api/analytics/strength": strength,
    "GET /api/analytics/conditioning": CONDITIONING,
    "GET /api/analytics/assessments/sprint_20m": assessment("sprint_20m"),
    "GET /api/analytics/assessments/vertical_jump": assessment("vertical_jump"),
  });
}

describe("progress page", () => {
  it("labels the 1RM as an estimate and shows values in the athlete's unit", async () => {
    mockProgress();
    renderRoute("/progress");
    expect(await screen.findByRole("heading", { name: "Estimated 1RM: Back squat" })).toBeInTheDocument();
    expect(screen.getByText(/An estimate, not a tested max/)).toBeInTheDocument();
    // ME prefers lb: 116.67 kg → 257.2 lb, from 5 × 220.5 lb.
    expect(screen.getByRole("cell", { name: "257.2 lb" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "5 × 220.5 lb" })).toBeInTheDocument();
    expect(screen.getByText("Heaviest 5-rep set: 220.5 lb (was 198.4 lb)")).toBeInTheDocument();
    expect(screen.getByText(/Trained in 1 of 2 weeks/)).toBeInTheDocument();
  });

  it("describes session-RPE load as an estimate, not fatigue", async () => {
    mockProgress();
    renderRoute("/progress");
    await userEvent.click(await screen.findByRole("button", { name: "Session-RPE load" }));
    expect(screen.getByText(/An estimate of effort, not a measure of fatigue/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "180 AU" })).toBeInTheDocument();
  });

  it("shows assessment methods in the table and an empty state when there are no results", async () => {
    mockProgress();
    renderRoute("/progress");
    expect(await screen.findByRole("cell", { name: "Hand timing" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "3.2 s" })).toBeInTheDocument();
    expect(screen.getByText("No vertical jump results in this period.")).toBeInTheDocument();
  });

  it("requests a new range when the athlete changes it", async () => {
    const api = mockProgress();
    renderRoute("/progress");
    await screen.findByRole("heading", { name: "Estimated 1RM: Back squat" });
    await userEvent.click(screen.getByRole("button", { name: "4 wk" }));
    await waitFor(() => {
      const last = api.sent("GET", "/api/analytics/strength").at(-1)!;
      const from = last.url.searchParams.get("from")!;
      const to = last.url.searchParams.get("to")!;
      expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(27);
    });
  });

  it("covers all exercises, with no 1RM chart, when none is selected", async () => {
    const api = mockProgress({ ...STRENGTH, exercise: null, bestE1rmByWeek: [], personalRecords: [] });
    renderRoute("/progress");
    expect(await screen.findByRole("heading", { name: "Weekly volume: all exercises" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Estimated 1RM/ })).not.toBeInTheDocument();
    expect(api.sent("GET", "/api/analytics/strength")[0]!.url.searchParams.has("exerciseId")).toBe(false);
  });
});
