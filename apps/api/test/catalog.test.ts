import { ATHLETIC_GOALS, SPORTS } from "@plyntiq/shared";
import { describe, expect, it } from "vitest";
import { createTestClient } from "./helpers";

describe("catalog", () => {
  it("seeded sports match the shared catalog", async () => {
    const res = await createTestClient().request("/api/catalog/sports");
    const { sports } = (await res.json()) as { sports: { id: string; name: string }[] };
    expect(new Set(sports.map((s) => s.id))).toEqual(new Set(SPORTS.map((s) => s.id)));
  });

  it("seeded goals match the shared catalog", async () => {
    const res = await createTestClient().request("/api/catalog/goals");
    const { goals } = (await res.json()) as { goals: { id: string; quality: string }[] };
    expect(goals.map((g) => [g.id, g.quality]).sort()).toEqual(
      ATHLETIC_GOALS.map((g) => [g.id, g.quality]).sort(),
    );
  });

  it("serves the health check", async () => {
    const res = await createTestClient().request("/api/health");
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
