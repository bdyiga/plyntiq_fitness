import type { DataQualityFlag } from "@plyntiq/analytics";
import type { MeDto, TranslationDto } from "@plyntiq/shared";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import pageSource from "../src/pages/ReportPage.tsx?raw";
import copySource from "../src/lib/report-copy.ts?raw";
import { assessmentChangeText, formatPercent } from "../src/lib/report-copy";
import { ME, mockApi } from "./mock-api";
import { renderRoute } from "./render";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => vi.restoreAllMocks());

/**
 * The PRD's core analytical rule: report measured changes, never causation.
 * Any of these in the report's copy or rendered text fails the build.
 */
const CAUSAL = [
  /\bbecause\b/i,
  /\bcaus(e|es|ed|ing)\b/i,
  /\bled to\b/i,
  /\blead(s)? to\b/i,
  /\bdue to\b/i,
  /\bresult(s|ed)? in\b/i,
  /\bthanks to\b/i,
  /\bimproved your\b/i,
  /\bmade you\b/i,
  /\bdr(ive|ives|ove)\b/i,
  /\beffect of\b/i,
  /\bcorrelat/i,
  /\bboost(s|ed)? your\b/i,
  /\bwill (improve|make)\b/i,
];

function causalPhrases(text: string): string[] {
  return CAUSAL.flatMap((re) => text.match(re) ?? []);
}

const SQUAT = { id: "back_squat", name: "Back squat" };

function translation(overrides: Partial<TranslationDto["result"]> = {}, definitionId = "sprint_20m"): TranslationDto {
  const sprint = definitionId === "sprint_20m";
  const day = (date: string, value: number, methods = ["timing_gates"]) => ({
    date,
    value,
    trials: 1,
    methods,
    surfaces: ["grass"],
    footwear: ["boots"],
  });
  const first = day("2026-08-01", sprint ? 3.2 : 50);
  const latest = day("2026-10-01", sprint ? 3.1 : 52);
  return {
    exercise: SQUAT,
    exerciseOptions: [SQUAT, { id: "deadlift", name: "Deadlift" }],
    result: {
      definitionId,
      exerciseId: "back_squat",
      window: { from: "2026-08-01", to: "2026-10-01", days: 61 },
      assessment: {
        first,
        latest,
        absoluteChange: latest.value - first.value,
        percentImprovement: sprint ? 3.125 : 4,
        points: [first, latest].map((d) => ({ date: d.date, value: d.value })),
      },
      training: {
        baseline: { date: "2026-07-25", e1rmKg: 100, reps: 1, loadKg: 100 },
        current: { date: "2026-09-28", e1rmKg: 112, reps: 1, loadKg: 112 },
        absoluteChangeKg: 12,
        percentChange: 12,
      },
      dataQuality: [],
      ...overrides,
    },
  };
}

function mockReport(
  sprint: TranslationDto = translation(),
  jump: TranslationDto = translation({}, "vertical_jump"),
  me: MeDto = { ...ME, profile: { ...ME.profile!, preferredWeightUnit: "kg" } },
) {
  return mockApi({
    "GET /api/me": me,
    "GET /api/analytics/translation": ({ url }: { url: URL }) =>
      url.searchParams.get("definitionId") === "vertical_jump" ? jump : sprint,
    "GET /api/analytics/strength": {
      range: { from: "2026-07-19", to: "2026-10-01" },
      exercise: { ...SQUAT, isLowerBody: true },
      weeklyVolume: [],
      bestE1rmByWeek: [],
      personalRecords: [],
      weeklyFrequency: [],
      consistency: { weeksWithTraining: 0, weeksInRange: 0, ratio: 0 },
    },
  });
}

const sprintCard = async () => (await screen.findByRole("heading", { name: "20 m sprint" })).closest("section")!;

