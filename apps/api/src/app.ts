import { Hono } from "hono";
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
import { exportRoutes } from "./modules/account/export.routes";
import { exerciseRoutes } from "./modules/exercises/exercises.routes";
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
  app.use(
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => apiError(c, 413, "payload_too_large", "Request body too large"),
    }),
  );
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
  app.route("/exercises", exerciseRoutes);
  app.route("/workouts", workoutRoutes);
  app.route("/conditioning", conditioningRoutes);
  app.route("/assessments", assessmentRoutes);
  app.route("/analytics", analyticsRoutes);

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
