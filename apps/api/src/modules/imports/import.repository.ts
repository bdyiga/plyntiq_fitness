import {
  toAssessmentCanonical,
  toKg,
  toMeters,
  type CreateAssessmentInput,
  type CreateConditioningInput,
  type CsvKind,
  type ImportJobDto,
  type ImportRowIssue,
} from "@plyntiq/shared";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "../../db/client";
import {
  assessmentResults,
  conditioningSessions,
  exercises,
  importJobs,
  importRowErrors,
  importStagedRows,
  workouts,
  workoutSets,
} from "../../db/schema";
import { visibleTo } from "../exercises/exercise.repository";
import type { StagedPayload, ValidatedRows, WorkoutSetPayload } from "./csv-rows";

/**
 * Ownership-scoped like every repository: each function takes the session's
 * `userId`, and another athlete's job behaves exactly like a missing one.
 */

export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

/** D1 binds at most 100 parameters per statement. */
const rowsPerInsert = (columns: number) => Math.floor(100 / columns);

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type JobRow = typeof importJobs.$inferSelect;

export class DuplicateFileError extends Error {
  override name = "DuplicateFileError";
  constructor(readonly job: ImportJobDto) {
    super("This file has already been imported");
  }
}

export class ImportStateError extends Error {
  override name = "ImportStateError";
}

export function toJobDto(row: JobRow): ImportJobDto {
  return {
    id: row.id,
    kind: row.kind as CsvKind,
    status: row.status as ImportJobDto["status"],
    rowCount: row.rowCount,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

/** Lower-cased name → ID for the global catalog and the athlete's own exercises (archived included). */
export async function exerciseIdsByName(db: Database, userId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(visibleTo(userId));
  return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
}

function dateSpan(dates: string[]): [string, string] | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return [sorted[0]!, sorted.at(-1)!];
}

/** Valid rows that match a record the athlete already has. Imported anyway; the athlete decides. */
export async function possibleDuplicates(
  db: Database,
  userId: string,
  kind: CsvKind,
  staged: ValidatedRows["staged"],
): Promise<ImportRowIssue[]> {
  if (kind === "workouts") {
    const rows = staged as ValidatedRows<WorkoutSetPayload>["staged"];
    const span = dateSpan(rows.map((r) => r.payload.date));
    if (!span) return [];
    const existing = await db
      .selectDistinct({ date: workouts.workoutDate })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), gte(workouts.workoutDate, span[0]), lte(workouts.workoutDate, span[1])));
    const dates = new Set(existing.map((e) => e.date));
    const warned = new Set<string>();
    return rows.flatMap((r) => {
      if (!dates.has(r.payload.date) || warned.has(r.payload.date)) return [];
      warned.add(r.payload.date);
      return [{ rowNumber: r.rowNumber, field: "date", message: "You already have a workout on this date" }];
    });
  }

  if (kind === "conditioning") {
    const rows = staged as ValidatedRows<CreateConditioningInput>["staged"];
    const span = dateSpan(rows.map((r) => r.payload.sessionDate));
    if (!span) return [];
    const t = conditioningSessions;
    const existing = await db
      .select({ date: t.sessionDate, type: t.type, durationS: t.durationS, rpe: t.sessionRpe })
      .from(t)
      .where(and(eq(t.userId, userId), gte(t.sessionDate, span[0]), lte(t.sessionDate, span[1])));
    const keys = new Set(existing.map((e) => `${e.date}|${e.type}|${e.durationS}|${e.rpe}`));
    return rows
      .filter((r) => keys.has(`${r.payload.sessionDate}|${r.payload.type}|${r.payload.durationS}|${r.payload.sessionRpe}`))
      .map((r) => ({ rowNumber: r.rowNumber, field: "row", message: "Matches a session you already logged" }));
  }

  const rows = staged as ValidatedRows<CreateAssessmentInput>["staged"];
  const span = dateSpan(rows.map((r) => r.payload.assessedOn));
  if (!span) return [];
  const t = assessmentResults;
  const existing = await db
    .select({ def: t.definitionId, date: t.assessedOn, value: t.value, unit: t.unit, method: t.method })
    .from(t)
    .where(and(eq(t.userId, userId), gte(t.assessedOn, span[0]), lte(t.assessedOn, span[1])));
  const keys = new Set(existing.map((e) => `${e.def}|${e.date}|${e.value}|${e.unit}|${e.method}`));
  return rows
    .filter((r) => {
      const p = r.payload;
      return keys.has(`${p.definitionId}|${p.assessedOn}|${p.value}|${p.unit}|${p.method}`);
    })
    .map((r) => ({ rowNumber: r.rowNumber, field: "row", message: "Matches a result you already logged" }));
}

