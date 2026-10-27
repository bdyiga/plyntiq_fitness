import {
  toMeters,
  type ConditioningSessionDto,
  type CreateConditioningInput,
  type Page,
  type UpdateConditioningInput,
} from "@plyntiq/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { conditioningSessions } from "../../db/schema";
import { splitPage, type PageQuery } from "../../lib/pagination";

/** Ownership-scoped like the workout repository: foreign IDs behave as missing. */

type Row = typeof conditioningSessions.$inferSelect;

function owned(userId: string, id: string) {
  return and(eq(conditioningSessions.id, id), eq(conditioningSessions.userId, userId));
}

/** The canonical distance follows the original value and unit, never the client. */
function distanceM(value: number | null | undefined, unit: ConditioningSessionDto["distanceUnit"] | undefined) {
  return value != null && unit != null ? toMeters(value, unit) : null;
}

export async function createConditioning(
  db: Database,
  userId: string,
  input: CreateConditioningInput,
): Promise<ConditioningSessionDto> {
  const now = new Date();
  const [row] = await db
    .insert(conditioningSessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...input,
      distanceM: distanceM(input.distanceValue, input.distanceUnit),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toDto(row!);
}

export async function getConditioning(db: Database, userId: string, id: string) {
  const row = await db.query.conditioningSessions.findFirst({ where: owned(userId, id) });
  return row ? toDto(row) : null;
}

/** Newest session date first. */
export async function listConditioning(
  db: Database,
  userId: string,
  page: PageQuery,
): Promise<Page<ConditioningSessionDto>> {
  const t = conditioningSessions;
  const after = page.after
    ? sql`(${t.sessionDate}, ${t.createdAt}, ${t.id}) < (${page.after[0]}, ${page.after[1]}, ${page.after[2]})`
    : undefined;
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.userId, userId), after))
    .orderBy(desc(t.sessionDate), desc(t.createdAt), desc(t.id))
    .limit(page.limit + 1);
  const { pageRows, nextCursor } = splitPage(rows, page.limit, (r) => [r.sessionDate, r.createdAt.getTime(), r.id]);
  return { items: pageRows.map(toDto), nextCursor };
}

export async function updateConditioning(
  db: Database,
  userId: string,
  id: string,
  input: UpdateConditioningInput,
): Promise<ConditioningSessionDto | null> {
  const distance =
    "distanceValue" in input ? { distanceM: distanceM(input.distanceValue, input.distanceUnit) } : {};
  const [row] = await db
    .update(conditioningSessions)
    .set({ ...input, ...distance, updatedAt: new Date() })
    .where(owned(userId, id))
    .returning();
  return row ? toDto(row) : null;
}

export async function deleteConditioning(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(conditioningSessions)
    .where(owned(userId, id))
    .returning({ id: conditioningSessions.id });
  return deleted.length > 0;
}

/** All of an athlete's sessions, oldest first (export). */
export async function allConditioning(db: Database, userId: string): Promise<ConditioningSessionDto[]> {
  const t = conditioningSessions;
  const rows = await db.select().from(t).where(eq(t.userId, userId)).orderBy(asc(t.sessionDate), asc(t.createdAt));
  return rows.map(toDto);
}

function toDto(row: Row): ConditioningSessionDto {
  return {
    id: row.id,
    sessionDate: row.sessionDate,
    type: row.type as ConditioningSessionDto["type"],
    durationS: row.durationS,
    distanceValue: row.distanceValue,
    distanceUnit: row.distanceUnit as ConditioningSessionDto["distanceUnit"],
    distanceM: row.distanceM,
    sessionRpe: row.sessionRpe,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
