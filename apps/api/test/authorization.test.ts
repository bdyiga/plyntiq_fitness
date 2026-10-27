import { describe, expect, it } from "vitest";
import { createTestClient, registerUser, VALID_PROFILE } from "./helpers";

describe("authenticated routes", () => {
  it("rejects unauthenticated requests", async () => {
    const client = createTestClient();
    expect((await client.request("/api/me")).status).toBe(401);
    expect((await client.request("/api/me/export")).status).toBe(401);
    const put = await client.request("/api/me/profile", { method: "PUT", body: JSON.stringify(VALID_PROFILE) });
    expect(put.status).toBe(401);
  });

  it("rejects a forged session cookie", async () => {
    const client = createTestClient();
    const res = await client.request("/api/me", { cookie: "better-auth.session_token=forged.value" });
    expect(res.status).toBe(401);
  });

  it("returns the signed-in user with no profile before onboarding", async () => {
    const client = createTestClient();
    const { cookie, email } = await registerUser(client);
    const res = await client.request("/api/me", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string }; profile: unknown };
    expect(body.user.email).toBe(email);
    expect(body.profile).toBeNull();
  });
});

describe("athlete profile", () => {
  it("creates and then updates the profile", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);

    const created = await client.request("/api/me/profile", {
      method: "PUT",
      cookie,
      body: JSON.stringify(VALID_PROFILE),
    });
    expect(created.status).toBe(200);

    const updated = await client.request("/api/me/profile", {
      method: "PUT",
      cookie,
      body: JSON.stringify({ ...VALID_PROFILE, primaryGoalId: "max_strength", preferredWeightUnit: "lb" }),
    });
    expect(updated.status).toBe(200);

    const me = (await (await client.request("/api/me", { cookie })).json()) as {
      profile: { primaryGoalId: string; preferredWeightUnit: string };
    };
    expect(me.profile.primaryGoalId).toBe("max_strength");
    expect(me.profile.preferredWeightUnit).toBe("lb");
  });

  it("returns field-level validation errors", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/me/profile", {
      method: "PUT",
      cookie,
      body: JSON.stringify({ ...VALID_PROFILE, primarySportId: "curling" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.issues.map((i) => i.path)).toContain("primarySportId");
  });
});

describe("cross-account isolation", () => {
  it("never lets one athlete read or write another athlete's profile", async () => {
    const client = createTestClient();
    const alice = await registerUser(client);
    const bob = await registerUser(client);

    await client.request("/api/me/profile", {
      method: "PUT",
      cookie: alice.cookie,
      body: JSON.stringify(VALID_PROFILE),
    });

    // Bob tries to target Alice by smuggling her user ID into the body.
    const smuggled = await client.request("/api/me/profile", {
      method: "PUT",
      cookie: bob.cookie,
      body: JSON.stringify({ ...VALID_PROFILE, primaryGoalId: "conditioning", userId: alice.body.user.id }),
    });
    expect(smuggled.status).toBe(400);

    const bobMe = (await (await client.request("/api/me", { cookie: bob.cookie })).json()) as {
      user: { id: string };
      profile: unknown;
    };
    expect(bobMe.user.id).toBe(bob.body.user.id);
    expect(bobMe.profile).toBeNull();

    const aliceMe = (await (await client.request("/api/me", { cookie: alice.cookie })).json()) as {
      profile: { primaryGoalId: string };
    };
    expect(aliceMe.profile.primaryGoalId).toBe("acceleration");
  });
});

describe("CSRF and request hygiene", () => {
  it("rejects state-changing requests from another origin", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/me/profile", {
      method: "PUT",
      cookie,
      headers: { origin: "https://evil.example" },
      body: JSON.stringify(VALID_PROFILE),
    });
    expect(res.status).toBe(403);
  });

  it("rejects non-JSON bodies on state-changing requests", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/me/profile", {
      method: "PUT",
      cookie,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "primarySportId=rugby_union",
    });
    expect(res.status).toBe(415);
  });

  it("rejects malformed JSON with a safe error", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/me/profile", { method: "PUT", cookie, body: "{not json" });
    expect(res.status).toBe(400);
  });

  it("rejects oversized request bodies", async () => {
    const client = createTestClient();
    const { cookie } = await registerUser(client);
    const res = await client.request("/api/me/profile", {
      method: "PUT",
      cookie,
      body: JSON.stringify({ padding: "x".repeat(70 * 1024) }),
    });
    expect(res.status).toBe(413);
  });

  it("returns JSON 404s for unknown API routes", async () => {
    const client = createTestClient();
    const res = await client.request("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });
});
