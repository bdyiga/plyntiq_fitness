import { z } from "zod";
import { ATHLETIC_GOALS, DISTANCE_UNITS, EXERCISE_CATEGORIES, SPORTS, WEIGHT_UNITS } from "./catalog";

const sportIds = SPORTS.map((s) => s.id) as [string, ...string[]];
const goalIds = ATHLETIC_GOALS.map((g) => g.id) as [string, ...string[]];

/**
 * Bump when the privacy notice changes materially. Registration must send the
 * current version; existing users are re-prompted (future work) when it changes.
 */
export const PRIVACY_POLICY_VERSION = "2026-10-26";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * `.strict()` rejects unknown keys, so a client cannot smuggle `userId` or
 * other ownership fields into a write.
 */
export const upsertProfileSchema = z
  .object({
    primarySportId: z.enum(sportIds),
    primaryGoalId: z.enum(goalIds),
    preferredWeightUnit: z.enum(WEIGHT_UNITS),
    preferredDistanceUnit: z.enum(DISTANCE_UNITS),
  })
  .strict();

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;

export const registerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(100),
    email: z.email("Enter a valid email address").max(254),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH),
    adultConfirmed: z.literal(true, { error: "You must be 18 or older to use Plyntiq" }),
    privacyAccepted: z.literal(true, { error: "You must accept the privacy notice" }),
  })
  .strict();

export type RegisterFormInput = z.infer<typeof registerFormSchema>;

/** Collapses internal whitespace so "Back  squat" and "Back squat" are one name. */
const displayName = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Enter a name").max(80, "Use 80 characters or fewer"));

export const createExerciseSchema = z
  .object({
    name: displayName,
    category: z.enum(EXERCISE_CATEGORIES),
    isLowerBody: z.boolean(),
  })
  .strict();

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
