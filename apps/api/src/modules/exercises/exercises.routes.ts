import { createExerciseSchema } from "@plyntiq/shared";
import { Hono } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { apiError, parseJson } from "../../lib/http";
import { createExercise, ExerciseNameTakenError, listExercises, removeExercise } from "./exercise.repository";

export const exerciseRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    return c.json({ exercises: await listExercises(c.var.db, requireUserId(c)) });
  })
  .post("/", async (c) => {
    const input = await parseJson(c, createExerciseSchema);
    try {
      const exercise = await createExercise(c.var.db, requireUserId(c), input);
      return c.json({ exercise }, 201);
    } catch (err) {
      if (err instanceof ExerciseNameTakenError) {
        return apiError(c, 409, "conflict", err.message, [{ path: "name", message: err.message }]);
      }
      throw err;
    }
  })
  .delete("/:id", async (c) => {
    const result = await removeExercise(c.var.db, requireUserId(c), c.req.param("id"));
    return result ? c.json({ result }) : apiError(c, 404, "not_found", "Exercise not found");
  });
