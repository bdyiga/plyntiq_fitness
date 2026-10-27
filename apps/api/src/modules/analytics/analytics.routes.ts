import {
  addDays,
  BASELINE_DAYS,
  bestE1rmByWeek,
  consistency,
  dailyAssessmentValues,
  daysBetween,
  mostLoggedExercise,
  personalRecords,
  translate,
  weeklyConditioning,
  weeklyFrequency,
  weeklyVolume,
  type IsoDate,
} from "@plyntiq/analytics";
import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  ANALYTICS_MAX_RANGE_DAYS,
  ASSESSMENT_DEFINITIONS,
  analyticsRangeQuerySchema,
  strengthAnalyticsQuerySchema,
  translationQuerySchema,
  type AnalyticsRange,
  type AssessmentAnalyticsDto,
  type ConditioningAnalyticsDto,
  type StrengthAnalyticsDto,
  type TranslationDto,
} from "@plyntiq/shared";
import { Hono, type Context } from "hono";
import type { z } from "zod";
import { requireAuth, requireUserId } from "../../auth/middleware";
import type { AppEnv } from "../../env";
import { apiError, ValidationError } from "../../lib/http";
import {
  assessmentInputs,
  conditioningInputs,
  findExercise,
  loggedLowerBodyExercises,
  strengthSets,
  trainingDates,
} from "./analytics.repository";

/**
 * Descriptive analytics computed per request from the athlete's own rows by
 * the pure functions in @plyntiq/analytics. No caching tables in M3.
 */

/** Dates are local calendar days; UTC "today" is close enough for defaults and staleness. */
const todayUtc = (): IsoDate => new Date().toISOString().slice(0, 10);

function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.infer<T> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

function resolveRange(q: { from?: string; to?: string }): AnalyticsRange {
  const to = q.to ?? todayUtc();
  const from = q.from ?? addDays(to, -(ANALYTICS_DEFAULT_RANGE_DAYS - 1));
  const span = daysBetween(from, to);
  if (span < 0) throw new ValidationError([{ path: "from", message: "`from` must not be after `to`" }]);
  if (span >= ANALYTICS_MAX_RANGE_DAYS) {
    throw new ValidationError([{ path: "from", message: `Use a range of at most ${ANALYTICS_MAX_RANGE_DAYS} days` }]);
  }
  return { from, to };
}

const exerciseNotFound = (c: Context) => apiError(c, 404, "not_found", "Exercise not found");

export const analyticsRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/strength", async (c) => {
    const userId = requireUserId(c);
    const q = parseQuery(c, strengthAnalyticsQuerySchema);
    const range = resolveRange(q);
    const inRange = (d: IsoDate) => d >= range.from && d <= range.to;

    let body: Omit<StrengthAnalyticsDto, "weeklyFrequency" | "consistency">;
    if (q.exerciseId) {
      const exercise = await findExercise(c.var.db, userId, q.exerciseId);
      if (!exercise) return exerciseNotFound(c);
      // Full history up to `to`: a PR is judged against every earlier set, not just the range.
      const history = await strengthSets(c.var.db, userId, { to: range.to, exerciseId: exercise.id });
      const rangeSets = history.filter((s) => inRange(s.date));
      body = {
        range,
        exercise,
        weeklyVolume: weeklyVolume(rangeSets, range.from, range.to),
        bestE1rmByWeek: bestE1rmByWeek(rangeSets),
        personalRecords: personalRecords(history).filter((p) => inRange(p.date)),
      };
    } else {
      const sets = await strengthSets(c.var.db, userId, range);
      body = { range, exercise: null, weeklyVolume: weeklyVolume(sets, range.from, range.to), bestE1rmByWeek: [], personalRecords: [] };
    }

    const dates = await trainingDates(c.var.db, userId, range.from, range.to);
    return c.json<StrengthAnalyticsDto>({
      ...body,
      weeklyFrequency: weeklyFrequency(dates, range.from, range.to),
      consistency: consistency(dates, range.from, range.to),
    });
  })
  .get("/conditioning", async (c) => {
    const range = resolveRange(parseQuery(c, analyticsRangeQuerySchema));
    const sessions = await conditioningInputs(c.var.db, requireUserId(c), range.from, range.to);
    return c.json<ConditioningAnalyticsDto>({ range, weeks: weeklyConditioning(sessions, range.from, range.to) });
  })
  .get("/assessments/:definitionId", async (c) => {
    const def = ASSESSMENT_DEFINITIONS.find((d) => d.id === c.req.param("definitionId"));
    if (!def) return apiError(c, 404, "not_found", "Assessment not found");
    const range = resolveRange(parseQuery(c, analyticsRangeQuerySchema));
    const results = await assessmentInputs(c.var.db, requireUserId(c), def.id, range);
    return c.json<AssessmentAnalyticsDto>({
      range,
      definition: { id: def.id, name: def.name, canonicalUnit: def.units[0], betterDirection: def.betterDirection },
      days: dailyAssessmentValues(results),
    });
  })
  .get("/translation", async (c) => {
    const userId = requireUserId(c);
    const q = parseQuery(c, translationQuerySchema);
    const def = ASSESSMENT_DEFINITIONS.find((d) => d.id === q.definitionId)!;
    const today = todayUtc();
    const [assessments, exerciseOptions] = await Promise.all([
      assessmentInputs(c.var.db, userId, def.id),
      loggedLowerBodyExercises(c.var.db, userId),
    ]);

    let exercise: { id: string; name: string } | null = null;
    if (q.exerciseId) {
      const found = await findExercise(c.var.db, userId, q.exerciseId);
      if (!found) return exerciseNotFound(c);
      if (!found.isLowerBody) {
        throw new ValidationError([{ path: "exerciseId", message: "Choose a lower-body exercise" }]);
      }
      exercise = { id: found.id, name: found.name };
    } else if (exerciseOptions.length > 0) {
      // Default: the lower-body lift logged most often across the comparison window
      // (with its baseline days); failing that, across all history.
      const firstDate = assessments[0]?.date;
      const lastDate = assessments.at(-1)?.date;
      const lowerBody = await strengthSets(c.var.db, userId, { to: today, lowerBodyOnly: true });
      const id =
        (firstDate && lastDate ? mostLoggedExercise(lowerBody, addDays(firstDate, -(BASELINE_DAYS - 1)), lastDate) : null) ??
        mostLoggedExercise(lowerBody, "2000-01-01", today);
      exercise = exerciseOptions.find((e) => e.id === id) ?? null;
    }

    const sets = exercise ? await strengthSets(c.var.db, userId, { to: today, exerciseId: exercise.id }) : [];
    const result = translate({
      definitionId: def.id,
      betterDirection: def.betterDirection,
      assessments,
      exerciseId: exercise?.id ?? null,
      sets,
      today,
    });
    return c.json<TranslationDto>({ exercise, exerciseOptions, result });
  });
