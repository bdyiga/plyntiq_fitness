import { EXERCISES, type ExerciseDto } from "@plyntiq/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createTestClient, PASSWORD, registerUser, type TestClient } from "./helpers";

async function list(client: TestClient, cookie: string) {
  const res = await client.request("/api/exercises", { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { exercises: ExerciseDto[] }).exercises;
}

function create(client: TestClient, cookie: string, body: Record<string, unknown>) {
  return client.request("/api/exercises", { method: "POST", cookie, body: JSON.stringify(body) });
}

const CUSTOM = { name: "Landmine press", category: "push", isLowerBody: false };

describe("exercise catalog", () => {
  it("seeded global exercises match the shared catalog", async () => {
    const { results } = await env.DB.prepare(
      "SELECT id, name, category, is_lower_body FROM exercises WHERE owner_user_id IS NULL",
    ).all<{ id: string; name: string; category: string; is_lower_body: number }>();
    const seeded = results.map((r) => [r.id, r.name, r.category, r.is_lower_body === 1]).sort();
    const expected = EXERCISES.map((e) => [e.id, e.name, e.category, e.isLowerBody]).sort();
    expect(seeded).toEqual(expected);
  });

  it("requires authentication", async () => {
    const client = createTestClient();
    expect((await client.request("/api/exercises")).status).toBe(401);
    expect((await create(client, "", CUSTOM)).status).toBe(401);
  });

  it("lists the global catalog for a new athlete", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const exercises = await list(client, cookie);
    expect(exercises).toHaveLength(EXERCISES.length);
    expect(exercises.every((e) => !e.isCustom)).toBe(true);
    expect(exercises.find((e) => e.id === "back_squat")).toMatchObject({ category: "squat", isLowerBody: true });
  });
});

describe("custom exercises", () => {
  it("creates a custom exercise that appears in the athlete's list", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await create(client, cookie, { ...CUSTOM, name: "  Landmine   press " });
    expect(res.status).toBe(201);
    const { exercise } = (await res.json()) as { exercise: ExerciseDto };
    expect(exercise).toMatchObject({ name: "Landmine press", category: "push", isCustom: true });
    expect((await list(client, cookie)).map((e) => e.id)).toContain(exercise.id);
  });

  it("rejects duplicate names regardless of case, including global names", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    expect((await create(client, cookie, CUSTOM)).status).toBe(201);

    const dup = await create(client, cookie, { ...CUSTOM, name: "LANDMINE PRESS" });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: { code: string } }).error.code).toBe("conflict");

    expect((await create(client, cookie, { ...CUSTOM, name: "back squat" })).status).toBe(409);
  });

  it("lets two athletes use the same custom name", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    expect((await create(client, alice.cookie, CUSTOM)).status).toBe(201);
    expect((await create(client, bob.cookie, CUSTOM)).status).toBe(201);
  });

  it("validates the body and rejects ownership smuggling", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    for (const bad of [
      { ...CUSTOM, name: "   " },
      { ...CUSTOM, name: "x".repeat(81) },
      { ...CUSTOM, category: "cardio" },
      { ...CUSTOM, isLowerBody: "yes" },
      { ...CUSTOM, ownerUserId: body.user.id },
      { ...CUSTOM, id: "back_squat" },
    ]) {
      expect((await create(client, cookie, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("never shows one athlete's custom exercises to another", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    const { exercise } = (await (await create(client, alice.cookie, CUSTOM)).json()) as { exercise: ExerciseDto };

    const bobs = await list(client, bob.cookie);
    expect(bobs.map((e) => e.id)).not.toContain(exercise.id);
    expect(bobs.some((e) => e.isCustom)).toBe(false);
  });

  it("deletes custom exercises with the account", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    await create(client, cookie, CUSTOM);
    await client.request("/api/auth/delete-user", { method: "POST", cookie, body: JSON.stringify({ password: PASSWORD }) });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM exercises WHERE owner_user_id = ?")
      .bind(body.user.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