/**
 * Stores a preview: the job, its validated rows and its row errors. A confirmed
 * import of the same file is refused; an unconfirmed preview of it is replaced.
 */
export async function createPreview(
  db: Database,
  userId: string,
  input: { kind: CsvKind; fileSha256: string; rowCount: number; validated: ValidatedRows },
): Promise<ImportJobDto> {
  const [existing] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.userId, userId), eq(importJobs.fileSha256, input.fileSha256)));
  if (existing?.status === "confirmed") throw new DuplicateFileError(toJobDto(existing));

  const now = new Date();
  const job: JobRow = {
    id: crypto.randomUUID(),
    userId,
    kind: input.kind,
    fileSha256: input.fileSha256,
    status: "preview",
    rowCount: input.rowCount,
    acceptedCount: input.validated.staged.length,
    rejectedCount: input.rowCount - input.validated.staged.length,
    createdAt: now,
    expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS),
    confirmedAt: null,
  };
  const staged = input.validated.staged.map((s) => ({
    id: crypto.randomUUID(),
    importJobId: job.id,
    rowNumber: s.rowNumber,
    payload: s.payload,
  }));
  const errors = input.validated.errors.map((e) => ({ id: crypto.randomUUID(), importJobId: job.id, ...e }));

  const statements: BatchItem<"sqlite">[] = [];
  if (existing) statements.push(db.delete(importJobs).where(and(eq(importJobs.id, existing.id), eq(importJobs.userId, userId))));
  statements.push(db.insert(importJobs).values(job));
  for (const part of chunk(staged, rowsPerInsert(4))) statements.push(db.insert(importStagedRows).values(part));
  for (const part of chunk(errors, rowsPerInsert(5))) statements.push(db.insert(importRowErrors).values(part));
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return toJobDto(job);
}

async function ownJob(db: Database, userId: string, id: string) {
  const [row] = await db.select().from(importJobs).where(and(eq(importJobs.id, id), eq(importJobs.userId, userId)));
  return row ?? null;
}

