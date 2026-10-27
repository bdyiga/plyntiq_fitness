import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { apiError } from "../lib/http";

/** Resolves the session from the request cookie. Never trusts client-supplied user IDs. */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  c.set("session", result?.session ?? null);
  c.set("user", result?.user ?? null);
  await next();
});

/**
 * Gate for every private route. Downstream handlers read the athlete identity
 * only from `requireUserId(c)`, which comes from the server-side session.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) {
    return apiError(c, 401, "unauthenticated", "Sign in to continue");
  }
  await next();
});

export function requireUserId(c: { var: AppEnv["Variables"] }): string {
  const user = c.var.user;
  if (!user) throw new Error("requireUserId called on an unauthenticated route");
  return user.id;
}
