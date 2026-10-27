import type { CreateExerciseInput, ExerciseDto } from "@plyntiq/shared";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { exercises } from "../../db/schema";

export class ExerciseNameTakenError extends Error {
  override name = "ExerciseNameTakenError";
}

/** Global catalog rows plus the athlete's own, excluding archived ones. */
export function visibleTo(userId: string) {
  return or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, userId));
}

export async function listExercises(db: Database, userId: string): Promise<ExerciseDto[]> {
  const rows = await db
    .select()
    .from(exercises)
    .where(and(visibleTo(userId), isNull(exercises.archivedAt)))
    .orderBy(asc(exercises.name));
  return rows.map(toDto);
}

/**
 * Names are unique per athlete regardless of case, and may not shadow a global
 * exercise. Re-creating an archived custom exercise restores it.
 */
export async function createExercise(db: Database, userId: string, input: CreateExerciseInput): Promise<ExerciseDto> {
  const sameName = await db
    .select()
    .from(exercises)
    .where(and(visibleTo(userId), eq(sql`lower(${exercises.name})`, input.name.toLowerCase())));

  const existing = sameName[0];
  if (existing) {
    if (existing.ownerUserId !== userId || existing.archivedAt === null) {
      throw new ExerciseNameTakenError(`"${existing.name}" already exists`);
    }
    const [restored] = await db
      .update(exercises)
      .set({ ...input, archivedAt: null })
      .where(and(eq(exercises.id, existing.id), eq(exercises.ownerUserId, userId)))
      .returning();
    return toDto(restored!);
  }

  try {
    const [row] = await db
      .insert(exercises)
      .values({ id: crypto.randomUUID(), ownerUserId: userId, ...input })
      .returning();
    return toDto(row!);
  } catch (err) {
    // A concurrent request created the same name between the check and the insert.
    if (String((err as Error)?.message ?? "").includes("UNIQUE")) {
      throw new ExerciseNameTakenError(`"${input.name}" already exists`);
    }
    throw err;
  }
}

export function toDto(row: typeof exercises.$inferSelect): ExerciseDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ExerciseDto["category"],
    isLowerBody: row.isLowerBody,
    isCustom: row.ownerUserId !== null,
  };
}
