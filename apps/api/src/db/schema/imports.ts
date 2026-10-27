import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/**
 * One CSV upload. `preview` jobs hold validated rows in `import_staged_rows`
 * until the athlete confirms, and are deleted with them after 24 hours
 * (privacy.md). `confirmed` jobs keep only this metadata, for provenance and
 * undo. Undo deletes the created records and then the job, so the same file
 * can be imported again. The raw file is never stored.
 */
export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Hex SHA-256 of the uploaded text; refuses a second import of the same file. */
    fileSha256: text("file_sha256").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count").notNull(),
    acceptedCount: integer("accepted_count").notNull(),
    rejectedCount: integer("rejected_count").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    /** Preview jobs expire 24 hours after upload. */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("import_jobs_user_file_idx").on(t.userId, t.fileSha256),
    index("import_jobs_status_expiry_idx").on(t.status, t.expiresAt),
    check("import_jobs_kind_chk", sql`${t.kind} IN ('workouts', 'conditioning', 'assessments')`),
    check("import_jobs_status_chk", sql`${t.status} IN ('preview', 'confirmed')`),
  ],
);

/** Validated, normalized rows waiting for confirmation (JSON payloads, not the raw CSV). */
export const importStagedRows = sqliteTable(
  "import_staged_rows",
  {
    id: text("id").primaryKey(),
    importJobId: text("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
  },
  (t) => [index("import_staged_rows_job_idx").on(t.importJobId, t.rowNumber)],
);

/** Why a row was rejected. Never stores the cell values themselves. */
export const importRowErrors = sqliteTable(
  "import_row_errors",
  {
    id: text("id").primaryKey(),
    importJobId: text("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    field: text("field").notNull(),
    message: text("message").notNull(),
  },
  (t) => [index("import_row_errors_job_idx").on(t.importJobId, t.rowNumber)],
);
