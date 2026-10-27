import type { ExerciseDto, Page, WorkoutDto } from "@plyntiq/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createTestClient, PASSWORD, registerUser, type TestClient } from "./helpers";

const SQUAT_SET = { exerciseId: "back_squat", reps: 5, loadValue: 100, loadUnit: "kg", rpe: 8 };
const WORKOUT = {
  workoutDate: "2026-10-20",
  notes: "Felt strong",
  sets: [SQUAT_SET, { ...SQUAT_SET, loadValue: 225, loadUnit: "lb", rpe: null }],
};

function send(client: TestClient, cookie: string, method: string, path: string, body?: unknown) {
  return client.request(path, { method, cookie, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function createWorkout(client: TestClient, cookie: string, body: unknown = WORKOUT) {
  const res = await send(client, cookie, "POST", "/api/workouts", body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { workout: WorkoutDto }).workout;
}

describe("workouts CRUD", () => {
  it("creates a workout with its sets and computes load_kg on the server", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const workout = await createWorkout(client, cookie);

    expect(workout).toMatchObject({ workoutDate: "2026-10-20", notes: "Felt strong" });
    expect(workout.sets.map((s) => [s.setIndex, s.exerciseName, s.loadValue, s.loadUnit, s.rpe])).toEqual([
      [0, "Back squat", 100, "kg", 8],
      [1, "Back squat", 225, "lb", null],
    ]);
    expect(workout.sets[0]!.loadKg).toBe(100);
    expect(workout.sets[1]!.loadKg).toBeCloseTo(102.0583, 4);

    const fetched = await send(client, cookie, "GET", `/api/workouts/${workout.id}`);
    expect(((await fetched.json()) as { workout: WorkoutDto }).workout).toEqual(workout);
  });

  it("edits fields and replaces sets", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const workout = await createWorkout(client, cookie);

    const notesOnly = await send(client, cookie, "PATCH", `/api/workouts/${workout.id}`, { notes: "" });
    const afterNotes = ((await notesOnly.json()) as { workout: WorkoutDto }).workout;
    expect(afterNotes.notes).toBeNull();
    expect(afterNotes.sets).toHaveLength(2);

    const res = await send(client, cookie, "PATCH", `/api/workouts/${workout.id}`, {
      workoutDate: "2026-10-21",
      sets: [{ exerciseId: "deadlift", reps: 3, loadValue: 180, loadUnit: "kg" }],
    });
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { workout: WorkoutDto }).workout;
    expect(updated.workoutDate).toBe("2026-10-21");
    expect(updated.sets.map((s) => [s.exerciseId, s.reps, s.loadKg, s.rpe])).toEqual([["deadlift", 3, 180, null]]);

    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ?")
      .bind(workout.id)
      .first<{ n: number }>())!;
    expect(n).toBe(1);
  });

  it("deletes a workout and its sets", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const workout = await createWorkout(client, cookie);

    expect((await send(client, cookie, "DELETE", `/api/workouts/${workout.id}`)).status).toBe(204);
    expect((await send(client, cookie, "GET", `/api/workouts/${workout.id}`)).status).toBe(404);
    expect((await send(client, cookie, "DELETE", `/api/workouts/${workout.id}`)).status).toBe(404);
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ?")
      .bind(workout.id)
      .first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("stores up to 100 sets atomically (inserts are chunked under D1's parameter limit)", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const sets = Array.from({ length: 100 }, (_, i) => ({ ...SQUAT_SET, reps: (i % 10) + 1 }));
    const workout = await createWorkout(client, cookie, { ...WORKOUT, sets });
    expect(workout.sets).toHaveLength(100);
    expect(workout.sets.map((s) => s.setIndex)).toEqual([...Array(100).keys()]);

    const tooMany = await send(client, cookie, "POST", "/api/workouts", { ...WORKOUT, sets: [...sets, SQUAT_SET] });
    expect(tooMany.status).toBe(400);
  });

  it("paginates newest first with an opaque cursor", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    for (const day of ["2026-10-01", "2026-10-03", "2026-10-02", "2026-10-03", "2026-10-04"]) {
      await createWorkout(client, cookie, { ...WORKOUT, workoutDate: day });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : "?limit=2";
      const page = (await (await send(client, cookie, "GET", `/api/workouts${query}`)).json()) as Page<WorkoutDto>;
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((w) => w.workoutDate));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(["2026-10-04", "2026-10-03", "2026-10-03", "2026-10-02", "2026-10-01"]);

    for (const bad of ["?limit=0", "?limit=101", "?limit=abc", "?cursor=not-a-cursor", "?userId=x"]) {
      expect((await send(client, cookie, "GET", `/api/workouts${bad}`)).status, bad).toBe(400);
    }
  });
});

