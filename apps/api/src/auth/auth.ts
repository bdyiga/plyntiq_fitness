import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PRIVACY_POLICY_VERSION } from "@plyntiq/shared";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import type { Mailer } from "../lib/mailer";

interface CreateAuthOptions {
  env: Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "APP_ORIGIN" | "ENVIRONMENT">;
  db: Database;
  mailer: Mailer;
}

/**
 * Better Auth must be created per request on Workers because bindings (D1,
 * secrets) are only available on the request's `env`.
 */
export function createAuth({ env, db, mailer }: CreateAuthOptions) {
  return betterAuth({
    appName: "Plyntiq",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        rateLimit: schema.rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // No email provider yet; flip to true once delivery is configured.
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: "Reset your Plyntiq password",
          text: `Use this link to reset your password. It expires in 30 minutes.\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        });
      },
    },
    user: {
      additionalFields: {
        adultConfirmed: { type: "boolean", required: true, input: true },
        privacyPolicyVersion: { type: "string", required: true, input: true },
      },
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Sensitive actions (account deletion) need a session younger than this,
      // otherwise the password must be supplied.
      freshAge: 60 * 15,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const attested = user as typeof user & {
              adultConfirmed?: unknown;
              privacyPolicyVersion?: unknown;
            };
            if (attested.adultConfirmed !== true) {
              throw new APIError("BAD_REQUEST", { message: "You must be 18 or older to register" });
            }
            if (attested.privacyPolicyVersion !== PRIVACY_POLICY_VERSION) {
              throw new APIError("BAD_REQUEST", { message: "Please accept the current privacy notice" });
            }
            return { data: user };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 10, max: 3 },
        "/reset-password": { window: 60 * 10, max: 5 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: env.ENVIRONMENT === "production",
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
