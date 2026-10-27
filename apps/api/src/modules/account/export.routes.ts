import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import { users } from "../../db/schema";
import type { AppEnv } from "../../env";
import { allAssessments } from "../assessments/assessment.repository";
import { findProfile } from "../athletes/profile.repository";
import { allConditioning } from "../conditioning/conditioning.repository";
import { ownExercises } from "../exercises/exercise.repository";
import { allJobs } from "../imports/import.repository";
import { allWorkouts } from "../workouts/workout.repository";

/**
 * Personal data export (JSON). Each module adds its records here as it ships.
 * Credentials, session tokens and password hashes are never exported.
 */
export const exportRoutes = new Hono<AppEnv>().use(requireAuth).get("/", async (c) => {
  const userId = requireUserId(c);
  const user = await c.var.db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      adultConfirmed: true,
      privacyPolicyVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const [profile, customExercises, workouts, conditioning, assessmentResults, imports] = await Promise.all([
    findProfile(c.var.db, userId),
    ownExercises(c.var.db, userId),
    allWorkouts(c.var.db, userId),
    allConditioning(c.var.db, userId),
    allAssessments(c.var.db, userId),
    allJobs(c.var.db, userId),
  ]);

  c.header("Content-Disposition", `attachment; filename="plyntiq-export-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Cache-Control", "no-store");
  return c.json({
    // v2 (M2): training records added. v3 (M3): CSV import job metadata.
    exportFormatVersion: 3,
    exportedAt: new Date().toISOString(),
    account: user,
    athleteProfile: profile,
    customExercises,
    workouts,
    conditioning,
    assessmentResults,
    imports,
  });
});