/** Confirmed imports, plus previews that haven't expired, newest first. */
export async function listJobs(db: Database, userId: string): Promise<ImportJobDto[]> {
  const rows = await db
    .select()
    .from(importJobs)
    .where(
      and(
        eq(importJobs.userId, userId),
        or(eq(importJobs.status, "confirmed"), gt(importJobs.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(importJobs.createdAt))
    .limit(50);
  return rows.map(toJobDto);
}

/** Every job, for the personal data export. */
export async function allJobs(db: Database, userId: string): Promise<ImportJobDto[]> {
  const rows = await db.select().from(importJobs).where(eq(importJobs.userId, userId)).orderBy(asc(importJobs.createdAt));
  return rows.map(toJobDto);
}

function recordInserts(db: Database, userId: string, job: JobRow, payloads: StagedPayload[], now: Date): BatchItem<"sqlite">[] {
  const statements: BatchItem<"sqlite">[] = [];
  const base = { userId, importJobId: job.id, createdAt: now, updatedAt: now };

  if (job.kind === "workouts") {
    // Sets on the same date become one workout, in file order; its notes are the first non-empty ones.
    const byDate = new Map<string, WorkoutSetPayload[]>();
    for (const p of payloads as WorkoutSetPayload[]) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
    const workoutRows = [];
    const setRows = [];
    for (const [date, sets] of byDate) {
      const id = crypto.randomUUID();
      workoutRows.push({ id, ...base, workoutDate: date, notes: sets.find((s) => s.notes)?.notes ?? null });
      setRows.push(
        ...sets.map(({ set }, setIndex) => ({
          id: crypto.randomUUID(),
          workoutId: id,
          exerciseId: set.exerciseId,
          setIndex,
          reps: set.reps,
          loadValue: set.loadValue,
          loadUnit: set.loadUnit,
          loadKg: toKg(set.loadValue, set.loadUnit),
          rpe: set.rpe,
        })),
      );
    }
    for (const part of chunk(workoutRows, rowsPerInsert(7))) statements.push(db.insert(workouts).values(part));
    for (const part of chunk(setRows, rowsPerInsert(9))) statements.push(db.insert(workoutSets).values(part));
  } else if (job.kind === "conditioning") {
    const rows = (payloads as CreateConditioningInput[]).map((p) => ({
      id: crypto.randomUUID(),
      ...base,
      ...p,
      distanceM: p.distanceValue !== null && p.distanceUnit !== null ? toMeters(p.distanceValue, p.distanceUnit) : null,
    }));
    for (const part of chunk(rows, rowsPerInsert(13))) statements.push(db.insert(conditioningSessions).values(part));
  } else {
    const rows = (payloads as CreateAssessmentInput[]).map((p) => ({
      id: crypto.randomUUID(),
      ...base,
      ...p,
      valueCanonical: toAssessmentCanonical(p.value, p.unit as "s" | "cm" | "in"),
    }));
    for (const part of chunk(rows, rowsPerInsert(15))) statements.push(db.insert(assessmentResults).values(part));
  }
  return statements;
}

/**
 * Saves every staged row in one D1 batch (a single transaction): the records,
 * tagged with the job, then the job marked confirmed and its staged data deleted.
 */
export async function confirmJob(db: Database, userId: string, id: string): Promise<ImportJobDto | null> {
  const job = await ownJob(db, userId, id);
  if (!job) return null;
  if (job.status !== "preview") throw new ImportStateError("This import has already been confirmed");
  if (job.expiresAt.getTime() <= Date.now()) throw new ImportStateError("This preview has expired. Upload the file again");

  const staged = await db
    .select({ payload: importStagedRows.payload })
    .from(importStagedRows)
    .where(eq(importStagedRows.importJobId, job.id))
    .orderBy(asc(importStagedRows.rowNumber));
  const payloads = staged.map((s) => s.payload as StagedPayload);
  if (payloads.length === 0) throw new ImportStateError("No valid rows to import");

  if (job.kind === "workouts") {
    // A custom exercise could have been deleted since the upload.
    const ids = [...new Set((payloads as WorkoutSetPayload[]).map((p) => p.set.exerciseId))];
    const usable = new Set<string>();
    for (const part of chunk(ids, 90)) {
      const rows = await db.select({ id: exercises.id }).from(exercises).where(and(inArray(exercises.id, part), visibleTo(userId)));
      rows.forEach((r) => usable.add(r.id));
    }
    if (ids.some((x) => !usable.has(x))) throw new ImportStateError("An exercise in this file no longer exists. Upload the file again");
  }

  const now = new Date();
  await db.batch([
    db
      .update(importJobs)
      .set({ status: "confirmed", confirmedAt: now })
      .where(and(eq(importJobs.id, job.id), eq(importJobs.userId, userId), eq(importJobs.status, "preview"))),
    ...recordInserts(db, userId, job, payloads, now),
    db.delete(importStagedRows).where(eq(importStagedRows.importJobId, job.id)),
    db.delete(importRowErrors).where(eq(importRowErrors.importJobId, job.id)),
  ]);
  return toJobDto({ ...job, status: "confirmed", confirmedAt: now });
}

/**
 * Cancels a preview, or undoes a confirmed import by deleting every record it
 * created (including ones edited since), then the job itself, in one batch.
 */
export async function undoJob(
  db: Database,
  userId: string,
  id: string,
): Promise<{ result: "cancelled" | "undone"; removed: number } | null> {
  const job = await ownJob(db, userId, id);
  if (!job) return null;
  const deleteJob = db.delete(importJobs).where(and(eq(importJobs.id, job.id), eq(importJobs.userId, userId)));
  if (job.status === "preview") {
    await deleteJob;
    return { result: "cancelled", removed: 0 };
  }
  const [w, c, a] = await db.batch([
    db
      .delete(workouts)
      .where(and(eq(workouts.userId, userId), eq(workouts.importJobId, job.id)))
      .returning({ id: workouts.id }),
    db
      .delete(conditioningSessions)
      .where(and(eq(conditioningSessions.userId, userId), eq(conditioningSessions.importJobId, job.id)))
      .returning({ id: conditioningSessions.id }),
    db
      .delete(assessmentResults)
      .where(and(eq(assessmentResults.userId, userId), eq(assessmentResults.importJobId, job.id)))
      .returning({ id: assessmentResults.id }),
    deleteJob,
  ]);
  return { result: "undone", removed: w.length + c.length + a.length };
}

/** Run hourly by the cron trigger: unconfirmed previews and their staged rows are gone within 24 hours. */
export async function deleteExpiredPreviews(db: Database, now = new Date()): Promise<number> {
  const deleted = await db
    .delete(importJobs)
    .where(and(eq(importJobs.status, "preview"), lt(importJobs.expiresAt, now)))
    .returning({ id: importJobs.id });
  return deleted.length;
}
