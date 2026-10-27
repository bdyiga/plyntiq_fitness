import { addDays } from "@plyntiq/analytics";
import type {
  AssessmentAnalyticsDto,
  ConditioningAnalyticsDto,
  StrengthAnalyticsDto,
  TranslationDto,
} from "@plyntiq/shared";
import { describe, expect, it } from "vitest";
import { createTestClient, registerUser, send, type TestClient } from "./helpers";

// Dates relative to today, so staleness and the default range don't drift as the calendar moves.
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => addDays(today, -n);

async function post(client: TestClient, cookie: string, path: string, body: unknown) {
  const res = await send(client, cookie, "POST", path, body);
  expect(res.status, await res.clone().text()).toBe(201);
}

const squat = (reps: number, loadValue: number, loadUnit = "kg") => ({ exerciseId: "back_squat", reps, loadValue, loadUnit });

async function get<T>(client: TestClient, cookie: string, path: string) {
  const res = await send(client, cookie, "GET", path);
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}

/** An athlete with squats, a bench session, conditioning and two sprints 56 days apart. */
async function seededAthlete(client: TestClient) {
  const { cookie } = await registerUser(client);
  await post(client, cookie, "/api/workouts", { workoutDate: daysAgo(63), sets: [squat(1, 100)] });
  await post(client, cookie, "/api/workouts", { workoutDate: daysAgo(35), sets: [squat(5, 100), squat(5, 105)] });
  await post(client, cookie, "/api/workouts", {
    workoutDate: daysAgo(35),
    sets: [{ exerciseId: "bench_press", reps: 5, loadValue: 80, loadUnit: "kg" }],
  });
  // 112 kg entered in lb: analytics must read the canonical kg.
  await post(client, cookie, "/api/workouts", { workoutDate: daysAgo(4), sets: [squat(1, 112 / 0.45359237, "lb")] });
  await post(client, cookie, "/api/conditioning", { sessionDate: daysAgo(10), type: "run", durationS: 1800, sessionRpe: 6 });
  const sprint = { definitionId: "sprint_20m", value: 3.2, unit: "s", method: "timing_gates", surface: "grass", footwear: "boots" };
  await post(client, cookie, "/api/assessments", { ...sprint, assessedOn: daysAgo(60) });
  await post(client, cookie, "/api/assessments", { ...sprint, assessedOn: daysAgo(4), value: 3.1 });
  return cookie;
}

describe("strength analytics", () => {
  it("reports estimated 1RM, PRs and volume for one exercise from canonical kg", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const body = await get<StrengthAnalyticsDto>(client, cookie, "/api/analytics/strength?exerciseId=back_squat");

    expect(body.range).toEqual({ from: daysAgo(83), to: today });
    expect(body.exercise).toEqual({ id: "back_squat", name: "Back squat", isLowerBody: true });
    expect(body.bestE1rmByWeek.map((w) => w.e1rmKg)).toEqual([100, 105 * (1 + 5 / 30), expect.closeTo(112, 6)]);
    expect(body.personalRecords.map((p) => [p.kind, p.date, p.reps])).toEqual([
      ["e1rm", daysAgo(35), 5], // 100 × 5 estimates 116.7, beating the 100 kg single
      ["rep_max", daysAgo(35), 5], // 105 × 5 beats 100 × 5 (the first 5-rep set is only a baseline)
      ["e1rm", daysAgo(35), 5],
      ["rep_max", daysAgo(4), 1], // 112 × 1 beats 100 × 1, though its estimate (112) is below 122.5
    ]);
    expect(body.weeklyVolume.reduce((sum, w) => sum + w.volumeKg, 0)).toBeCloseTo(100 + 500 + 525 + 112, 6);
  });

  it("covers all exercises when none is given, with frequency across all training", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const body = await get<StrengthAnalyticsDto>(client, cookie, "/api/analytics/strength");
    expect(body.exercise).toBeNull();
    expect(body.bestE1rmByWeek).toEqual([]);
    expect(body.weeklyVolume.reduce((sum, w) => sum + w.volumeKg, 0)).toBeCloseTo(100 + 1025 + 400 + 112, 6);
    // Two workouts on the same date are one training day.
    expect(body.weeklyFrequency.reduce((sum, w) => sum + w.sessions, 0)).toBe(3);
    expect(body.consistency.weeksWithTraining).toBe(3);
  });

  it("only counts PRs inside the range but judges them against earlier history", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const body = await get<StrengthAnalyticsDto>(
      client,
      cookie,
      `/api/analytics/strength?exerciseId=back_squat&from=${daysAgo(10)}&to=${today}`,
    );
    // Earlier PRs fall outside the range; 112 × 1 is judged against the 100 kg single from before it.
    expect(body.personalRecords).toEqual([
      { kind: "rep_max", date: daysAgo(4), reps: 1, loadKg: expect.closeTo(112, 6), previousBestKg: 100 },
    ]);
    expect(body.bestE1rmByWeek).toHaveLength(1);
  });

  it("validates ranges and exercises", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const status = async (q: string) => (await send(client, cookie, "GET", `/api/analytics/strength${q}`)).status;
    expect(await status(`?from=${today}&to=${daysAgo(1)}`)).toBe(400);
    expect(await status(`?from=${daysAgo(731)}`)).toBe(400);
    expect(await status(`?from=${daysAgo(730)}`)).toBe(200);
    expect(await status("?from=2026-02-30")).toBe(400);
    expect(await status("?unknown=1")).toBe(400);
    expect(await status("?exerciseId=no_such_exercise")).toBe(404);
  });
});

