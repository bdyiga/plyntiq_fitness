import {
  CSV_CANONICAL_COLUMN,
  CSV_KINDS,
  CSV_TEMPLATE_COLUMNS,
  toCsv,
  type CsvCell,
  type CsvKind,
} from "@plyntiq/shared";
import { Hono } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { Database } from "../../db/client";
import type { AppEnv } from "../../env";
import { apiError } from "../../lib/http";
import { allAssessments } from "../assessments/assessment.repository";
import { allConditioning } from "../conditioning/conditioning.repository";
import { allWorkouts } from "../workouts/workout.repository";

/**
 * CSV export, one file per record type, in the import template's columns plus
 * the canonical value. Text is formula-neutralized by `toCsv`.
 */
async function rowsFor(kind: CsvKind, db: Database, userId: string): Promise<CsvCell[][]> {
  switch (kind) {
    case "workouts":
      // One row per set. Workout notes repeat on each of its rows; import keeps the first per date.
      return (await allWorkouts(db, userId)).flatMap((w) =>
        w.sets.map((s) => [w.workoutDate, s.exerciseName, s.reps, s.loadValue, s.loadUnit, s.rpe, w.notes, s.loadKg]),
      );
    case "conditioning":
      return (await allConditioning(db, userId)).map((s) => [
        s.sessionDate,
        s.type,
        s.durationS,
        s.distanceValue,
        s.distanceUnit,
        s.sessionRpe,
        s.notes,
        s.distanceM,
      ]);
    case "assessments":
      return (await allAssessments(db, userId)).map((r) => [
        r.assessedOn,
        r.definitionId,
        r.value,
        r.unit,
        r.method,
        r.surface,
        r.footwear,
        r.conditionsNote,
        r.notes,
        r.valueCanonical,
      ]);
  }
}

export const csvExportRoutes = new Hono<AppEnv>().use(requireAuth).get("/:file", async (c) => {
  const kind = CSV_KINDS.find((k) => c.req.param("file") === `${k}.csv`);
  if (!kind) return apiError(c, 404, "not_found", "Route not found");
  const csv = toCsv(
    [...CSV_TEMPLATE_COLUMNS[kind], CSV_CANONICAL_COLUMN[kind]],
    await rowsFor(kind, c.var.db, requireUserId(c)),
  );
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="plyntiq-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(csv);
});
