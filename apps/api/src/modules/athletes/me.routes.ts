import { upsertProfileSchema, type MeDto } from "@plyntiq/shared";
import { Hono } from "hono";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { parseJson } from "../../lib/http";
import { findProfile, upsertProfile } from "./profile.repository";

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    const user = c.var.user!;
    const profile = await findProfile(c.var.db, requireUserId(c));
    return c.json<MeDto>({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
      profile,
    });
  })
  .put("/profile", async (c) => {
    const input = await parseJson(c, upsertProfileSchema);
    const profile = await upsertProfile(c.var.db, requireUserId(c), input);
    return c.json({ profile });
  });
