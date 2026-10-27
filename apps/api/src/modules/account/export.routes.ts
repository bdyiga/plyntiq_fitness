import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import { users } from "../../db/schema";
import type { AppEnv } from "../../env";
import { findProfile } from "../athletes/profile.repository";

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
  const profile = await findProfile(c.var.db, userId);

  c.header("Content-Disposition", `attachment; filename="plyntiq-export-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Cache-Control", "no-store");
  return c.json({
    exportFormatVersion: 1,
    exportedAt: new Date().toISOString(),
    account: user,
    athleteProfile: profile,
  });
});
