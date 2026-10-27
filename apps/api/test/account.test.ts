import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createTestClient, PASSWORD, registerUser, VALID_PROFILE } from "./helpers";

describe("data export", () => {
  it("exports the athlete's own data without credentials or tokens", async () => {
    const client = createTestClient();
    const { cookie, email } = await registerUser(client);
    await client.request("/api/me/profile", { method: "PUT", cookie, body: JSON.stringify(VALID_PROFILE) });

    const res = await client.request("/api/me/export", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    const text = await res.text();
    const body = JSON.parse(text) as { account: { email: string }; athleteProfile: { primarySportId: string } };
    expect(body.account.email).toBe(email);
    expect(body.athleteProfile.primarySportId).toBe("rugby_union");
    expect(text).not.toMatch(/password"|token|session/i);
  });
});

describe("account deletion", () => {
  it("deletes the user and cascades to profile, sessions and credentials", async () => {
    const client = createTestClient();
    const { cookie, body } = await registerUser(client);
    const userId = body.user.id;
    await client.request("/api/me/profile", { method: "PUT", cookie, body: JSON.stringify(VALID_PROFILE) });

    const res = await client.request("/api/auth/delete-user", {
      method: "POST",
      cookie,
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(res.status).toBe(200);

    for (const table of ["users", "athlete_profiles", "sessions", "accounts"]) {
      const column = table === "users" ? "id" : "user_id";
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
        .bind(userId)
        .first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
    expect((await client.request("/api/me", { cookie })).status).toBe(401);
  });

  it("requires the correct password to delete the account", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/auth/delete-user", {
      method: "POST",
      cookie,
      body: JSON.stringify({ password: "not-my-password" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await client.request("/api/me", { cookie })).status).toBe(200);
  });
});
