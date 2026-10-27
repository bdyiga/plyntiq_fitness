import type { ImportJobDto, ImportPreviewDto, Page, WorkoutDto } from "@plyntiq/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { deleteExpiredPreviews } from "../src/modules/imports/import.repository";
import { countRows, createTestClient, PASSWORD, registerUser, send, type TestClient } from "./helpers";

const WORKOUT_HEADER = "date,exercise,reps,load,unit,rpe,notes";
const CONDITIONING_HEADER = "date,type,duration_s,distance,distance_unit,session_rpe,notes";
const ASSESSMENT_HEADER = "date,test,value,unit,method,surface,footwear,conditions,notes";

const csv = (...lines: string[]) => lines.join("\r\n");

function upload(client: TestClient, cookie: string, kind: string, text: string) {
  return send(client, cookie, "POST", "/api/imports", { kind, csv: text });
}

async function preview(client: TestClient, cookie: string, kind: string, text: string) {
  const res = await upload(client, cookie, kind, text);
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as ImportPreviewDto;
}

async function confirm(client: TestClient, cookie: string, id: string) {
  const res = await send(client, cookie, "POST", `/api/imports/${id}/confirm`, {});
  expect(res.status, await res.clone().text()).toBe(200);
  return ((await res.json()) as { job: ImportJobDto }).job;
}

async function exportCsv(client: TestClient, cookie: string, kind: string) {
  return (await send(client, cookie, "GET", `/api/me/export/${kind}.csv`)).text();
}

const fileError = async (res: Response) => {
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { issues: { path: string; message: string }[] } };
  return body.error.issues[0]!.message;
};

describe("CSV import: workouts", () => {
  it("previews valid rows and row errors, saves nothing until confirmed, then groups sets by date", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    const p = await preview(
      client,
      cookie,
      "workouts",
      csv(
        WORKOUT_HEADER,
        "2026-09-01,Back squat,5,225,lb,8,Felt good",
        "2026-09-01,back squat,3,110,kg,,",
        "2026-09-03,Deadlift,1,180,kg,9,",
        "2026-09-03,Underwater basket weaving,5,10,kg,,",
        "2026-09-04,Deadlift,0,180,kg,,",
      ),
    );
    expect(p.job).toMatchObject({ kind: "workouts", status: "preview", rowCount: 5, acceptedCount: 3, rejectedCount: 2 });
    expect(p.errors).toEqual([
      { rowNumber: 5, field: "exercise", message: expect.stringContaining("Unknown exercise") },
      { rowNumber: 6, field: "reps", message: "Reps must be 1–100" },
    ]);
    expect(p.sample[0]).toEqual({
      rowNumber: 2,
      cells: { date: "2026-09-01", exercise: "Back squat", reps: "5", load: "225", unit: "lb", rpe: "8", notes: "Felt good" },
    });
    expect(await countRows("workouts", "user_id = ?", body.user.id)).toBe(0);

    const job = await confirm(client, cookie, p.job.id);
    expect(job.status).toBe("confirmed");
    const list = (await (await send(client, cookie, "GET", "/api/workouts")).json()) as Page<WorkoutDto>;
    expect(list.items.map((w) => [w.workoutDate, w.notes, w.sets.length])).toEqual([
      ["2026-09-03", null, 1],
      ["2026-09-01", "Felt good", 2],
    ]);
    expect(list.items[1]!.sets[0]!.loadKg).toBeCloseTo(102.058, 3);
    expect(await countRows("workouts", "user_id = ? AND import_job_id = ?", body.user.id, job.id)).toBe(2);
    expect(await countRows("import_staged_rows", "import_job_id = ?", job.id)).toBe(0);
  });

  it("can't confirm twice or confirm an expired preview", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const p = await preview(client, cookie, "workouts", csv(WORKOUT_HEADER, "2026-09-01,Back squat,5,100,kg,,"));
    await confirm(client, cookie, p.job.id);
    expect((await send(client, cookie, "POST", `/api/imports/${p.job.id}/confirm`, {})).status).toBe(409);

    const late = await preview(client, cookie, "workouts", csv(WORKOUT_HEADER, "2026-09-02,Back squat,5,100,kg,,"));
    await env.DB.prepare("UPDATE import_jobs SET expires_at = ? WHERE id = ?").bind(Date.now() - 1000, late.job.id).run();
    const res = await send(client, cookie, "POST", `/api/imports/${late.job.id}/confirm`, {});
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/expired/);
  });
});

