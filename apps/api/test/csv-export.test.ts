import { describe, expect, it } from "vitest";
import { createTestClient, registerUser, send, type TestClient } from "./helpers";

async function post(client: TestClient, cookie: string, path: string, body: unknown) {
  const res = await send(client, cookie, "POST", path, body);
  expect(res.status, await res.clone().text()).toBe(201);
}

async function csvLines(client: TestClient, cookie: string, file: string) {
  const res = await send(client, cookie, "GET", `/api/me/export/${file}`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(res.headers.get("content-disposition")).toMatch(new RegExp(`attachment; filename="plyntiq-${file.replace(".csv", "")}-\\d{4}-\\d{2}-\\d{2}\\.csv"`));
  // Response.text() strips a byte-order mark, so check the raw bytes for it.
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return new TextDecoder().decode(bytes).split("\r\n").filter(Boolean);
}

describe("CSV export", () => {
  it("exports workouts one row per set in the template columns plus load_kg", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    await post(client, cookie, "/api/workouts", {
      workoutDate: "2026-10-20",
      notes: "Heavy, then sprints",
      sets: [
        { exerciseId: "back_squat", reps: 5, loadValue: 225, loadUnit: "lb", rpe: 8 },
        { exerciseId: "back_squat", reps: 3, loadValue: 110, loadUnit: "kg" },
      ],
    });
    const lines = await csvLines(client, cookie, "workouts.csv");
    expect(lines[0]).toBe("date,exercise,reps,load,unit,rpe,notes,load_kg");
    expect(lines[1]).toMatch(/^2026-10-20,Back squat,5,225,lb,8,"Heavy, then sprints",102\.058/);
    expect(lines[2]).toBe('2026-10-20,Back squat,3,110,kg,,"Heavy, then sprints",110');
  });

  it("exports conditioning and assessments with catalog IDs and canonical values", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    await post(client, cookie, "/api/conditioning", {
      sessionDate: "2026-10-19",
      type: "intervals",
      durationS: 1290,
      distanceValue: 2,
      distanceUnit: "mi",
      sessionRpe: 7,
    });
    await post(client, cookie, "/api/assessments", {
      definitionId: "vertical_jump",
      assessedOn: "2026-10-18",
      value: 24,
      unit: "in",
      method: "wall_reach",
      surface: "track",
    });
    expect(await csvLines(client, cookie, "conditioning.csv")).toEqual([
      "date,type,duration_s,distance,distance_unit,session_rpe,notes,distance_m",
      "2026-10-19,intervals,1290,2,mi,7,,3218.688",
    ]);
    const assessments = await csvLines(client, cookie, "assessments.csv");
    expect(assessments[0]).toBe("date,test,value,unit,method,surface,footwear,conditions,notes,value_canonical");
    expect(assessments[1]).toMatch(/^2026-10-18,vertical_jump,24,in,wall_reach,track,,,,60\.96/);
  });

  it("neutralizes text that a spreadsheet would run as a formula", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    await post(client, cookie, "/api/conditioning", {
      sessionDate: "2026-10-19",
      type: "run",
      durationS: 600,
      sessionRpe: 5,
      notes: '=HYPERLINK("http://evil.example","x")',
    });
    const [, row] = await csvLines(client, cookie, "conditioning.csv");
    expect(row).toBe('2026-10-19,run,600,,,5,"\'=HYPERLINK(""http://evil.example"",""x"")",');
  });

  it("only exports the signed-in athlete's records", async () => {
    const client = createTestClient();
    const { cookie: owner } = await registerUser(client);
    await post(client, owner, "/api/workouts", {
      workoutDate: "2026-10-20",
      sets: [{ exerciseId: "deadlift", reps: 1, loadValue: 200, loadUnit: "kg" }],
    });
    const { cookie: other } = await registerUser(client);
    for (const file of ["workouts.csv", "conditioning.csv", "assessments.csv"]) {
      expect(await csvLines(client, other, file)).toHaveLength(1); // header only
    }
  });

  it("requires a session and rejects unknown files", async () => {
    const client = createTestClient();
    expect((await client.request("/api/me/export/workouts.csv")).status).toBe(401);
    const { cookie } = await registerUser(client);
    expect((await send(client, cookie, "GET", "/api/me/export/users.csv")).status).toBe(404);
    expect((await send(client, cookie, "GET", "/api/me/export/workouts")).status).toBe(404);
  });
});
