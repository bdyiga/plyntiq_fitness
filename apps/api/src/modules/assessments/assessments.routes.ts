import { ASSESSMENT_DEFINITIONS, createAssessmentSchema, updateAssessmentSchema } from "@plyntiq/shared";
import { Hono, type Context } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { apiError, parseJson, ValidationError } from "../../lib/http";
import { parsePageQuery } from "../../lib/pagination";
import {
  createAssessment,
  deleteAssessment,
  getAssessment,
  listAssessments,
  listDefinitions,
  updateAssessment,
} from "./assessment.repository";

const notFound = (c: Context) => apiError(c, 404, "not_found", "Assessment result not found");

export const assessmentRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/definitions", async (c) => {
    return c.json({ definitions: await listDefinitions(c.var.db) });
  })
  .get("/", async (c) => {
    const { definitionId, ...query } = c.req.query();
    if (definitionId !== undefined && !ASSESSMENT_DEFINITIONS.some((d) => d.id === definitionId)) {
      throw new ValidationError([{ path: "definitionId", message: "Unknown assessment" }]);
    }
    return c.json(await listAssessments(c.var.db, requireUserId(c), parsePageQuery(c, query), definitionId));
  })
  .post("/", async (c) => {
    const input = await parseJson(c, createAssessmentSchema);
    return c.json({ result: await createAssessment(c.var.db, requireUserId(c), input) }, 201);
  })
  .get("/:id", async (c) => {
    const result = await getAssessment(c.var.db, requireUserId(c), c.req.param("id"));
    return result ? c.json({ result }) : notFound(c);
  })
  .patch("/:id", async (c) => {
    const input = await parseJson(c, updateAssessmentSchema);
    const result = await updateAssessment(c.var.db, requireUserId(c), c.req.param("id"), input);
    return result ? c.json({ result }) : notFound(c);
  })
  .delete("/:id", async (c) => {
    const deleted = await deleteAssessment(c.var.db, requireUserId(c), c.req.param("id"));
    return deleted ? c.body(null, 204) : notFound(c);
  });
