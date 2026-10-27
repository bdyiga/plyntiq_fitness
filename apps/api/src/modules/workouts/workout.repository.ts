import {
  toKg,
  type CreateWorkoutInput,
  type Page,
  type UpdateWorkoutInput,
  type WorkoutDto,
  type WorkoutSetDto,
  type WorkoutSetInput,
} from "@plyntiq/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { exercises, workouts, workoutSets } from "../../db/schema";
import { ValidationError } from "../../lib/http";
import { splitPage, type PageQuery } from "../../lib/pagination";
import { visibleTo } from "../exercises/exercise.repository";

/**
 * Ownership-scoped: every function takes the session's `userId` and filters
 * on it. A workout ID that belongs to someone else behaves exactly like one
 * that does not exist.
 */

/** D1 binds at most 100 parameters per statement; a set row binds 9. */
const SET_ROWS_PER_INSERT = 11;

type WorkoutRow = typeof workouts.$inferSelect;

/**
 * Every set must reference a global exercise or one of the athlete's own
 * (archived ones included, so old workouts stay editable). Another athlete's
 * exercise gets the same error as a nonexistent one.
 */
async function assertExercisesUsable(db: Database, userId: string, sets: WorkoutSetInput[]) {
  const ids = [...new Set(sets.map((s) => s.exerciseId))];
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(inArray(exercises.id, ids), visibleTo(userId)));
  const usable = new Set(rows.map((r) => r.id));
  const issues = sets.flatMap((s, i) =>
    usable.has(s.exerciseId) ? [] : [{ path: `sets.${i}.exerciseId`, message: "Unknown exercise" }],
  );
  if (issues.length) throw new ValidationError(issues);
}

function setInserts(db: Database, workoutId: string, sets: WorkoutSetInput[]) {
  const rows = sets.map((s, setIndex) => ({
    id: crypto.randomUUID(),
    workoutId,
    exerciseId: s.exerciseId,
    setIndex,
    reps: s.reps,
    loadValue: s.loadValue,
    loadUnit: s.loadUnit,
    loadKg: toKg(s.loadValue, s.loadUnit),
    rpe: s.rpe,
  }));
  const statements = [];
  for (let i = 0; i < rows.length; i += SET_ROWS_PER_INSERT) {
    statements.push(db.insert(workoutSets).values(rows.slice(i, i + SET_ROWS_PER_INSERT)));
  }
  return statements;
}

export async function createWorkout(db: Database, userId: string, input: CreateWorkoutInput): Promise<WorkoutDto> {
  await assertExercisesUsable(db, userId, input.sets);
  const id = crypto.randomUUID();
  const now = new Date();
  // D1 batches run as one transaction: the workout and its sets land together or not at all.
  await db.batch([
    db.insert(workouts).values({
      id,
      userId,
      workoutDate: input.workoutDate,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    }),
    ...setInserts(db, id, input.sets),
  ]);
  return (await getWorkout(db, userId, id))!;
}

export async function getWorkout(db: Database, userId: string, id: string): Promise<WorkoutDto | null> {
  const row = await db.query.workouts.findFirst({ where: and(eq(workouts.id, id), eq(workouts.userId, userId)) });
  if (!row) return null;
  const [dto] = await withSets(db, [row]);
  return dto ?? null;
}

/** Newest training date first. */
export async function listWorkouts(db: Database, userId: string, page: PageQuery): Promise<Page<WorkoutDto>> {
  const after = page.after
    ? sql`(${workouts.workoutDate}, ${workouts.createdAt}, ${workouts.id}) < (${page.after[0]}, ${page.after[1]}, ${page.after[2]})`
    : undefined;
  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), after))
    .orderBy(desc(workouts.workoutDate), desc(workouts.createdAt), desc(workouts.id))
    .limit(page.limit + 1);
  const { pageRows, nextCursor } = splitPage(rows, page.limit, (r) => [r.workoutDate, r.createdAt.getTime(), r.id]);
  return { items: await withSets(db, pageRows), nextCursor };
}

/** Returns null when the workout does not exist or is not the athlete's. */
export async function updateWorkout(
  db: Database,
  userId: string,
  id: string,
  input: UpdateWorkoutInput,
): Promise<WorkoutDto | null> {
  const owned = and(eq(workouts.id, id), eq(workouts.userId, userId));
  const existing = await db.query.workouts.findFirst({ where: owned, columns: { id: true } });
  if (!existing) return null;

  const { sets, ...fields } = input;
  if (sets) await assertExercisesUsable(db, userId, sets);
  await db.batch([
    db.update(workouts).set({ ...fields, updatedAt: new Date() }).where(owned),
    ...(sets ? [db.delete(workoutSets).where(eq(workoutSets.workoutId, id)), ...setInserts(db, id, sets)] : []),
  ]);
  return getWorkout(db, userId, id);
}

export async function deleteWorkout(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)))
    .returning({ id: workouts.id });
  return deleted.length > 0;
}

/** All of an athlete's workouts, oldest first (export). */
export async function allWorkouts(db: Database, userId: string): Promise<WorkoutDto[]> {
  const rows = await db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(asc(workouts.workoutDate), asc(workouts.createdAt));
  return withSets(db, rows);
}

/** D1 also caps `IN (...)` lists at the parameter limit. */
const WORKOUT_IDS_PER_QUERY = 90;

async function withSets(db: Database, rows: WorkoutRow[]): Promise<WorkoutDto[]> {
  const byWorkout = new Map<string, WorkoutSetDto[]>();
  for (let i = 0; i < rows.length; i += WORKOUT_IDS_PER_QUERY) {
    const ids = rows.slice(i, i + WORKOUT_IDS_PER_QUERY).map((r) => r.id);
    const sets = await db
      .select({ set: workoutSets, exerciseName: exercises.name })
      .from(workoutSets)
      .innerJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
      .where(inArray(workoutSets.workoutId, ids))
      .orderBy(asc(workoutSets.setIndex));
    for (const { set, exerciseName } of sets) {
      const list = byWorkout.get(set.workoutId) ?? [];
      list.push({
        id: set.id,
        exerciseId: set.exerciseId,
        exerciseName,
        setIndex: set.setIndex,
        reps: set.reps,
        loadValue: set.loadValue,
        loadUnit: set.loadUnit as WorkoutSetDto["loadUnit"],
        loadKg: set.loadKg,
        rpe: set.rpe,
      });
      byWorkout.set(set.workoutId, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    workoutDate: r.workoutDate,
    notes: r.notes,
    sets: byWorkout.get(r.id) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