describe("CSV import: round trip", () => {
  it("re-imports an export unchanged, for every record type", async () => {
    const client = createTestClient();
    const { cookie: source } = await registerUser(client);
    await send(client, source, "POST", "/api/workouts", {
      workoutDate: "2026-09-01",
      notes: 'Heavy, "grindy" day\nthen sprints',
      sets: [
        { exerciseId: "back_squat", reps: 5, loadValue: 225, loadUnit: "lb", rpe: 8.5 },
        { exerciseId: "nordic_curl", reps: 6, loadValue: 0, loadUnit: "kg" },
      ],
    });
    await send(client, source, "POST", "/api/conditioning", {
      sessionDate: "2026-09-02",
      type: "intervals",
      durationS: 1290,
      distanceValue: 2.5,
      distanceUnit: "mi",
      sessionRpe: 7,
      notes: "=SUM(A1:A9)",
    });
    await send(client, source, "POST", "/api/conditioning", { sessionDate: "2026-09-03", type: "run", durationS: 600, sessionRpe: 4 });
    await send(client, source, "POST", "/api/assessments", {
      definitionId: "sprint_20m",
      assessedOn: "2026-09-04",
      value: 3.12,
      unit: "s",
      method: "hand_timed",
      surface: "grass",
      footwear: "boots",
      conditionsNote: "Light headwind, cold",
    });
    await send(client, source, "POST", "/api/assessments", {
      definitionId: "vertical_jump",
      assessedOn: "2026-09-04",
      value: 24,
      unit: "in",
      method: "wall_reach",
    });

    const { cookie: target } = await registerUser(client);
    for (const kind of ["workouts", "conditioning", "assessments"]) {
      const exported = await exportCsv(client, source, kind);
      const p = await preview(client, target, kind, exported);
      expect(p.errors).toEqual([]);
      await confirm(client, target, p.job.id);
      expect(await exportCsv(client, target, kind)).toBe(exported);
    }
  });
});

