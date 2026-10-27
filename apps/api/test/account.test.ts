import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createTestClient, PASSWORD, registerUser, send, VALID_PROFILE } from "./helpers";

describe("data export", () => {
  it("exports the athlete's own data without credentials or tokens", async () => {
    const client = createTestClient();
    const { cookie, email } = await registerUser(client);
    await client.request("/api/me/profile", { method: "PUT", cookie, body: JSON.stringify(VALID_PROFILE) });

    const res = await client.request("/api/me/export", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    const text = await res.text();
    const body = JSON.parse(text) as { account: { email: string }; athleteProfile: { primarySportId: string } };
    expect(body.account.email).toBe(email);
    expect(body.athleteProfile.primarySportId).toBe("rugby_union");
    expect(text).not.toMatch(/password"|token|session/i);
  });

  it("includes the athlete's training records and none of another athlete's", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);

    async function logEverything(cookie: string, label: string) {
      const exercise = await send(client, cookie, "POST", "/api/exercises", { name: `${label} lift`, category: "other", isLowerBody: false });
      const { exercise: ex } = (await exercise.json()) as { exercise: { id: string } };
      for (const [path, body] of [
        ["/api/workouts", { workoutDate: "2026-10-20", notes: label, sets: [{ exerciseId: ex.id, reps: 5, loadValue: 100, loadUnit: "kg" }] }],
        ["/api/conditioning", { sessionDate: "2026-10-20", type: "run", durationS: 600, sessionRpe: 5, notes: label }],
        ["/api/assessments", { definitionId: "sprint_20m", assessedOn: "2026-10-20", value: 3.2, unit: "s", method: "hand_timed", notes: label }],
      ] as const) {
        expect((await send(client, cookie, "POST", path, body)).status, path).toBe(201);
      }
    }
    await logEverything(alice.cookie, "alice");
    await logEverything(bob.cookie, "bob");

    const text = await (await client.request("/api/me/export", { cookie: alice.cookie })).text();
    const body = JSON.parse(text) as {
      exportFormatVersion: number;
      customExercises: { name: string; archivedAt: string | null }[];
      workouts: { notes: string; sets: { exerciseName: string; loadKg: number }[] }[];
      conditioning: { notes: string }[];
      assessmentResults: { notes: string; method: string }[];
    };
    expect(body.exportFormatVersion).toBe(3);
    expect(body.customExercises).toEqual([expect.objectContaining({ name: "alice lift", archivedAt: null })]);
    expect(body.workouts).toEqual([expect.objectContaining({ notes: "alice" })]);
    expect(body.workouts[0]!.sets).toEqual([expect.objectContaining({ exerciseName: "alice lift", loadKg: 100 })]);
    expect(body.conditioning).toEqual([expect.objectContaining({ notes: "alice" })]);
    expect(body.assessmentResults).toEqual([expect.objectContaining({ notes: "alice", method: "hand_timed" })]);
    expect(text).not.toContain("bob");
    expect(text).not.toContain(bob.body.user.id);
    // sessionDate/sessionRpe are legitimate fields here, so check for credential keys and the real token instead.
    expect(text).not.toMatch(/"(password|token|accessToken|refreshToken|idToken|sessions?)"s*:/i);
    const sessionToken = decodeURIComponent(alice.cookie.split("=")[1]!).split(".")[0]!;
    expect(text).not.toContain(sessionToken);
  });
});

describe("account deletion", () => {
  it("deletes the user and cascades to profile, sessions and credentials", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    const userId = body.user.id;
    await client.request("/api/me/profile", { method: "PUT", cookie, body: JSON.stringify(VALID_PROFILE) });

    const res = await client.request("/api/auth/delete-user", {
      method: "POST",
      cookie,
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(res.status).toBe(200);

    for (const table of ["users", "athlete_profiles", "sessions", "accounts"]) {
      const column = table === "users" ? "id" : "user_id";
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
        .bind(userId)
        .first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
    expect((await client.request("/api/me", { cookie })).status).toBe(401);
  });

  it("requires the correct password to delete the account", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/auth/delete-user", {
      method: "POST",
      cookie,
      body: JSON.stringify({ password: "not-my-password" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await client.request("/api/me", { cookie })).status).toBe(200);
  });
});
