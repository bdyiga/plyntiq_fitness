import { z } from "zod";
import {
  ASSESSMENT_DEFINITIONS,
  ASSESSMENT_FOOTWEAR,
  ASSESSMENT_METHODS,
  ASSESSMENT_SURFACES,
  ATHLETIC_GOALS,
  CONDITIONING_TYPES,
  DISTANCE_UNITS,
  EXERCISE_CATEGORIES,
  SPORTS,
  WEIGHT_UNITS,
} from "./catalog";
import { toAssessmentCanonical } from "./units";

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
    reps: z.number({ error: "Enter reps" }).int("Reps must be a whole number").min(1, "Reps must be 1–100").max(100, "Reps must be 1–100"),
    loadValue: z.number({ error: "Enter a load (0 for bodyweight)" }).min(0, "Load cannot be negative").max(2000, "Load is too high"),
    loadUnit: z.enum(WEIGHT_UNITS),
    rpe: z
      .number({ error: "RPE must be a number" })
      .min(1, "RPE must be 1–10")
      .max(10, "RPE must be 1–10")
      .multipleOf(0.5, "Use whole or half RPE values").nullish().transform((v) => v ?? null),
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

export const MAX_DURATION_S = 24 * 3600;

const conditioningFields = {
  sessionDate: trainingDateSchema,
  type: z.enum(CONDITIONING_TYPES),
  /** Seconds; the web form parses "mm:ss" with `parseDuration`. */
  durationS: z.number({ error: "Enter a duration" }).gt(0, "Duration must be more than zero").max(MAX_DURATION_S, "Use 24 hours or less"),
  distanceValue: z.number({ error: "Enter a distance" }).gt(0, "Distance must be more than zero").max(1000, "Distance is too long").nullable(),
  distanceUnit: z.enum(DISTANCE_UNITS).nullable(),
  /** Session RPE on Foster's CR-10 scale (0 = rest, 10 = maximal). */
  sessionRpe: z.number({ error: "Choose a session RPE" }).min(0).max(10).multipleOf(0.5, "Use whole or half RPE values"),
  notes: optionalNotes,
};

/** Distance is optional, but a value and its unit come together. */
function distancePaired(v: { distanceValue?: number | null; distanceUnit?: string | null }) {
  return (v.distanceValue == null) === (v.distanceUnit == null);
}
const distanceIssue = { message: "Give both a distance and its unit, or neither", path: ["distanceUnit"] };

export const createConditioningSchema = z
  .object({
    ...conditioningFields,
    distanceValue: conditioningFields.distanceValue.optional().transform((v) => v ?? null),
    distanceUnit: conditioningFields.distanceUnit.optional().transform((v) => v ?? null),
  })
  .strict()
  .refine(distancePaired, distanceIssue);

export const updateConditioningSchema = z
  .object({
    sessionDate: conditioningFields.sessionDate.optional(),
    type: conditioningFields.type.optional(),
    durationS: conditioningFields.durationS.optional(),
    distanceValue: conditioningFields.distanceValue.optional(),
    distanceUnit: conditioningFields.distanceUnit.optional(),
    sessionRpe: conditioningFields.sessionRpe.optional(),
    notes: optionalNotes.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
  .refine((v) => ("distanceValue" in v) === ("distanceUnit" in v) && distancePaired(v), distanceIssue);

export type CreateConditioningInput = z.infer<typeof createConditioningSchema>;
export type UpdateConditioningInput = z.infer<typeof updateConditioningSchema>;

const keysOf = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/**
 * Field shapes only; `assessmentRules` checks the fields that depend on the
 * definition (unit, method, plausible range). PATCH merges the stored result
 * with the patch and re-validates the whole thing with `createAssessmentSchema`.
 */
const assessmentShape = z
  .object({
    definitionId: z.enum(ASSESSMENT_DEFINITIONS.map((d) => d.id) as [string, ...string[]]),
    assessedOn: trainingDateSchema,
    value: z.number({ error: "Enter a result" }).gt(0, "Value must be more than zero").max(1000),
    unit: z.string().max(8),
    method: z.enum(keysOf(ASSESSMENT_METHODS), { error: "Choose how it was measured" }),
    surface: z.enum(keysOf(ASSESSMENT_SURFACES)).nullish().transform((v) => v ?? null),
    footwear: z.enum(keysOf(ASSESSMENT_FOOTWEAR)).nullish().transform((v) => v ?? null),
    conditionsNote: z.string().trim().max(200, "Use 200 characters or fewer").nullish().transform((s) => (s ? s : null)),
    notes: optionalNotes,
  })
  .strict();

export const createAssessmentSchema = assessmentShape.superRefine((v, ctx) => {
  const def = ASSESSMENT_DEFINITIONS.find((d) => d.id === v.definitionId);
  if (!def) return;
  if (!(def.units as readonly string[]).includes(v.unit)) {
    ctx.addIssue({ code: "custom", path: ["unit"], message: `Use ${def.units.join(" or ")}` });
    return;
  }
  if (!(def.methods as readonly string[]).includes(v.method)) {
    ctx.addIssue({ code: "custom", path: ["method"], message: `Not a ${def.name} method` });
  }
  const canonical = toAssessmentCanonical(v.value, v.unit as "s" | "cm" | "in");
  if (canonical < def.min || canonical > def.max) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: `Expected ${def.min}–${def.max} ${def.units[0]}; check the value and unit`,
    });
  }
});

/** The definition cannot change; delete and re-log instead. */
export const updateAssessmentSchema = assessmentShape
  .omit({ definitionId: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
