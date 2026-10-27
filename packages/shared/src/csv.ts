/**
 * CSV format shared by export and import. The export columns are the import
 * template plus a trailing canonical column, which import ignores (the server
 * always recomputes canonical values), so an export re-imports unchanged.
 * Values use catalog IDs (e.g. `sprint_20m`, `hand_timed`), except exercises,
 * which use their name so a person can fill the template in by hand.
 */

export const CSV_KINDS = ["workouts", "conditioning", "assessments"] as const;
export type CsvKind = (typeof CSV_KINDS)[number];

/** Import template columns, in order. One workouts row per set. */
export const CSV_TEMPLATE_COLUMNS = {
  workouts: ["date", "exercise", "reps", "load", "unit", "rpe", "notes"],
  conditioning: ["date", "type", "duration_s", "distance", "distance_unit", "session_rpe", "notes"],
  assessments: ["date", "test", "value", "unit", "method", "surface", "footwear", "conditions", "notes"],
} as const satisfies Record<CsvKind, readonly string[]>;

/** Export-only columns: computed by the server, ignored on import. */
export const CSV_CANONICAL_COLUMN = {
  workouts: "load_kg",
  conditioning: "distance_m",
  assessments: "value_canonical",
} as const satisfies Record<CsvKind, string>;

export type CsvCell = string | number | null;

/**
 * Spreadsheet apps execute cells starting with these characters as formulas
 * (CSV/formula injection). Text cells that start with one get a leading `'`;
 * import strips it again. Numeric cells are written as numbers, never escaped.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** Undoes `neutralizeFormula` on import: one leading `'` before a formula character. */
export function restoreFormulaText(text: string): string {
  return text.startsWith("'") && FORMULA_START.test(text.slice(1)) ? text.slice(1) : text;
}

function encodeCell(cell: CsvCell): string {
  if (cell === null) return "";
  const text = typeof cell === "number" ? String(cell) : neutralizeFormula(cell);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * RFC 4180 CSV with CRLF line endings and a UTF-8 byte-order mark, so Excel
 * opens accented names correctly. Import strips the BOM.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(encodeCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
