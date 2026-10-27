import {
  CSV_CANONICAL_COLUMN,
  CSV_TEMPLATE_COLUMNS,
  IMPORT_MAX_ROWS,
  MAX_SETS_PER_WORKOUT,
  createAssessmentSchema,
  createConditioningSchema,
  notesSchema,
  restoreFormulaText,
  trainingDateSchema,
  workoutSetInputSchema,
  type CreateAssessmentInput,
  type CreateConditioningInput,
  type CsvKind,
  type ImportRowIssue,
  type WorkoutSetInput,
} from "@plyntiq/shared";
import Papa from "papaparse";
import type { z } from "zod";
import { ValidationError } from "../../lib/http";

/**
 * Turns uploaded CSV text into validated, normalized rows using the same
 * shared Zod schemas as the logging forms. Problems with the file as a whole
 * (not text, wrong columns, too many rows) throw a 400; problems with single
 * rows become per-row issues and the rest of the file still imports.
 */

export interface ParsedRow {
  /** Spreadsheet row number: the header is row 1. */
  rowNumber: number;
  record: Record<string, string>;
  /** Set when the row has a different number of cells from the header. */
  cellCount?: number;
}

export type WorkoutSetPayload = { date: string; notes: string | null; set: WorkoutSetInput };
export type StagedPayload = WorkoutSetPayload | CreateConditioningInput | CreateAssessmentInput;

export interface ValidatedRows<P extends StagedPayload = StagedPayload> {
  staged: { rowNumber: number; payload: P; record: Record<string, string> }[];
  errors: ImportRowIssue[];
}

const fileError = (message: string) => new ValidationError([{ path: "csv", message }]);

export function parseCsvRows(text: string, kind: CsvKind): ParsedRow[] {
  const body = text.replace(/^﻿/, "");
  // Binary files (spreadsheets saved as .xlsx, images) contain NUL bytes; CSV text never does.
  if (body.includes("\u0000")) throw fileError("This isn't a CSV text file. In your spreadsheet app, use Save as → CSV.");

  const parsed = Papa.parse<string[]>(body, { skipEmptyLines: "greedy" });
  const quoteError = parsed.errors.find((e) => e.type === "Quotes");
  if (quoteError) throw fileError(`A quote isn't closed (near row ${(quoteError.row ?? 0) + 1}).`);

  const [header, ...data] = parsed.data;
  const columns = (header ?? []).map((h) => h.trim().toLowerCase());
  const template: readonly string[] = CSV_TEMPLATE_COLUMNS[kind];
  const matches =
    columns.length >= template.length &&
    template.every((c, i) => columns[i] === c) &&
    (columns.length === template.length ||
      (columns.length === template.length + 1 && columns.at(-1) === CSV_CANONICAL_COLUMN[kind]));
  if (!matches) throw fileError(`The first row must be the column names: ${template.join(", ")}.`);
  if (data.length === 0) throw fileError("The file has column names but no rows.");
  if (data.length > IMPORT_MAX_ROWS) throw fileError(`Use ${IMPORT_MAX_ROWS} rows or fewer per file.`);

  return data.map((cells, i) => ({
    rowNumber: i + 2,
    record: Object.fromEntries(template.map((col, j) => [col, restoreFormulaText((cells[j] ?? "").trim())])),
    ...(cells.length !== columns.length ? { cellCount: cells.length } : {}),
  }));
}

/** Blank → undefined, so schemas report "Enter …"; anything else → Number (NaN fails the schema). */
const num = (s: string | undefined) => (s === undefined || s === "" ? undefined : Number(s));
const opt = (s: string | undefined) => (s === undefined || s === "" ? undefined : s);

function issuesFrom(rowNumber: number, error: z.ZodError, columnFor: Record<string, string>): ImportRowIssue[] {
  return error.issues.map((i) => {
    const path = i.path.map(String).join(".");
    return { rowNumber, field: columnFor[path] ?? (path || "row"), message: i.message };
  });
}

function cellCountIssue(row: ParsedRow, kind: CsvKind): ImportRowIssue | null {
  if (row.cellCount === undefined) return null;
  const expected = CSV_TEMPLATE_COLUMNS[kind].length;
  return { rowNumber: row.rowNumber, field: "row", message: `Expected ${expected} columns, found ${row.cellCount}` };
}

