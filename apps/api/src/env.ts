import type { Auth, AuthSession } from "./auth/auth";
import type { Database } from "./db/client";
import type { Mailer } from "./lib/mailer";

export interface AppVariables {
  db: Database;
  auth: Auth;
  /** Populated for every /api request; null when not signed in. */
  session: AuthSession["session"] | null;
  user: AuthSession["user"] | null;
}

export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}

export interface AppDependencies {
  /** Override the mailer (tests capture reset emails in memory). */
  mailer?: (env: Env) => Mailer;
}
