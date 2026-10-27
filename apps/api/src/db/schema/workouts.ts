import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { importJobs } from "./imports";
import { exercises } from "./exercises";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
};

export const workouts = sqliteTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The athlete's local calendar day, YYYY-MM-DD (ADR 0004). */
    workoutDate: text("workout_date").notNull(),
    notes: text("notes"),
    /** Set when the row came from a CSV import (provenance and undo). */
    importJobId: text("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("workouts_user_date_idx").on(t.userId, t.workoutDate),
    check("workouts_date_chk", sql`date(${t.workoutDate}) IS ${t.workoutDate}`),
  ],
);

/**
 * Normalized per-set rows (volume, e1RM and PR queries need them). Ownership
 * comes through the parent workout. `exercise_id` has no cascade: custom
 * exercises in use are archived, never deleted.
 */
export const workoutSets = sqliteTable(
  "workout_sets",
  {
    id: text("id").primaryKey(),
    workoutId: text("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    setIndex: integer("set_index").notNull(),
    reps: integer("reps").notNull(),
    loadValue: real("load_value").notNull(),
    loadUnit: text("load_unit").notNull(),
    loadKg: real("load_kg").notNull(),
    rpe: real("rpe"),
  },
  (t) => [
    uniqueIndex("workout_sets_workout_index_unique").on(t.workoutId, t.setIndex),
    index("workout_sets_exercise_idx").on(t.exerciseId),
    check("workout_sets_reps_chk", sql`${t.reps} BETWEEN 1 AND 100`),
    check("workout_sets_rpe_chk", sql`${t.rpe} IS NULL OR ${t.rpe} BETWEEN 1 AND 10`),
    check("workout_sets_load_chk", sql`${t.loadValue} >= 0 AND ${t.loadKg} >= 0`),
    check("workout_sets_unit_chk", sql`${t.loadUnit} IN ('kg', 'lb')`),
  ],
);
