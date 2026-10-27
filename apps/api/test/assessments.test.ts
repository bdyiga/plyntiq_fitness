import {
  ASSESSMENT_DEFINITIONS,
  type AssessmentDefinitionDto,
  type AssessmentResultDto,
  type Page,
} from "@plyntiq/shared";
import { describe, expect, it } from "vitest";
import { countRows, createTestClient, PASSWORD, registerUser, send, type TestClient } from "./helpers";

const SPRINT = {
  definitionId: "sprint_20m",
  assessedOn: "2026-10-20",
  value: 3.12,
  unit: "s",
  method: "timing_gates",
  surface: "grass",
  footwear: "boots",
  conditionsNote: "Light headwind",
};

const JUMP = {
  definitionId: "vertical_jump",
  assessedOn: "2026-10-20",
  value: 24,
  unit: "in",
  method: "wall_reach",
};

async function createResult(client: TestClient, cookie: string, body: unknown = SPRINT) {
  const res = await send(client, cookie, "POST", "/api/assessments", body);
  expect(res.status, await res.clone().text()).toBe(201);
  return ((await res.json()) as { result: AssessmentResultDto }).result;
}

describe("assessment definitions", () => {
  it("seeded definitions match the shared catalog", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await send(client, cookie, "GET", "/api/assessments/definitions");
    const { definitions } = (await res.json()) as { definitions: AssessmentDefinitionDto[] };
    const seeded = definitions.map((d) => [d.id, d.name, d.quality, d.canonicalUnit, d.units, d.betterDirection, d.allowedMethods]);
    const expected = ASSESSMENT_DEFINITIONS.map((d) => [d.id, d.name, d.quality, d.units[0], d.units, d.betterDirection, d.methods]);
    expect(seeded.sort()).toEqual(expected.sort());
  });

  it("requires authentication", async () => {
    const client = createTestClient();
    expect((await client.request("/api/assessments/definitions")).status).toBe(401);
    expect((await client.request("/api/assessments")).status).toBe(401);
  });
});

describe("assessment results CRUD", () => {
  it("stores the original value and a canonical value", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const sprint = await createResult(client, cookie);
    expect(sprint).toMatchObject({ value: 3.12, unit: "s", valueCanonical: 3.12, method: "timing_gates", surface: "grass" });

    const jump = await createResult(client, cookie, JUMP);
    expect(jump).toMatchObject({ value: 24, unit: "in", surface: null, footwear: null, conditionsNote: null });
    expect(jump.valueCanonical).toBeCloseTo(60.96, 10);

    const fetched = await send(client, cookie, "GET", `/api/assessments/${jump.id}`);
    expect(((await fetched.json()) as { result: AssessmentResultDto }).result).toEqual(jump);
  });

  it("edits a result, recomputing the canonical value", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const jump = await createResult(client, cookie, JUMP);
    const path = `/api/assessments/${jump.id}`;

    const res = await send(client, cookie, "PATCH", path, { value: 55, unit: "cm", method: "jump_mat", notes: "Fresh" });
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { result: AssessmentResultDto }).result;
    expect(updated).toMatchObject({ value: 55, unit: "cm", valueCanonical: 55, method: "jump_mat", notes: "Fresh" });
    expect(updated.definitionId).toBe("vertical_jump");
  });

  it("deletes a result", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const result = await createResult(client, cookie);
    expect((await send(client, cookie, "DELETE", `/api/assessments/${result.id}`)).status).toBe(204);
    expect((await send(client, cookie, "GET", `/api/assessments/${result.id}`)).status).toBe(404);
  });

  it("lists newest first and filters by definition", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    await createResult(client, cookie, { ...SPRINT, assessedOn: "2026-10-01" });
    await createResult(client, cookie, { ...JUMP, assessedOn: "2026-10-02" });
    await createResult(client, cookie, { ...SPRINT, assessedOn: "2026-10-03" });

    const all = (await (await send(client, cookie, "GET", "/api/assessments")).json()) as Page<AssessmentResultDto>;
    expect(all.items.map((r) => r.assessedOn)).toEqual(["2026-10-03", "2026-10-02", "2026-10-01"]);

    const sprints = (await (
      await send(client, cookie, "GET", "/api/assessments?definitionId=sprint_20m&limit=1")
    ).json()) as Page<AssessmentResultDto>;
    expect(sprints.items.map((r) => r.assessedOn)).toEqual(["2026-10-03"]);
    const next = (await (
      await send(client, cookie, "GET", `/api/assessments?definitionId=sprint_20m&limit=1&cursor=${sprints.nextCursor}`)
    ).json()) as Page<AssessmentResultDto>;
    expect(next.items.map((r) => r.assessedOn)).toEqual(["2026-10-01"]);

    expect((await send(client, cookie, "GET", "/api/assessments?definitionId=bench_1rm")).status).toBe(400);
    expect((await send(client, cookie, "GET", "/api/assessments?foo=1")).status).toBe(400);
  });
});