describe("conditioning and assessment analytics", () => {
  it("returns weekly conditioning totals including sRPE load", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const body = await get<ConditioningAnalyticsDto>(client, cookie, "/api/analytics/conditioning");
    expect(body.weeks.length).toBeGreaterThanOrEqual(12);
    expect(body.weeks.reduce((sum, w) => sum + w.srpeLoad, 0)).toBe(180);
  });

  it("returns daily assessment values with method", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const body = await get<AssessmentAnalyticsDto>(client, cookie, "/api/analytics/assessments/sprint_20m");
    expect(body.definition).toEqual({ id: "sprint_20m", name: "20 m sprint", canonicalUnit: "s", betterDirection: "lower" });
    expect(body.days.map((d) => [d.date, d.value, d.methods])).toEqual([
      [daysAgo(60), 3.2, ["timing_gates"]],
      [daysAgo(4), 3.1, ["timing_gates"]],
    ]);
    expect((await send(client, cookie, "GET", "/api/analytics/assessments/bench_1rm")).status).toBe(404);
  });
});

describe("translation", () => {
  it("compares the most-logged lower-body lift with the assessment over the same period", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const body = await get<TranslationDto>(client, cookie, "/api/analytics/translation?definitionId=sprint_20m");

    expect(body.exercise).toEqual({ id: "back_squat", name: "Back squat" });
    expect(body.exerciseOptions).toEqual([{ id: "back_squat", name: "Back squat" }]);
    const r = body.result;
    expect(r.window).toEqual({ from: daysAgo(60), to: daysAgo(4), days: 56 });
    expect(r.assessment.percentImprovement).toBeCloseTo(3.125, 10);
    expect(r.training.baseline).toMatchObject({ date: daysAgo(63), e1rmKg: 100 });
    expect(r.training.current?.e1rmKg).toBeCloseTo(112, 6);
    expect(r.training.percentChange).toBeCloseTo(12, 6);
    expect(r.dataQuality).toEqual([]);
  });

  it("flags insufficient data for an athlete with nothing logged", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const body = await get<TranslationDto>(client, cookie, "/api/analytics/translation?definitionId=vertical_jump");
    expect(body.exercise).toBeNull();
    expect(body.exerciseOptions).toEqual([]);
    expect(body.result.dataQuality).toEqual(["insufficient_assessments"]);
  });

  it("rejects upper-body and unknown exercises and unknown assessments", async () => {
    const client = createTestClient();
    const cookie = await seededAthlete(client);
    const status = async (q: string) => (await send(client, cookie, "GET", `/api/analytics/translation?${q}`)).status;
    expect(await status("definitionId=sprint_20m&exerciseId=bench_press")).toBe(400);
    expect(await status("definitionId=sprint_20m&exerciseId=nope")).toBe(404);
    expect(await status("definitionId=bench_1rm")).toBe(400);
    expect(await status("")).toBe(400);
  });
});

describe("analytics authorization", () => {
  it("requires a session", async () => {
    const client = createTestClient();
    for (const path of ["strength", "conditioning", "assessments/sprint_20m", "translation?definitionId=sprint_20m"]) {
      expect((await client.request(`/api/analytics/${path}`)).status).toBe(401);
    }
  });

  it("never includes another athlete's records or custom exercises", async () => {
    const client = createTestClient();
    const ownerCookie = await seededAthlete(client);
    const createRes = await send(client, ownerCookie, "POST", "/api/exercises", {
      name: "Belt squat",
      category: "squat",
      isLowerBody: true,
    });
    const { exercise } = (await createRes.json()) as { exercise: { id: string } };
    await post(client, ownerCookie, "/api/workouts", {
      workoutDate: daysAgo(2),
      sets: [{ exerciseId: exercise.id, reps: 5, loadValue: 90, loadUnit: "kg" }],
    });

    const { cookie: other } = await registerUser(client);
    const strength = await get<StrengthAnalyticsDto>(client, other, "/api/analytics/strength");
    expect(strength.weeklyVolume.every((w) => w.volumeKg === 0)).toBe(true);
    expect(strength.consistency.weeksWithTraining).toBe(0);
    const squats = await get<StrengthAnalyticsDto>(client, other, "/api/analytics/strength?exerciseId=back_squat");
    expect(squats.bestE1rmByWeek).toEqual([]);
    const conditioning = await get<ConditioningAnalyticsDto>(client, other, "/api/analytics/conditioning");
    expect(conditioning.weeks.every((w) => w.sessions === 0)).toBe(true);
    const sprints = await get<AssessmentAnalyticsDto>(client, other, "/api/analytics/assessments/sprint_20m");
    expect(sprints.days).toEqual([]);
    const translation = await get<TranslationDto>(client, other, "/api/analytics/translation?definitionId=sprint_20m");
    expect(translation.exerciseOptions).toEqual([]);
    expect(translation.result.assessment.points).toEqual([]);

    // The owner's custom exercise looks like one that doesn't exist.
    expect((await send(client, other, "GET", `/api/analytics/strength?exerciseId=${exercise.id}`)).status).toBe(404);
    const foreign = await send(client, other, "GET", `/api/analytics/translation?definitionId=sprint_20m&exerciseId=${exercise.id}`);
    expect(foreign.status).toBe(404);
  });
});
