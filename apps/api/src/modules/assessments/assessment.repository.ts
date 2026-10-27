import {
  createAssessmentSchema,
  toAssessmentCanonical,
  type AssessmentDefinitionDto,
  type AssessmentResultDto,
  type CreateAssessmentInput,
  type Page,
  type UpdateAssessmentInput,
} from "@plyntiq/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assessmentDefinitions, assessmentResults } from "../../db/schema";
import { ValidationError } from "../../lib/http";
import { splitPage, type PageQuery } from "../../lib/pagination";

/** Ownership-scoped like the workout repository: foreign IDs behave as missing. */

type Row = typeof assessmentResults.$inferSelect;

function owned(userId: string, id: string) {
  return and(eq(assessmentResults.id, id), eq(assessmentResults.userId, userId));
}

export async function listDefinitions(db: Database): Promise<AssessmentDefinitionDto[]> {
  const rows = await db
    .select()
    .from(assessmentDefinitions)
    .where(eq(assessmentDefinitions.isActive, true))
    .orderBy(asc(assessmentDefinitions.name));
  return rows.map((d) => ({
    id: d.id as AssessmentDefinitionDto["id"],
    name: d.name,
    quality: d.quality,
    canonicalUnit: d.canonicalUnit,
    units: d.units,
    betterDirection: d.betterDirection as AssessmentDefinitionDto["betterDirection"],
    allowedMethods: d.allowedMethods as AssessmentDefinitionDto["allowedMethods"],
  }));
}

export async function createAssessment(
  db: Database,
  userId: string,
  input: CreateAssessmentInput,
): Promise<AssessmentResultDto> {
  const now = new Date();
  const [row] = await db
    .insert(assessmentResults)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...input,
      valueCanonical: toAssessmentCanonical(input.value, input.unit as "s" | "cm" | "in"),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toDto(row!);
}

export async function getAssessment(db: Database, userId: string, id: string) {
  const row = await db.query.assessmentResults.findFirst({ where: owned(userId, id) });
  return row ? toDto(row) : null;
}

/** Newest first, optionally for one definition. */
export async function listAssessments(
  db: Database,
  userId: string,
  page: PageQuery,
  definitionId?: string,
): Promise<Page<AssessmentResultDto>> {
  const t = assessmentResults;
  const after = page.after
    ? sql`(${t.assessedOn}, ${t.createdAt}, ${t.id}) < (${page.after[0]}, ${page.after[1]}, ${page.after[2]})`
    : undefined;
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.userId, userId), definitionId ? eq(t.definitionId, definitionId) : undefined, after))
    .orderBy(desc(t.assessedOn), desc(t.createdAt), desc(t.id))
    .limit(page.limit + 1);
  const { pageRows, nextCursor } = splitPage(rows, page.limit, (r) => [r.assessedOn, r.createdAt.getTime(), r.id]);
  return { items: pageRows.map(toDto), nextCursor };
}

/**
 * Merges the patch into the stored result and re-validates the whole record,
 * so unit, method and range rules apply against the result's definition.
 */
export async function updateAssessment(
  db: Database,
  userId: string,
  id: string,
  patch: UpdateAssessmentInput,
): Promise<AssessmentResultDto | null> {
  const existing = await db.query.assessmentResults.findFirst({ where: owned(userId, id) });
  if (!existing) return null;

  const merged = createAssessmentSchema.safeParse({
    definitionId: existing.definitionId,
    assessedOn: existing.assessedOn,
    value: existing.value,
    unit: existing.unit,
    method: existing.method,
    surface: existing.surface,
    footwear: existing.footwear,
    conditionsNote: existing.conditionsNote,
    notes: existing.notes,
    ...patch,
  });
  if (!merged.success) {
    throw new ValidationError(merged.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const { definitionId: _unchanged, ...fields } = merged.data;
  const [row] = await db
    .update(assessmentResults)
    .set({
      ...fields,
      valueCanonical: toAssessmentCanonical(fields.value, fields.unit as "s" | "cm" | "in"),
      updatedAt: new Date(),
    })
    .where(owned(userId, id))
    .returning();
  return row ? toDto(row) : null;
}

export async function deleteAssessment(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(assessmentResults).where(owned(userId, id)).returning({ id: assessmentResults.id });
  return deleted.length > 0;
}

/** All of an athlete's results, oldest first (export). */
export async function allAssessments(db: Database, userId: string): Promise<AssessmentResultDto[]> {
  const t = assessmentResults;
  const rows = await db.select().from(t).where(eq(t.userId, userId)).orderBy(asc(t.assessedOn), asc(t.createdAt));
  return rows.map(toDto);
}

function toDto(row: Row): AssessmentResultDto {
  return {
    id: row.id,
    definitionId: row.definitionId as AssessmentResultDto["definitionId"],
    assessedOn: row.assessedOn,
    value: row.value,
    unit: row.unit as AssessmentResultDto["unit"],
    valueCanonical: row.valueCanonical,
    method: row.method as AssessmentResultDto["method"],
    surface: row.surface as AssessmentResultDto["surface"],
    footwear: row.footwear as AssessmentResultDto["footwear"],
    conditionsNote: row.conditionsNote,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
