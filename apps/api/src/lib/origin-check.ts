import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { apiError } from "./http";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for our own JSON routes (Better Auth performs its own origin
 * check on /api/auth/*). Cookies are SameSite=Lax; additionally every
 * state-changing request must come from the app's own origin and carry JSON.
 */
export const originCheck = createMiddleware<AppEnv>(async (c, next) => {
  if (!UNSAFE_METHODS.has(c.req.method)) return next();

  const origin = c.req.header("origin");
  if (origin !== c.env.APP_ORIGIN) {
    return apiError(c, 403, "forbidden_origin", "Cross-origin request rejected");
  }
  const contentType = c.req.header("content-type") ?? "";
  const hasBody = c.req.header("content-length") !== "0" && c.req.method !== "DELETE";
  if (hasBody && !contentType.toLowerCase().startsWith("application/json")) {
    return apiError(c, 415, "unsupported_media_type", "Requests must be JSON");
  }
  await next();
});