describe("assessment validation", () => {
  it.each([
    ["unknown definition", { definitionId: "bench_1rm" }, "definitionId"],
    ["a jump method on a sprint", { method: "jump_mat" }, "method"],
    ["a sprint method on a jump", { ...JUMP, method: "timing_gates" }, "method"],
    ["unknown method", { method: "stopwatch_app" }, "method"],
    ["a height unit on a sprint", { unit: "cm" }, "unit"],
    ["a time unit on a jump", { ...JUMP, unit: "s" }, "unit"],
    ["an implausible sprint time (typo)", { value: 31.2 }, "value"],
    ["an implausible jump height", { ...JUMP, value: 70 }, "value"],
    ["zero value", { value: 0 }, "value"],
    ["unknown surface", { surface: "sand" }, "surface"],
    ["unknown footwear", { footwear: "flip_flops" }, "footwear"],
    ["an overlong conditions note", { conditionsNote: "x".repeat(201) }, "conditionsNote"],
    ["client-supplied valueCanonical", { valueCanonical: 1 }, ""],
    ["smuggled userId", { userId: "someone" }, ""],
    ["future date", { assessedOn: "2099-01-01" }, "assessedOn"],
  ])("rejects %s", async (_label, override, path) => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await send(client, cookie, "POST", "/api/assessments", { ...SPRINT, ...override });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: { path: string }[] } };
    expect(body.error.issues.map((i) => i.path)).toContain(path);
  });

  it("applies the definition's rules when patching", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const sprint = await createResult(client, cookie);
    const path = `/api/assessments/${sprint.id}`;
    expect((await send(client, cookie, "PATCH", path, { method: "force_plate" })).status).toBe(400);
    expect((await send(client, cookie, "PATCH", path, { unit: "in" })).status).toBe(400);
    expect((await send(client, cookie, "PATCH", path, { definitionId: "vertical_jump" })).status).toBe(400);
    expect((await send(client, cookie, "PATCH", path, {})).status).toBe(400);
    expect((await send(client, cookie, "PATCH", path, { method: "hand_timed", surface: null })).status).toBe(200);
  });
});

describe("assessment cross-account isolation", () => {
  it("returns 404 for another athlete's result on GET, PATCH and DELETE", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    const result = await createResult(client, alice.cookie);
    const path = `/api/assessments/${result.id}`;

    expect((await send(client, bob.cookie, "GET", path)).status).toBe(404);
    expect((await send(client, bob.cookie, "PATCH", path, { value: 2.5 })).status).toBe(404);
    expect((await send(client, bob.cookie, "DELETE", path)).status).toBe(404);

    const bobList = (await (await send(client, bob.cookie, "GET", "/api/assessments")).json()) as Page<AssessmentResultDto>;
    expect(bobList.items).toHaveLength(0);

    const intact = (await (await send(client, alice.cookie, "GET", path)).json()) as { result: AssessmentResultDto };
    expect(intact.result).toEqual(result);
  });

  it("deletes results with the account", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    await createResult(client, cookie);
    await send(client, cookie, "POST", "/api/auth/delete-user", { password: PASSWORD });
    expect(await countRows("assessment_results", "user_id = ?", body.user.id)).toBe(0);
  });
});
