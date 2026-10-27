import type {
  AssessmentDefinitionId,
  AssessmentFootwear,
  AssessmentMethod,
  AssessmentSurface,
  AssessmentUnit,
  AthleticGoalId,
  ConditioningType,
  DistanceUnit,
  ExerciseCategory,
  SportId,
  WeightUnit,
} from "./catalog";

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

export interface WorkoutSetDto {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  reps: number;
  loadValue: number;
  loadUnit: WeightUnit;
  /** Canonical load computed by the server; analytics read only this. */
  loadKg: number;
  rpe: number | null;
}

export interface WorkoutDto {
  id: string;
  workoutDate: string;
  notes: string | null;
  sets: WorkoutSetDto[];
  createdAt: string;
  updatedAt: string;
}

/** List responses: pass `nextCursor` back as `?cursor=` until it is null. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConditioningSessionDto {
  id: string;
  sessionDate: string;
  type: ConditioningType;
  durationS: number;
  distanceValue: number | null;
  distanceUnit: DistanceUnit | null;
  /** Canonical distance computed by the server. */
  distanceM: number | null;
  sessionRpe: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentDefinitionDto {
  id: AssessmentDefinitionId;
  name: string;
  quality: string;
  canonicalUnit: string;
  units: string[];
  betterDirection: "lower" | "higher";
  allowedMethods: AssessmentMethod[];
}

export interface AssessmentResultDto {
  id: string;
  definitionId: AssessmentDefinitionId;
  assessedOn: string;
  value: number;
  unit: AssessmentUnit;
  /** Canonical value (s or cm) computed by the server. */
  valueCanonical: number;
  method: AssessmentMethod;
  surface: AssessmentSurface | null;
  footwear: AssessmentFootwear | null;
  conditionsNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