describe("translation report copy", () => {
  it("contains no causal language in its source", () => {
    expect(causalPhrases(copySource)).toEqual([]);
    // The page source mentions only identifiers besides the copy module; check its literals too.
    expect(causalPhrases(pageSource)).toEqual([]);
  });

  it("renders no causal language, with every flag raised", async () => {
    const all: DataQualityFlag[] = [
      "insufficient_training",
      "short_window",
      "method_changed",
      "conditions_differ",
      "stale_assessment",
      "within_typical_noise",
    ];
    mockReport(translation({ dataQuality: all }), translation({ dataQuality: ["insufficient_assessments"] }, "vertical_jump"));
    renderRoute("/report");
    await screen.findAllByRole("list", { name: "Things to know about this comparison" });
    expect(causalPhrases(document.body.textContent ?? "")).toEqual([]);
  });

  it("formats the PRD example: ≈ 3.1% for 3.125%, 12.0% for 12%", () => {
    expect(formatPercent(3.125)).toBe("≈ 3.1%");
    expect(formatPercent(12)).toBe("12.0%");
    expect(assessmentChangeText(3.125, "lower")).toBe("≈ 3.1% faster");
    expect(assessmentChangeText(-2, "lower")).toBe("2.0% slower");
    expect(assessmentChangeText(4, "higher")).toBe("4.0% higher");
    expect(assessmentChangeText(0, "higher")).toBe("no change");
  });
});

describe("translation report page", () => {
  it("shows both changes side by side over the same period", async () => {
    mockReport();
    renderRoute("/report");
    const card = within(await sprintCard());
    expect(await card.findByText("12.0% higher")).toBeInTheDocument();
    expect(card.getByText("≈ 3.1% faster")).toBeInTheDocument();
    expect(card.getByText(/^Over the same period \(.+, 61 days\), your estimated back squat 1RM was 12.0% higher and your 20 m sprint result was ≈ 3.1% faster\.$/)).toBeInTheDocument();
    expect(card.getByText(/100 kg/)).toBeInTheDocument();
    expect(card.getByText(/can't show whether one change is responsible for the other/)).toBeInTheDocument();
  });

  it("shows data-quality flags as plain-language notes, not a score", async () => {
    mockReport(
      translation({
        assessment: {
          ...translation().result.assessment,
          first: { ...translation().result.assessment.first!, methods: ["hand_timed"] },
        },
        dataQuality: ["method_changed", "short_window"],
      }),
    );
    renderRoute("/report");
    const notes = within(await within(await sprintCard()).findByRole("list", { name: "Things to know about this comparison" }));
    expect(notes.getByText(/different methods \(Hand timing, then Timing gates\)/)).toBeInTheDocument();
    expect(notes.getByText(/less than 4 weeks apart/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/confidence|score/i);
  });

  it("explains what's missing when there isn't enough data", async () => {
    const empty = translation({
      window: null,
      assessment: { first: null, latest: null, absoluteChange: null, percentImprovement: null, points: [] },
      training: { baseline: null, current: null, absoluteChangeKg: null, percentChange: null },
      dataQuality: ["insufficient_assessments"],
    });
    mockReport({ ...empty, exercise: null, exerciseOptions: [] });
    renderRoute("/report");
    const card = within(await sprintCard());
    expect(await card.findByText(/results on at least two different days/)).toBeInTheDocument();
    expect(card.getByRole("link", { name: "Log a 20 m sprint result" })).toHaveAttribute("href", "/assessments/new");
    expect(card.queryByText(/Over the same period/)).not.toBeInTheDocument();
  });

  it("puts the test that matches the athlete's goal first", async () => {
    mockReport(undefined, undefined, { ...ME, profile: { ...ME.profile!, primaryGoalId: "lower_body_power" } });
    renderRoute("/report");
    await screen.findByRole("heading", { name: "Vertical jump" });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Vertical jump", "20 m sprint"]);
  });

  it("lets the athlete switch the lift being compared", async () => {
    const api = mockReport();
    renderRoute("/report");
    const select = await within(await sprintCard()).findByLabelText("Compare with");
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.selectOptions(select, "deadlift");
    expect(api.sent("GET", "/api/analytics/translation").some((c) => c.url.searchParams.get("exerciseId") === "deadlift")).toBe(true);
  });
});