describe("CSV import: file handling", () => {
  it("accepts a BOM, CRLF or LF, quoted commas and the export's canonical column", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const p = await preview(
      client,
      cookie,
      "conditioning",
      `﻿${CONDITIONING_HEADER},distance_m\n2026-09-02,run,1800,5,km,6,"Easy, then strides",5000\n\n`,
    );
    expect(p.errors).toEqual([]);
    expect(p.sample[0]!.cells.notes).toBe("Easy, then strides");
  });

  it("restores formula-neutralized text", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const p = await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-02,run,600,,,5,'-5 min cooldown"));
    expect(p.sample[0]!.cells.notes).toBe("-5 min cooldown");
  });

  it("reports rows with the wrong number of cells, bad dates and mismatched units", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const p = await preview(
      client,
      cookie,
      "assessments",
      csv(
        ASSESSMENT_HEADER,
        "2026-09-04,sprint_20m,3.1,s,timing_gates,,,,",
        "2026-09-04,sprint_20m,3.1",
        "2099-01-01,sprint_20m,3.1,s,timing_gates,,,,",
        "2026-09-04,vertical_jump,3.1,s,jump_mat,,,,",
        "2026-09-04,sprint_20m,31,s,timing_gates,,,,",
      ),
    );
    expect(p.job.acceptedCount).toBe(1);
    expect(p.errors.map((e) => [e.rowNumber, e.field])).toEqual([
      [3, "row"],
      [4, "date"],
      [5, "unit"],
      [6, "value"],
    ]);
  });

  it("rejects files that aren't the template", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    expect(await fileError(await upload(client, cookie, "workouts", "date,exercise,sets\n2026-09-01,Squat,5"))).toMatch(
      /first row must be the column names: date, exercise, reps/,
    );
    expect(await fileError(await upload(client, cookie, "workouts", WORKOUT_HEADER))).toMatch(/no rows/);
    expect(await fileError(await upload(client, cookie, "workouts", `PK\u0003\u0004\u0000\u0000binary`))).toMatch(/isn't a CSV text file/);
    expect(await fileError(await upload(client, cookie, "workouts", `${WORKOUT_HEADER}\n2026-09-01,"Back squat,5,100,kg,,`))).toMatch(
      /quote isn't closed/,
    );
    const tooMany = [WORKOUT_HEADER, ...Array.from({ length: 2001 }, () => "2026-09-01,Back squat,5,100,kg,,")].join("\n");
    expect(await fileError(await upload(client, cookie, "workouts", tooMany))).toMatch(/2000 rows or fewer/);
    expect(await fileError(await upload(client, cookie, "workouts", ""))).toMatch(/empty/);
    expect((await upload(client, cookie, "imports", csv(WORKOUT_HEADER))).status).toBe(400);
  });

  it("limits file size", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    expect(await fileError(await upload(client, cookie, "workouts", "x".repeat(1_000_001)))).toMatch(/1 MB or less/);
    expect((await upload(client, cookie, "workouts", "x".repeat(3_000_000))).status).toBe(413);
    // Other routes keep the 64 KB limit.
    const big = await send(client, cookie, "POST", "/api/conditioning", { notes: "x".repeat(70_000) });
    expect(big.status).toBe(413);
  });

  it("requires JSON from the app's own origin", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/imports", {
      method: "POST",
      cookie,
      headers: { "content-type": "text/csv" },
      body: csv(WORKOUT_HEADER, "2026-09-01,Back squat,5,100,kg,,"),
    });
    expect(res.status).toBe(415);
    expect((await client.request("/api/imports", { method: "POST", body: "{}" })).status).toBe(401);
  });
});

describe("CSV import: duplicates and undo", () => {
  const FILE = csv(ASSESSMENT_HEADER, "2026-09-04,sprint_20m,3.1,s,timing_gates,grass,,,", "2026-09-11,sprint_20m,3.0,s,timing_gates,grass,,,");

  it("refuses a file that was already imported, but replaces an unconfirmed preview", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    const first = await preview(client, cookie, "assessments", FILE);
    const again = await preview(client, cookie, "assessments", FILE);
    expect(again.job.id).not.toBe(first.job.id);
    expect(await countRows("import_jobs", "user_id = ?", body.user.id)).toBe(1);

    await confirm(client, cookie, again.job.id);
    const res = await upload(client, cookie, "assessments", FILE);
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/Undo that import first/);
  });

  it("warns about rows that match existing records", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    await send(client, cookie, "POST", "/api/assessments", {
      definitionId: "sprint_20m",
      assessedOn: "2026-09-04",
      value: 3.1,
      unit: "s",
      method: "timing_gates",
    });
    const p = await preview(client, cookie, "assessments", FILE);
    expect(p.warnings).toEqual([{ rowNumber: 2, field: "row", message: "Matches a result you already logged" }]);
    expect(p.job.acceptedCount).toBe(2);
  });

  it("undoes an import, including records edited since, and allows importing the file again", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    await send(client, cookie, "POST", "/api/assessments", {
      definitionId: "vertical_jump",
      assessedOn: "2026-09-01",
      value: 50,
      unit: "cm",
      method: "jump_mat",
    });
    const job = await confirm(client, cookie, (await preview(client, cookie, "assessments", FILE)).job.id);
    const imported = await env.DB.prepare("SELECT id FROM assessment_results WHERE import_job_id = ? LIMIT 1").bind(job.id).first<{ id: string }>();
    await send(client, cookie, "PATCH", `/api/assessments/${imported!.id}`, { notes: "edited" });

    const undo = await send(client, cookie, "DELETE", `/api/imports/${job.id}`);
    expect(await undo.json()).toEqual({ result: "undone", removed: 2 });
    expect(await countRows("assessment_results", "user_id = ?", body.user.id)).toBe(1); // the hand-logged one stays
    expect(await countRows("import_jobs", "id = ?", job.id)).toBe(0);
    await preview(client, cookie, "assessments", FILE);
  });

  it("cancels a preview", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const p = await preview(client, cookie, "assessments", FILE);
    expect(await (await send(client, cookie, "DELETE", `/api/imports/${p.job.id}`)).json()).toEqual({ result: "cancelled", removed: 0 });
    expect(await countRows("import_staged_rows", "import_job_id = ?", p.job.id)).toBe(0);
  });
});

