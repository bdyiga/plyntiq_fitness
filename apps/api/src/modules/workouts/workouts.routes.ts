import { createWorkoutSchema, updateWorkoutSchema } from "@plyntiq/shared";
import { Hono, type Context } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { apiError, parseJson } from "../../lib/http";
import { parsePageQuery } from "../../lib/pagination";
import { createWorkout, deleteWorkout, getWorkout, listWorkouts, updateWorkout } from "./workout.repository";

const notFound = (c: Context) => apiError(c, 404, "not_found", "Workout not found");

export const workoutRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    return c.json(await listWorkouts(c.var.db, requireUserId(c), parsePageQuery(c)));
  })
  .post("/", async (c) => {
    const input = await parseJson(c, createWorkoutSchema);
    return c.json({ workout: await createWorkout(c.var.db, requireUserId(c), input) }, 201);
  })
  .get("/:id", async (c) => {
    const workout = await getWorkout(c.var.db, requireUserId(c), c.req.param("id"));
    return workout ? c.json({ workout }) : notFound(c);
  })
  .patch("/:id", async (c) => {
    const input = await parseJson(c, updateWorkoutSchema);
    const workout = await updateWorkout(c.var.db, requireUserId(c), c.req.param("id"), input);
    return workout ? c.json({ workout }) : notFound(c);
  })
  .delete("/:id", async (c) => {
    const deleted = await deleteWorkout(c.var.db, requireUserId(c), c.req.param("id"));
    return deleted ? c.body(null, 204) : notFound(c);
  });
