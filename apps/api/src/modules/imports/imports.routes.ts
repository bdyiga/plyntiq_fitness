import { createImportSchema, type ImportPreviewDto } from "@plyntiq/shared";
import { Hono, type Context } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { apiError, parseJson } from "../../lib/http";
import {
  parseCsvRows,
  validateAssessmentRows,
  validateConditioningRows,
  validateWorkoutRows,
  type ValidatedRows,
} from "./csv-rows";
import {
  confirmJob,
  createPreview,
  DuplicateFileError,
  exerciseIdsByName,
  ImportStateError,
  listJobs,
  possibleDuplicates,
  undoJob,
} from "./import.repository";

/** Shown in the preview so the athlete can check how the file was read. */
const SAMPLE_ROWS = 20;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const notFound = (c: Context) => apiError(c, 404, "not_found", "Import not found");

/**
 * Fixed-template CSV import: upload → validate → preview → confirm, with undo.
 * Nothing is saved as a record until the athlete confirms.
 */
export const importRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => c.json({ imports: await listJobs(c.var.db, requireUserId(c)) }))
  .post("/", async (c) => {
    const userId = requireUserId(c);
    const { kind, csv } = await parseJson(c, createImportSchema);
    const rows = parseCsvRows(csv, kind);

    let validated: ValidatedRows;
    if (kind === "workouts") validated = validateWorkoutRows(rows, await exerciseIdsByName(c.var.db, userId));
    else if (kind === "conditioning") validated = validateConditioningRows(rows);
    else validated = validateAssessmentRows(rows);

    try {
      const job = await createPreview(c.var.db, userId, {
        kind,
        fileSha256: await sha256Hex(csv),
        rowCount: rows.length,
        validated,
      });
      return c.json<ImportPreviewDto>(
        {
          job,
          sample: validated.staged.slice(0, SAMPLE_ROWS).map((s) => ({ rowNumber: s.rowNumber, cells: s.record })),
          errors: validated.errors,
          warnings: await possibleDuplicates(c.var.db, userId, kind, validated.staged),
        },
        201,
      );
    } catch (err) {
      if (err instanceof DuplicateFileError) {
        const when = err.job.confirmedAt?.slice(0, 10) ?? err.job.createdAt.slice(0, 10);
        return apiError(c, 409, "conflict", `You imported this file on ${when}. Undo that import first to import it again.`);
      }
      throw err;
    }
  })
  .post("/:id/confirm", async (c) => {
    try {
      const job = await confirmJob(c.var.db, requireUserId(c), c.req.param("id"));
      return job ? c.json({ job }) : notFound(c);
    } catch (err) {
      if (err instanceof ImportStateError) return apiError(c, 409, "conflict", err.message);
      throw err;
    }
  })
  .delete("/:id", async (c) => {
    const outcome = await undoJob(c.var.db, requireUserId(c), c.req.param("id"));
    return outcome ? c.json(outcome) : notFound(c);
  });
