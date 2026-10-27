import { describe, expect, it } from "vitest";
import { cookieFrom, createTestClient, PASSWORD, registerUser, signUpBody, uniqueEmail } from "./helpers";

describe("registration", () => {
  it("creates an account and sets an HTTP-only, SameSite=Lax session cookie", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/sign-up/email", {
      method: "POST",
      body: signUpBody(uniqueEmail()),
    });
    expect(res.status).toBe(200);
    const sessionCookie = res.headers.getSetCookie().find((c) => c.includes("session_token"));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it("does not return the password hash", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/sign-up/email", {
      method: "POST",
      body: signUpBody(uniqueEmail()),
    });
    const text = await res.text();
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toMatch(/"password"/);
  });

  it("never exposes the session token to JavaScript in response bodies", async () => {
    const client = createTestClient();
    const { email, cookie } = await registerUser(client);
    const signIn = await client.request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const session = await client.request("/api/auth/get-session", { cookie });
    for (const res of [signIn, session]) {
      const body = (await res.json()) as { token?: string; session?: { token?: string } };
      expect(body.token).toBeUndefined();
      expect(body.session?.token).toBeUndefined();
    }
  });

  it("rejects users who do not confirm they are adults", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/sign-up/email", {
      method: "POST",
      body: signUpBody(uniqueEmail(), { adultConfirmed: false }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an outdated privacy notice version", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/sign-up/email", {
      method: "POST",
      body: signUpBody(uniqueEmail(), { privacyPolicyVersion: "2000-01-01" }),
    });
    expect(res.status).toBe(400);
  });

  it("enforces the minimum password length", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/sign-up/email", {
      method: "POST",
      body: signUpBody(uniqueEmail(), { password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects sign-up requests from an untrusted origin", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: signUpBody(uniqueEmail()),
    });
    expect(res.status).toBe(403);
  });
});

describe("sign-in and sign-out", () => {
  it("signs in with correct credentials", async () => {
    const client = createTestClient();
    const { email } = await registerUser(client);
    const res = await client.request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toContain("session_token");
  });

  it("returns the same generic error for a wrong password and an unknown email", async () => {
    const client = createTestClient();
    const { email } = await registerUser(client);
    const wrongPassword = await client.request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: "not-the-right-password" }),
    });
    const unknownEmail = await client.request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: uniqueEmail("nobody"), password: "not-the-right-password" }),
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPassword.json()) as object).toEqual((await unknownEmail.json()) as object);
  });

  it("invalidates the session on sign-out", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    expect((await client.request("/api/me", { cookie })).status).toBe(200);

    const out = await client.request("/api/auth/sign-out", { method: "POST", cookie, body: "{}" });
    expect(out.status).toBe(200);
    expect((await client.request("/api/me", { cookie })).status).toBe(401);
  });

  it("rate-limits repeated sign-in attempts from one IP", async () => {
    const client = createTestClient();
    const { email } = await registerUser(client);
    const attempt = () =>
      client.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.7" },
        body: JSON.stringify({ email, password: "wrong-password-attempt" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("password reset", () => {
  it("emails a reset link, accepts a new password and revokes old sessions", async () => {
    const client = createTestClient();
    const { email, cookie: oldCookie } = await registerUser(client);

    const requested = await client.request("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });
    expect(requested.status).toBe(200);
    const message = client.mailer.sent.find((m) => m.to === email);
    expect(message).toBeDefined();
    const link = message!.text.match(/https?:\/\/\S+/)![0];
    const token = new URL(link).pathname.split("/").pop()!;

    const reset = await client.request("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "a-brand-new-long-password" }),
    });
    expect(reset.status).toBe(200);

    expect((await client.request("/api/me", { cookie: oldCookie })).status).toBe(401);
    const signIn = await client.request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: "a-brand-new-long-password" }),
    });
    expect(signIn.status).toBe(200);
  });

  it("does not reveal whether an email is registered", async () => {
    const client = createTestClient();
    const res = await client.request("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email: uniqueEmail("ghost"), redirectTo: "/reset-password" }),
    });
    expect(res.status).toBe(200);
    expect(client.mailer.sent).toHaveLength(0);
  });
});
