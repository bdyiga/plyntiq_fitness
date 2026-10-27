import { PRIVACY_POLICY_VERSION } from "@plyntiq/shared";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { MemoryMailer } from "../src/lib/mailer";

export const ORIGIN = env.APP_ORIGIN;

export function createTestClient() {
  const mailer = new MemoryMailer();
  const app = createApp({ mailer: () => mailer });

  async function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has("origin")) headers.set("origin", ORIGIN);
    // Distinct client IP per request so auth rate limits don't couple tests;
    // rate-limit tests set a fixed cf-connecting-ip explicitly.
    if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", nextTestIp());
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (init.cookie) headers.set("cookie", init.cookie);
    return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
  }

  return { app, mailer, request };
}

export type TestClient = ReturnType<typeof createTestClient>;

let ipCounter = 0;
function nextTestIp() {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

let counter = 0;
export function uniqueEmail(label = "athlete") {
  counter += 1;
  return `${label}-${Date.now()}-${counter}@example.com`;
}

export const PASSWORD = "correct-horse-battery-staple";

export function signUpBody(email: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: "Test Athlete",
    email,
    password: PASSWORD,
    adultConfirmed: true,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    ...overrides,
  });
}

/** Turns Set-Cookie response headers into a Cookie request header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Registers a new user and returns its session cookie. */
export async function registerUser(client: TestClient, email = uniqueEmail()) {
  const res = await client.request("/api/auth/sign-up/email", { method: "POST", body: signUpBody(email) });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  return { email, cookie: cookieFrom(res), body: (await res.json()) as { user: { id: string } } };
}

export const VALID_PROFILE = {
  primarySportId: "rugby_union",
  primaryGoalId: "acceleration",
  preferredWeightUnit: "kg",
  preferredDistanceUnit: "m",
};

/** JSON request as a signed-in user. */
export function send(client: TestClient, cookie: string, method: string, path: string, body?: unknown) {
  return client.request(path, { method, cookie, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Counts rows matching `where` (test-only raw SQL; never interpolate user input). */
export async function countRows(table: string, where: string, ...binds: unknown[]) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
