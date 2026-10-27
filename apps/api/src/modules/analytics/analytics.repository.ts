import type { AssessmentInput, ConditioningInput, IsoDate, StrengthSetInput } from "@plyntiq/analytics";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assessmentResults, conditioningSessions, exercises, workouts, workoutSets } from "../../db/schema";
import { visibleTo } from "../exercises/exercise.repository";

/**
 * Read-only, ownership-scoped mappers from rows to analytics inputs. Every
 * function takes the session's `userId` and filters on it, and returns
 * canonical units only (ADR 0004).
 */

/** A global exercise or one of the athlete's own (archived included: history still counts). */
export async function findExercise(db: Database, userId: string, id: string) {
  const [row] = await db
    .select({ id: exercises.id, name: exercises.name, isLowerBody: exercises.isLowerBody })
    .from(exercises)
    .where(and(eq(exercises.id, id), visibleTo(userId)));
  return row ?? null;
}

interface SetFilter {
  from?: IsoDate;
  to: IsoDate;
  exerciseId?: string;
  lowerBodyOnly?: boolean;
}

export async function strengthSets(db: Database, userId: string, f: SetFilter): Promise<StrengthSetInput[]> {
  const where: SQL[] = [eq(workouts.userId, userId), lte(workouts.workoutDate, f.to)];
  if (f.from) where.push(gte(workouts.workoutDate, f.from));
  if (f.exerciseId) where.push(eq(workoutSets.exerciseId, f.exerciseId));
  if (f.lowerBodyOnly) where.push(eq(exercises.isLowerBody, true));
  return db
    .select({
      date: workouts.workoutDate,
      exerciseId: workoutSets.exerciseId,
      reps: workoutSets.reps,
      loadKg: workoutSets.loadKg,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(...where))
    // Date, then logging order: PRs on the same day are judged in the order performed.
    .orderBy(asc(workouts.workoutDate), asc(workouts.createdAt), asc(workoutSets.setIndex));
}

export async function trainingDates(db: Database, userId: string, from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
  const rows = await db
    .selectDistinct({ date: workouts.workoutDate })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), gte(workouts.workoutDate, from), lte(workouts.workoutDate, to)));
  return rows.map((r) => r.date);
}

export async function conditioningInputs(
  db: Database,
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<ConditioningInput[]> {
  return db
    .select({
      date: conditioningSessions.sessionDate,
      durationS: conditioningSessions.durationS,
      distanceM: conditioningSessions.distanceM,
      sessionRpe: conditioningSessions.sessionRpe,
    })
    .from(conditioningSessions)
    .where(
      and(
        eq(conditioningSessions.userId, userId),
        gte(conditioningSessions.sessionDate, from),
        lte(conditioningSessions.sessionDate, to),
      ),
    );
}

export async function assessmentInputs(
  db: Database,
  userId: string,
  definitionId: string,
  range?: { from: IsoDate; to: IsoDate },
): Promise<AssessmentInput[]> {
  const where: SQL[] = [eq(assessmentResults.userId, userId), eq(assessmentResults.definitionId, definitionId)];
  if (range) {
    where.push(gte(assessmentResults.assessedOn, range.from), lte(assessmentResults.assessedOn, range.to));
  }
  return db
    .select({
      date: assessmentResults.assessedOn,
      valueCanonical: assessmentResults.valueCanonical,
      method: assessmentResults.method,
      surface: assessmentResults.surface,
      footwear: assessmentResults.footwear,
    })
    .from(assessmentResults)
    .where(and(...where))
    .orderBy(asc(assessmentResults.assessedOn), asc(assessmentResults.createdAt));
}

/** Lower-body exercises the athlete has logged at least one set of, by name. */
export async function loggedLowerBodyExercises(db: Database, userId: string) {
  return db
    .selectDistinct({ id: exercises.id, name: exercises.name })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(eq(workouts.userId, userId), eq(exercises.isLowerBody, true)))
    .orderBy(asc(exercises.name));
}
