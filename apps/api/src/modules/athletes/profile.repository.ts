import type { AthleteProfileDto, UpsertProfileInput } from "@plyntiq/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { athleteProfiles } from "../../db/schema";

/**
 * Ownership-scoped data access: every function takes the authenticated
 * `userId` as its first argument and filters on it. Route handlers never pass
 * IDs taken from the request.
 */
export async function findProfile(db: Database, userId: string): Promise<AthleteProfileDto | null> {
  const row = await db.query.athleteProfiles.findFirst({
    where: eq(athleteProfiles.userId, userId),
  });
  return row ? toDto(row) : null;
}

export async function upsertProfile(
  db: Database,
  userId: string,
  input: UpsertProfileInput,
): Promise<AthleteProfileDto> {
  const now = new Date();
  const [row] = await db
    .insert(athleteProfiles)
    .values({ userId, ...input, onboardingCompletedAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: athleteProfiles.userId,
      set: { ...input, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("Profile upsert returned no row");
  return toDto(row);
}

function toDto(row: typeof athleteProfiles.$inferSelect): AthleteProfileDto {
  return {
    primarySportId: row.primarySportId as AthleteProfileDto["primarySportId"],
    primaryGoalId: row.primaryGoalId as AthleteProfileDto["primaryGoalId"],
    preferredWeightUnit: row.preferredWeightUnit as AthleteProfileDto["preferredWeightUnit"],
    preferredDistanceUnit: row.preferredDistanceUnit as AthleteProfileDto["preferredDistanceUnit"],
    onboardingCompletedAt: row.onboardingCompletedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
