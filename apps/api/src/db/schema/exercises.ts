import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/**
 * Global catalog rows (`owner_user_id` NULL, slug IDs, seeded) and athletes'
 * custom exercises (random IDs). Custom exercises that already appear in
 * logged sets are archived rather than deleted, so history stays intact.
 */
export const exercises = sqliteTable(
  "exercises",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    isLowerBody: integer("is_lower_body", { mode: "boolean" }).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [
    // NULL owners are distinct in a SQLite unique index, so this only constrains
    // custom exercises; clashes with global names are rejected in the repository.
    uniqueIndex("exercises_owner_name_unique").on(t.ownerUserId, sql`lower(${t.name})`),
    check(
      "exercises_category_chk",
      sql`${t.category} IN ('squat', 'hinge', 'lunge', 'push', 'pull', 'jump', 'carry', 'other')`,
    ),
  ],
);
