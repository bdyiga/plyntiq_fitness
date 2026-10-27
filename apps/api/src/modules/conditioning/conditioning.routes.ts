import { createConditioningSchema, updateConditioningSchema } from "@plyntiq/shared";
import { Hono, type Context } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { apiError, parseJson } from "../../lib/http";
import { parsePageQuery } from "../../lib/pagination";
import {
  createConditioning,
  deleteConditioning,
  getConditioning,
  listConditioning,
  updateConditioning,
} from "./conditioning.repository";

const notFound = (c: Context) => apiError(c, 404, "not_found", "Conditioning session not found");

export const conditioningRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    return c.json(await listConditioning(c.var.db, requireUserId(c), parsePageQuery(c)));
  })
  .post("/", async (c) => {
    const input = await parseJson(c, createConditioningSchema);
    return c.json({ session: await createConditioning(c.var.db, requireUserId(c), input) }, 201);
  })
  .get("/:id", async (c) => {
    const session = await getConditioning(c.var.db, requireUserId(c), c.req.param("id"));
    return session ? c.json({ session }) : notFound(c);
  })
  .patch("/:id", async (c) => {
    const input = await parseJson(c, updateConditioningSchema);
    const session = await updateConditioning(c.var.db, requireUserId(c), c.req.param("id"), input);
    return session ? c.json({ session }) : notFound(c);
  })
  .delete("/:id", async (c) => {
    const deleted = await deleteConditioning(c.var.db, requireUserId(c), c.req.param("id"));
    return deleted ? c.body(null, 204) : notFound(c);
  });
