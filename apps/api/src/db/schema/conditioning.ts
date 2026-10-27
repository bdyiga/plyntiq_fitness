import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

export const conditioningSessions = sqliteTable(
  "conditioning_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The athlete's local calendar day, YYYY-MM-DD (ADR 0004). */
    sessionDate: text("session_date").notNull(),
    type: text("type").notNull(),
    durationS: real("duration_s").notNull(),
    distanceValue: real("distance_value"),
    distanceUnit: text("distance_unit"),
    distanceM: real("distance_m"),
    /** Foster CR-10 session RPE. */
    sessionRpe: real("session_rpe").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [
    index("conditioning_user_date_idx").on(t.userId, t.sessionDate),
    check("conditioning_date_chk", sql`date(${t.sessionDate}) IS ${t.sessionDate}`),
    check("conditioning_type_chk", sql`${t.type} IN ('run', 'sprint', 'intervals', 'other')`),
    check("conditioning_duration_chk", sql`${t.durationS} > 0`),
    check("conditioning_rpe_chk", sql`${t.sessionRpe} BETWEEN 0 AND 10`),
    check(
      "conditioning_distance_chk",
      sql`(${t.distanceValue} IS NULL AND ${t.distanceUnit} IS NULL AND ${t.distanceM} IS NULL)
        OR (${t.distanceValue} > 0 AND ${t.distanceUnit} IN ('m', 'km', 'mi') AND ${t.distanceM} > 0)`,
    ),
  ],
);