describe("workout validation", () => {
  it.each([
    ["reps below 1", { sets: [{ ...SQUAT_SET, reps: 0 }] }, "sets.0.reps"],
    ["reps above 100", { sets: [{ ...SQUAT_SET, reps: 101 }] }, "sets.0.reps"],
    ["fractional reps", { sets: [{ ...SQUAT_SET, reps: 2.5 }] }, "sets.0.reps"],
    ["RPE above 10", { sets: [{ ...SQUAT_SET, rpe: 11 }] }, "sets.0.rpe"],
    ["RPE below 1", { sets: [{ ...SQUAT_SET, rpe: 0 }] }, "sets.0.rpe"],
    ["negative load", { sets: [{ ...SQUAT_SET, loadValue: -5 }] }, "sets.0.loadValue"],
    ["unknown unit", { sets: [{ ...SQUAT_SET, loadUnit: "stone" }] }, "sets.0.loadUnit"],
    ["client-supplied loadKg", { sets: [{ ...SQUAT_SET, loadKg: 1 }] }, "sets.0"],
    ["unknown exercise", { sets: [{ ...SQUAT_SET, exerciseId: "nope" }] }, "sets.0.exerciseId"],
    ["no sets", { sets: [] }, "sets"],
    ["impossible date", { workoutDate: "2026-02-30" }, "workoutDate"],
    ["badly formatted date", { workoutDate: "20/10/2026" }, "workoutDate"],
    ["future date", { workoutDate: "2099-01-01" }, "workoutDate"],
    ["smuggled userId", { userId: "someone" }, ""],
  ])("rejects %s", async (_label, override, path) => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await send(client, cookie, "POST", "/api/workouts", { ...WORKOUT, ...override });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.issues.map((i) => i.path)).toContain(path);
  });

  it("accepts a bodyweight set (load 0) and half-point RPE", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const workout = await createWorkout(client, cookie, {
      workoutDate: "2026-10-20",
      sets: [{ exerciseId: "pull_up", reps: 10, loadValue: 0, loadUnit: "kg", rpe: 7.5 }],
    });
    expect(workout.sets[0]).toMatchObject({ loadKg: 0, rpe: 7.5 });
    expect(workout.notes).toBeNull();
  });

  it("rejects an empty PATCH", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const workout = await createWorkout(client, cookie);
    expect((await send(client, cookie, "PATCH", `/api/workouts/${workout.id}`, {})).status).toBe(400);
  });
});

