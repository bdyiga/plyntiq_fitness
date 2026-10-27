import type { ConditioningSessionDto, Page } from "@plyntiq/shared";
import { describe, expect, it } from "vitest";
import { countRows, createTestClient, PASSWORD, registerUser, send, type TestClient } from "./helpers";

const SESSION = {
  sessionDate: "2026-10-20",
  type: "run",
  durationS: 1800,
  distanceValue: 5,
  distanceUnit: "km",
  sessionRpe: 6,
  notes: "Easy aerobic",
};

async function createSession(client: TestClient, cookie: string, body: unknown = SESSION) {
  const res = await send(client, cookie, "POST", "/api/conditioning", body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { session: ConditioningSessionDto }).session;
}

describe("conditioning CRUD", () => {
  it("requires authentication", async () => {
    const client = createTestClient();
    expect((await client.request("/api/conditioning")).status).toBe(401);
    expect((await send(client, "", "POST", "/api/conditioning", SESSION)).status).toBe(401);
  });

  it("creates a session and computes distance_m on the server", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const session = await createSession(client, cookie);
    expect(session).toMatchObject({ type: "run", durationS: 1800, distanceValue: 5, distanceUnit: "km", distanceM: 5000 });

    const miles = await createSession(client, cookie, { ...SESSION, distanceValue: 1, distanceUnit: "mi" });
    expect(miles.distanceM).toBe(1609.344);

    const fetched = await send(client, cookie, "GET", `/api/conditioning/${session.id}`);
    expect(((await fetched.json()) as { session: ConditioningSessionDto }).session).toEqual(session);
  });

  it("allows sessions without a distance", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const { distanceValue: _v, distanceUnit: _u, ...noDistance } = SESSION;
    const session = await createSession(client, cookie, { ...noDistance, type: "intervals" });
    expect(session).toMatchObject({ distanceValue: null, distanceUnit: null, distanceM: null });
  });

  it("edits a session, recomputing or clearing the distance", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const session = await createSession(client, cookie);
    const path = `/api/conditioning/${session.id}`;

    const rpe = ((await (await send(client, cookie, "PATCH", path, { sessionRpe: 7.5 })).json()) as {
      session: ConditioningSessionDto;
    }).session;
    expect(rpe).toMatchObject({ sessionRpe: 7.5, distanceM: 5000 });

    const moved = ((await (
      await send(client, cookie, "PATCH", path, { distanceValue: 3, distanceUnit: "mi" })
    ).json()) as { session: ConditioningSessionDto }).session;
    expect(moved.distanceM).toBeCloseTo(4828.032, 6);

    const cleared = ((await (
      await send(client, cookie, "PATCH", path, { distanceValue: null, distanceUnit: null })
    ).json()) as { session: ConditioningSessionDto }).session;
    expect(cleared).toMatchObject({ distanceValue: null, distanceUnit: null, distanceM: null });
  });

  it("deletes a session", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const session = await createSession(client, cookie);
    expect((await send(client, cookie, "DELETE", `/api/conditioning/${session.id}`)).status).toBe(204);
    expect((await send(client, cookie, "GET", `/api/conditioning/${session.id}`)).status).toBe(404);
  });

  it("paginates newest first", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    for (const day of ["2026-10-01", "2026-10-03", "2026-10-02"]) {
      await createSession(client, cookie, { ...SESSION, sessionDate: day });
    }
    const first = (await (await send(client, cookie, "GET", "/api/conditioning?limit=2")).json()) as Page<ConditioningSessionDto>;
    expect(first.items.map((s) => s.sessionDate)).toEqual(["2026-10-03", "2026-10-02"]);
    const second = (await (
      await send(client, cookie, "GET", `/api/conditioning?limit=2&cursor=${first.nextCursor}`)
    ).json()) as Page<ConditioningSessionDto>;
    expect(second.items.map((s) => s.sessionDate)).toEqual(["2026-10-01"]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("conditioning validation", () => {
  it.each([
    ["unknown type", { type: "swim" }, "type"],
    ["zero duration", { durationS: 0 }, "durationS"],
    ["duration over 24 h", { durationS: 86_401 }, "durationS"],
    ["RPE above 10", { sessionRpe: 11 }, "sessionRpe"],
    ["negative RPE", { sessionRpe: -1 }, "sessionRpe"],
    ["distance without unit", { distanceUnit: null }, "distanceUnit"],
    ["unit without distance", { distanceValue: null }, "distanceUnit"],
    ["zero distance", { distanceValue: 0 }, "distanceValue"],
    ["unknown distance unit", { distanceUnit: "yd" }, "distanceUnit"],
    ["client-supplied distanceM", { distanceM: 1 }, ""],
    ["impossible date", { sessionDate: "2026-13-01" }, "sessionDate"],
    ["smuggled userId", { userId: "someone" }, ""],
  ])("rejects %s", async (_label, override, path) => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await send(client, cookie, "POST", "/api/conditioning", { ...SESSION, ...override });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: { path: string }[] } };
    expect(body.error.issues.map((i) => i.path)).toContain(path);
  });

  it("rejects a PATCH that changes only half of the distance pair, or nothing", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const session = await createSession(client, cookie);
    const path = `/api/conditioning/${session.id}`;
    expect((await send(client, cookie, "PATCH", path, { distanceValue: 10 })).status).toBe(400);
    expect((await send(client, cookie, "PATCH", path, { distanceUnit: "mi" })).status).toBe(400);
    expect((await send(client, cookie, "PATCH", path, {})).status).toBe(400);
  });
});

describe("conditioning cross-account isolation", () => {
  it("returns 404 for another athlete's session on GET, PATCH and DELETE", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);
    const session = await createSession(client, alice.cookie);
    const path = `/api/conditioning/${session.id}`;

    expect((await send(client, bob.cookie, "GET", path)).status).toBe(404);
    expect((await send(client, bob.cookie, "PATCH", path, { sessionRpe: 1 })).status).toBe(404);
    expect((await send(client, bob.cookie, "DELETE", path)).status).toBe(404);

    const bobList = (await (await send(client, bob.cookie, "GET", "/api/conditioning")).json()) as Page<ConditioningSessionDto>;
    expect(bobList.items).toHaveLength(0);

    const intact = (await (await send(client, alice.cookie, "GET", path)).json()) as { session: ConditioningSessionDto };
    expect(intact.session).toEqual(session);
  });

  it("deletes sessions with the account", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    await createSession(client, cookie);
    await send(client, cookie, "POST", "/api/auth/delete-user", { password: PASSWORD });
    expect(await countRows("conditioning_sessions", "user_id = ?", body.user.id)).toBe(0);
  });
});
