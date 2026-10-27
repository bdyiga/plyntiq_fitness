import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { athleticGoals, sports } from "../../db/schema";
import type { AppEnv } from "../../env";

export const catalogRoutes = new Hono<AppEnv>()
  .get("/sports", async (c) => {
    const rows = await c.var.db
      .select({ id: sports.id, name: sports.name })
      .from(sports)
      .where(eq(sports.isActive, true))
      .orderBy(asc(sports.name));
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ sports: rows });
  })
  .get("/goals", async (c) => {
    const rows = await c.var.db
      .select({ id: athleticGoals.id, name: athleticGoals.name, quality: athleticGoals.quality })
      .from(athleticGoals)
      .where(eq(athleticGoals.isActive, true))
      .orderBy(asc(athleticGoals.name));
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ goals: rows });
  });
