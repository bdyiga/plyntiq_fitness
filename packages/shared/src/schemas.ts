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

/**
 * A training date as the athlete entered it (ADR 0004): a real calendar day,
 * not after tomorrow in UTC (which covers every time zone's "today").
 */
export const trainingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Not a real date")
  .refine((s) => s >= "2000-01-01", "Date is too far in the past")
  .refine((s) => s <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), "Date is in the future");

export const notesSchema = z.string().trim().max(2000, "Use 2000 characters or fewer");

/** Optional free text: empty strings become null. */
const optionalNotes = notesSchema.nullish().transform((s) => (s ? s : null));

export const MAX_SETS_PER_WORKOUT = 100;

export const workoutSetInputSchema = z
  .object({
    exerciseId: z.string().min(1).max(64),
    reps: z.number().int("Reps must be a whole number").min(1).max(100),
    loadValue: z.number().min(0, "Load cannot be negative").max(2000),
    loadUnit: z.enum(WEIGHT_UNITS),
    rpe: z.number().min(1).max(10).multipleOf(0.5, "Use whole or half RPE values").nullish().transform((v) => v ?? null),
  })
  .strict();

const setsSchema = z
  .array(workoutSetInputSchema)
  .min(1, "Add at least one set")
  .max(MAX_SETS_PER_WORKOUT, `Use ${MAX_SETS_PER_WORKOUT} sets or fewer`);

export const createWorkoutSchema = z
  .object({
    workoutDate: trainingDateSchema,
    notes: optionalNotes,
    sets: setsSchema,
  })
  .strict();

/** Sending `sets` replaces every set in the workout, in the given order. */
export const updateWorkoutSchema = z
  .object({
    workoutDate: trainingDateSchema.optional(),
    notes: optionalNotes.optional(),
    sets: setsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type WorkoutSetInput = z.infer<typeof workoutSetInputSchema>;
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;

export const PAGE_SIZE_MAX = 100;

export const pageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
    cursor: z.string().max(512).optional(),
  })
  .strict();
