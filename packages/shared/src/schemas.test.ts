import { describe, expect, it } from "vitest";
import { registerFormSchema, upsertProfileSchema } from "./schemas";

const validProfile = {
  primarySportId: "rugby_union",
  primaryGoalId: "acceleration",
  preferredWeightUnit: "kg",
  preferredDistanceUnit: "m",
};

describe("upsertProfileSchema", () => {
  it("accepts a valid profile", () => {
    expect(upsertProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("rejects unknown keys such as userId (ownership smuggling)", () => {
    const result = upsertProfileSchema.safeParse({ ...validProfile, userId: "someone-else" });
    expect(result.success).toBe(false);
  });

  it("rejects sports and goals outside the catalog", () => {
    expect(upsertProfileSchema.safeParse({ ...validProfile, primarySportId: "curling" }).success).toBe(false);
    expect(upsertProfileSchema.safeParse({ ...validProfile, primaryGoalId: "fly" }).success).toBe(false);
  });
});

describe("registerFormSchema", () => {
  const valid = {
    name: "Test Athlete",
    email: "athlete@example.com",
    password: "a-long-enough-password",
    adultConfirmed: true,
    privacyAccepted: true,
  };

  it("accepts a valid registration", () => {
    expect(registerFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires adult confirmation and privacy acceptance", () => {
    expect(registerFormSchema.safeParse({ ...valid, adultConfirmed: false }).success).toBe(false);
    expect(registerFormSchema.safeParse({ ...valid, privacyAccepted: false }).success).toBe(false);
  });

  it("enforces minimum password length", () => {
    expect(registerFormSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});