describe("CSV import: authorization and retention", () => {
  it("keeps imports private to their owner", async () => {
    const client = createTestClient();
    const { cookie: owner, body } = await registerUser(client);
    const p = await preview(client, owner, "conditioning", csv(CONDITIONING_HEADER, "2026-09-02,run,600,,,5,"));
    const { cookie: other } = await registerUser(client);
    await send(client, other, "POST", "/api/conditioning", { sessionDate: "2026-09-02", type: "run", durationS: 600, sessionRpe: 5 });

    expect(((await (await send(client, other, "GET", "/api/imports")).json()) as { imports: unknown[] }).imports).toEqual([]);
    expect((await send(client, other, "POST", `/api/imports/${p.job.id}/confirm`, {})).status).toBe(404);
    expect((await send(client, other, "DELETE", `/api/imports/${p.job.id}`)).status).toBe(404);
    // The other athlete's identical session doesn't show up as a duplicate for the owner.
    expect(p.warnings).toEqual([]);

    const job = await confirm(client, owner, p.job.id);
    expect((await send(client, other, "DELETE", `/api/imports/${job.id}`)).status).toBe(404);
    expect(await countRows("conditioning_sessions", "user_id = ?", body.user.id)).toBe(1);
  });

  it("lists the athlete's imports newest first", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const a = await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-02,run,600,,,5,"));
    await confirm(client, cookie, a.job.id);
    const b = await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-03,run,600,,,5,"));
    const { imports } = (await (await send(client, cookie, "GET", "/api/imports")).json()) as { imports: ImportJobDto[] };
    expect(imports.map((j) => [j.id, j.status])).toEqual([
      [b.job.id, "preview"],
      [a.job.id, "confirmed"],
    ]);
  });

  it("deletes expired previews and their staged rows, but keeps confirmed imports", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const kept = await confirm(client, cookie, (await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-02,run,600,,,5,"))).job.id);
    const stale = await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-03,run,600,,,5,"));

    await deleteExpiredPreviews(createDb(env.DB), new Date(Date.now() + 25 * 60 * 60 * 1000));
    expect(await countRows("import_jobs", "id = ?", stale.job.id)).toBe(0);
    expect(await countRows("import_staged_rows", "import_job_id = ?", stale.job.id)).toBe(0);
    expect(await countRows("import_jobs", "id = ?", kept.id)).toBe(1);
  });

  it("deletes import jobs and imported records with the account", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    await confirm(client, cookie, (await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-02,run,600,,,5,"))).job.id);
    await preview(client, cookie, "conditioning", csv(CONDITIONING_HEADER, "2026-09-03,run,600,,,5,"));
    const res = await client.request("/api/auth/delete-user", { method: "POST", cookie, body: JSON.stringify({ password: PASSWORD }) });
    expect(res.status).toBe(200);
    expect(await countRows("import_jobs", "user_id = ?", body.user.id)).toBe(0);
    expect(await countRows("conditioning_sessions", "user_id = ?", body.user.id)).toBe(0);
  });
});
