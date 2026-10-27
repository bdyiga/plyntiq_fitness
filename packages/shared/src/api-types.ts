import type { AthleticGoalId, DistanceUnit, ExerciseCategory, SportId, WeightUnit } from "./catalog";

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

export interface ExerciseDto {
  id: string;
  name: string;
  category: ExerciseCategory;
  isLowerBody: boolean;
  /** True for the athlete's own exercises; false for the global catalog. */
  isCustom: boolean;
}
