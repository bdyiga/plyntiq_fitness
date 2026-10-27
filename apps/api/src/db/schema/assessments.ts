import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { importJobs } from "./imports";

/** Seeded reference data; must match ASSESSMENT_DEFINITIONS in the shared catalog (tested). */
export const assessmentDefinitions = sqliteTable(
  "assessment_definitions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    quality: text("quality").notNull(),
    canonicalUnit: text("canonical_unit").notNull(),
    /** JSON array of accepted entry units; the first is canonical. */
    units: text("units", { mode: "json" }).$type<string[]>().notNull(),
    betterDirection: text("better_direction").notNull(),
    /** JSON array of method IDs valid for this test. */
    allowedMethods: text("allowed_methods", { mode: "json" }).$type<string[]>().notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [check("assessment_definitions_direction_chk", sql`${t.betterDirection} IN ('lower', 'higher')`)],
);

/**
 * Method, surface, footwear and conditions travel with every result: a
 * hand-timed sprint and a gate-timed sprint are not comparable.
 */
export const assessmentResults = sqliteTable(
  "assessment_results",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    definitionId: text("definition_id")
      .notNull()
      .references(() => assessmentDefinitions.id),
    /** The athlete's local calendar day, YYYY-MM-DD (ADR 0004). */
    assessedOn: text("assessed_on").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    valueCanonical: real("value_canonical").notNull(),
    method: text("method").notNull(),
    surface: text("surface"),
    footwear: text("footwear"),
    conditionsNote: text("conditions_note"),
    notes: text("notes"),
    /** Set when the row came from a CSV import (provenance and undo). */
    importJobId: text("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [
    index("assessment_results_user_def_date_idx").on(t.userId, t.definitionId, t.assessedOn),
    index("assessment_results_user_date_idx").on(t.userId, t.assessedOn),
    check("assessment_results_date_chk", sql`date(${t.assessedOn}) IS ${t.assessedOn}`),
    check("assessment_results_value_chk", sql`${t.value} > 0 AND ${t.valueCanonical} > 0`),
    check("assessment_results_unit_chk", sql`${t.unit} IN ('s', 'cm', 'in')`),
  ],
);