/** `exerciseIds` maps lower-cased names to IDs for the global catalog and the athlete's own exercises. */
export function validateWorkoutRows(rows: ParsedRow[], exerciseIds: Map<string, string>): ValidatedRows<WorkoutSetPayload> {
  const out: ValidatedRows<WorkoutSetPayload> = { staged: [], errors: [] };
  const setsPerDate = new Map<string, number>();
  for (const row of rows) {
    const countIssue = cellCountIssue(row, "workouts");
    if (countIssue) {
      out.errors.push(countIssue);
      continue;
    }
    const r = row.record;
    const issues: ImportRowIssue[] = [];
    const date = trainingDateSchema.safeParse(r.date);
    if (!date.success) issues.push(...issuesFrom(row.rowNumber, date.error, { "": "date" }));

    const exerciseId = r.exercise ? exerciseIds.get(r.exercise.toLowerCase()) : undefined;
    if (!r.exercise) issues.push({ rowNumber: row.rowNumber, field: "exercise", message: "Enter an exercise" });
    else if (!exerciseId) {
      issues.push({
        rowNumber: row.rowNumber,
        field: "exercise",
        message: "Unknown exercise. Use a name from the exercise list, or add it as a custom exercise first",
      });
    }

    const set = workoutSetInputSchema.safeParse({
      exerciseId: exerciseId ?? "unknown",
      reps: num(r.reps),
      loadValue: num(r.load),
      loadUnit: opt(r.unit),
      rpe: num(r.rpe) ?? null,
    });
    if (!set.success) {
      issues.push(...issuesFrom(row.rowNumber, set.error, { reps: "reps", loadValue: "load", loadUnit: "unit", rpe: "rpe" }));
    }
    const notes = notesSchema.safeParse(r.notes ?? "");
    if (!notes.success) issues.push(...issuesFrom(row.rowNumber, notes.error, { "": "notes" }));

    if (issues.length || !date.success || !set.success || !notes.success) {
      out.errors.push(...issues);
      continue;
    }
    const count = (setsPerDate.get(date.data) ?? 0) + 1;
    setsPerDate.set(date.data, count);
    if (count > MAX_SETS_PER_WORKOUT) {
      out.errors.push({ rowNumber: row.rowNumber, field: "date", message: `More than ${MAX_SETS_PER_WORKOUT} sets on this date` });
      continue;
    }
    out.staged.push({ rowNumber: row.rowNumber, record: r, payload: { date: date.data, notes: notes.data || null, set: set.data } });
  }
  return out;
}

export function validateConditioningRows(rows: ParsedRow[]): ValidatedRows<CreateConditioningInput> {
  const out: ValidatedRows<CreateConditioningInput> = { staged: [], errors: [] };
  const columnFor = {
    sessionDate: "date",
    type: "type",
    durationS: "duration_s",
    distanceValue: "distance",
    distanceUnit: "distance_unit",
    sessionRpe: "session_rpe",
    notes: "notes",
  };
  for (const row of rows) {
    const countIssue = cellCountIssue(row, "conditioning");
    if (countIssue) {
      out.errors.push(countIssue);
      continue;
    }
    const r = row.record;
    const result = createConditioningSchema.safeParse({
      sessionDate: r.date,
      type: r.type,
      durationS: num(r.duration_s),
      distanceValue: num(r.distance),
      distanceUnit: opt(r.distance_unit),
      sessionRpe: num(r.session_rpe),
      notes: opt(r.notes),
    });
    if (result.success) out.staged.push({ rowNumber: row.rowNumber, record: r, payload: result.data });
    else out.errors.push(...issuesFrom(row.rowNumber, result.error, columnFor));
  }
  return out;
}

export function validateAssessmentRows(rows: ParsedRow[]): ValidatedRows<CreateAssessmentInput> {
  const out: ValidatedRows<CreateAssessmentInput> = { staged: [], errors: [] };
  const columnFor = {
    definitionId: "test",
    assessedOn: "date",
    value: "value",
    unit: "unit",
    method: "method",
    surface: "surface",
    footwear: "footwear",
    conditionsNote: "conditions",
    notes: "notes",
  };
  for (const row of rows) {
    const countIssue = cellCountIssue(row, "assessments");
    if (countIssue) {
      out.errors.push(countIssue);
      continue;
    }
    const r = row.record;
    const result = createAssessmentSchema.safeParse({
      definitionId: r.test,
      assessedOn: r.date,
      value: num(r.value),
      unit: r.unit,
      method: r.method,
      surface: opt(r.surface),
      footwear: opt(r.footwear),
      conditionsNote: opt(r.conditions),
      notes: opt(r.notes),
    });
    if (result.success) out.staged.push({ rowNumber: row.rowNumber, record: r, payload: result.data });
    else out.errors.push(...issuesFrom(row.rowNumber, result.error, columnFor));
  }
  return out;
}
