import type { AthleticGoalId, DistanceUnit, SportId, WeightUnit } from "./catalog";

/** Error envelope returned by every non-auth API route. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}

export interface AthleteProfileDto {
  primarySportId: SportId;
  primaryGoalId: AthleticGoalId;
  preferredWeightUnit: WeightUnit;
  preferredDistanceUnit: DistanceUnit;
  onboardingCompletedAt: string;
  updatedAt: string;
}

export interface MeDto {
  user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: string };
  profile: AthleteProfileDto | null;
}
