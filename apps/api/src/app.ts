import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth/auth";
import { loadSession } from "./auth/middleware";
import { stripSessionTokens } from "./auth/strip-tokens";
import { createDb } from "./db/client";
import type { AppDependencies, AppEnv } from "./env";
import { apiError, ValidationError } from "./lib/http";
import { mailerFor } from "./lib/mailer";
import { originCheck } from "./lib/origin-check";
import { analyticsRoutes } from "./modules/analytics/analytics.routes";
import { csvExportRoutes } from "./modules/account/csv-export.routes";
import { exportRoutes } from "./modules/account/export.routes";
import { exerciseRoutes } from "./modules/exercises/exercises.routes";
import { importRoutes } from "./modules/imports/imports.routes";
import { workoutRoutes } from "./modules/workouts/workouts.routes";
import { conditioningRoutes } from "./modules/conditioning/conditioning.routes";
import { assessmentRoutes } from "./modules/assessments/assessments.routes";
import { meRoutes } from "./modules/athletes/me.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";

export function createApp(deps: AppDependencies = {}) {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  const tooLarge = (c: Context) => apiError(c, 413, "payload_too_large", "Request body too large");
  const defaultLimit = bodyLimit({ maxSize: 64 * 1024, onError: tooLarge });
  // CSV uploads: up to 1 MB of text, which JSON escaping can roughly double.
  const importLimit = bodyLimit({ maxSize: 2.5 * 1024 * 1024, onError: tooLarge });
  app.use((c, next) => (c.req.method === "POST" && c.req.path === "/api/imports" ? importLimit : defaultLimit)(c, next));
  app.use(async (c, next) => {
    const db = createDb(c.env.DB);
    const mailer = deps.mailer?.(c.env) ?? mailerFor(c.env);
    c.set("db", db);
    c.set("auth", createAuth({ env: c.env, db, mailer }));
    await next();
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Better Auth owns /api/auth/* (registration, sign-in, reset, deletion) and
  // enforces its own origin checks and rate limits.
  app.on(["GET", "POST"], "/auth/*", async (c) => stripSessionTokens(await c.var.auth.handler(c.req.raw)));

  app.use(originCheck);
  app.route("/catalog", catalogRoutes);

  app.use(loadSession);
  app.route("/me", meRoutes);
  app.route("/me/export", exportRoutes);
  app.route("/me/export", csvExportRoutes);
  app.route("/exercises", exerciseRoutes);
  app.route("/workouts", workoutRoutes);
  app.route("/conditioning", conditioningRoutes);
  app.route("/assessments", assessmentRoutes);
  app.route("/analytics", analyticsRoutes);
  app.route("/imports", importRoutes);

  app.notFound((c) => apiError(c, 404, "not_found", "Route not found"));

  app.onError((err, c) => {
    if (err instanceof ValidationError) {
      return apiError(c, 400, "validation_failed", err.message, err.issues);
    }
    if (err instanceof HTTPException) {
      return apiError(c, err.status, "http_error", err.message);
    }
    // Log the error type and message only — never request bodies or athlete data.
    console.error(`[api] unhandled ${c.req.method} ${c.req.routePath}: ${err.name}: ${err.message}`);
    return apiError(c, 500, "internal_error", "Something went wrong");
  });

  return app;
}
