import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/** Reference data, seeded by migration. Slug primary keys keep seeds stable. */
export const sports = sqliteTable("sports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const athleticGoals = sqliteTable("athletic_goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** The athletic quality the goal targets: speed | strength | power | conditioning. */
  quality: text("quality").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

/**
 * One profile per user (user_id is the primary key). Deliberately minimal:
 * no date of birth, sex, or body measurements are collected in the MVP.
 */
export const athleteProfiles = sqliteTable(
  "athlete_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    primarySportId: text("primary_sport_id")
      .notNull()
      .references(() => sports.id),
    primaryGoalId: text("primary_goal_id")
      .notNull()
      .references(() => athleticGoals.id),
    preferredWeightUnit: text("preferred_weight_unit").notNull(),
    preferredDistanceUnit: text("preferred_distance_unit").notNull(),
    onboardingCompletedAt: integer("onboarding_completed_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [
    check("athlete_profiles_weight_unit_chk", sql`${t.preferredWeightUnit} IN ('kg', 'lb')`),
    check("athlete_profiles_distance_unit_chk", sql`${t.preferredDistanceUnit} IN ('m', 'km', 'mi')`),
  ],
);