describe("workout cross-account isolation", () => {
  it("returns 404 for another athlete's workout on GET, PATCH and DELETE", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    const workout = await createWorkout(client, alice.cookie);
    const path = `/api/workouts/${workout.id}`;

    expect((await send(client, bob.cookie, "GET", path)).status).toBe(404);
    expect((await send(client, bob.cookie, "PATCH", path, { notes: "mine now" })).status).toBe(404);
    expect((await send(client, bob.cookie, "DELETE", path)).status).toBe(404);

    const bobList = (await (await send(client, bob.cookie, "GET", "/api/workouts")).json()) as Page<WorkoutDto>;
    expect(bobList.items).toHaveLength(0);

    const intact = ((await (await send(client, alice.cookie, "GET", path)).json()) as { workout: WorkoutDto }).workout;
    expect(intact).toEqual(workout);
  });

  it("does not let a set reference another athlete's custom exercise", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    const res = await send(client, alice.cookie, "POST", "/api/exercises", {
      name: "Alice's secret lift",
      category: "other",
      isLowerBody: false,
    });
    const { exercise } = (await res.json()) as { exercise: ExerciseDto };

    const set = { ...SQUAT_SET, exerciseId: exercise.id };
    const create = await send(client, bob.cookie, "POST", "/api/workouts", { ...WORKOUT, sets: [set] });
    expect(create.status).toBe(400);

    const bobWorkout = await createWorkout(client, bob.cookie);
    const patch = await send(client, bob.cookie, "PATCH", `/api/workouts/${bobWorkout.id}`, { sets: [set] });
    expect(patch.status).toBe(400);
  });

  it("does not leak another athlete's workouts through a cursor", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    await createWorkout(client, alice.cookie, { ...WORKOUT, workoutDate: "2026-10-01" });
    await createWorkout(client, alice.cookie, { ...WORKOUT, workoutDate: "2026-10-02" });
    const page = (await (await send(client, alice.cookie, "GET", "/api/workouts?limit=1")).json()) as Page<WorkoutDto>;
    expect(page.nextCursor).not.toBeNull();

    const bobPage = (await (
      await send(client, bob.cookie, "GET", `/api/workouts?cursor=${page.nextCursor}`)
    ).json()) as Page<WorkoutDto>;
    expect(bobPage.items).toHaveLength(0);
  });

  it("deletes workouts, sets and custom exercises with the account", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    const res = await send(client, cookie, "POST", "/api/exercises", { name: "Sled drag", category: "carry", isLowerBody: true });
    const { exercise } = (await res.json()) as { exercise: ExerciseDto };
    const workout = await createWorkout(client, cookie, { ...WORKOUT, sets: [{ ...SQUAT_SET, exerciseId: exercise.id }] });

    const del = await send(client, cookie, "POST", "/api/auth/delete-user", { password: PASSWORD });
    expect(del.status).toBe(200);

    const counts = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE user_id = ?").bind(body.user.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ?").bind(workout.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM exercises WHERE owner_user_id = ?").bind(body.user.id),
    ]);
    expect(counts.map((r) => (r.results[0] as { n: number }).n)).toEqual([0, 0, 0]);
  });
});

describe("removing custom exercises", () => {
  async function customExercise(client: TestClient, cookie: string) {
    const res = await send(client, cookie, "POST", "/api/exercises", { name: "Sled drag", category: "carry", isLowerBody: true });
    return ((await res.json()) as { exercise: ExerciseDto }).exercise;
  }

  it("deletes an unused custom exercise", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const exercise = await customExercise(client, cookie);
    const res = await send(client, cookie, "DELETE", `/api/exercises/${exercise.id}`);
    expect(await res.json()).toEqual({ result: "deleted" });
  });

  it("archives a custom exercise used in sets, keeping history and allowing re-creation", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const exercise = await customExercise(client, cookie);
    const workout = await createWorkout(client, cookie, { ...WORKOUT, sets: [{ ...SQUAT_SET, exerciseId: exercise.id }] });

    const res = await send(client, cookie, "DELETE", `/api/exercises/${exercise.id}`);
    expect(await res.json()).toEqual({ result: "archived" });

    const list = ((await (await send(client, cookie, "GET", "/api/exercises")).json()) as { exercises: ExerciseDto[] })
      .exercises;
    expect(list.map((e) => e.id)).not.toContain(exercise.id);

    const kept = ((await (await send(client, cookie, "GET", `/api/workouts/${workout.id}`)).json()) as {
      workout: WorkoutDto;
    }).workout;
    expect(kept.sets[0]!.exerciseName).toBe("Sled drag");

    const recreated = await send(client, cookie, "POST", "/api/exercises", { name: "sled drag", category: "carry", isLowerBody: true });
    expect(recreated.status).toBe(201);
    expect(((await recreated.json()) as { exercise: ExerciseDto }).exercise.id).toBe(exercise.id);
  });

  it("returns 404 for global and other athletes' exercises", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    const exercise = await customExercise(client, alice.cookie);
    expect((await send(client, bob.cookie, "DELETE", `/api/exercises/${exercise.id}`)).status).toBe(404);
    expect((await send(client, alice.cookie, "DELETE", "/api/exercises/back_squat")).status).toBe(404);
  });
});
