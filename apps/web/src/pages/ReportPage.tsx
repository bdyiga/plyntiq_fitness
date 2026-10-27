import { addDays, BASELINE_DAYS, daysBetween, type IsoDate } from "@plyntiq/analytics";
import {
  ASSESSMENT_DEFINITIONS,
  ASSESSMENT_METHODS,
  ANALYTICS_MAX_RANGE_DAYS,
  fromCm,
  fromKg,
  heightUnitFor,
  roundTo,
  type TranslationDto,
  type WeightUnit,
} from "@plyntiq/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { ChartCard, TrendLine } from "../components/charts";
import { PageHeader, SelectField } from "../components/ui";
import { api, queryKeys } from "../lib/api";
import { formatTrainingDate } from "../lib/format";
import {
  assessmentChangeText,
  flagMessage,
  REPORT_INTRO,
  SIDE_BY_SIDE_NOTE,
  summarySentence,
  trainingChangeText,
} from "../lib/report-copy";
import { useMe } from "../lib/use-me";

type Definition = (typeof ASSESSMENT_DEFINITIONS)[number];

export function ReportPage() {
  const me = useMe();
  const weightUnit: WeightUnit = me.data?.profile?.preferredWeightUnit ?? "kg";
  // The goal only decides which test comes first; both are always shown.
  const jumpFirst = me.data?.profile?.primaryGoalId === "lower_body_power";
  const definitions = jumpFirst ? [...ASSESSMENT_DEFINITIONS].reverse() : [...ASSESSMENT_DEFINITIONS];

  return (
    <div className="space-y-6">
      <PageHeader title="Performance Translation" />
      <p className="text-sm text-slate-600">{REPORT_INTRO}</p>
      {definitions.map((d) => (
        <TranslationCard key={d.id} definition={d} weightUnit={weightUnit} />
      ))}
    </div>
  );
}

function TranslationCard({ definition, weightUnit }: { definition: Definition; weightUnit: WeightUnit }) {
  const [exerciseId, setExerciseId] = useState<string | undefined>();
  const q = useQuery({
    queryKey: [...queryKeys.analytics, "translation", definition.id, exerciseId],
    queryFn: () => api.translation({ definitionId: definition.id, exerciseId }),
  });

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{definition.name}</h2>
      {q.isError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Couldn't load this comparison. Check your connection and try again.
        </p>
      )}
      {q.data && (
        <TranslationBody data={q.data} definition={definition} weightUnit={weightUnit} onExercise={setExerciseId} />
      )}
    </section>
  );
}

function TranslationBody({
  data,
  definition,
  weightUnit,
  onExercise,
}: {
  data: TranslationDto;
  definition: Definition;
  weightUnit: WeightUnit;
  onExercise: (id: string) => void;
}) {
  const { result, exercise, exerciseOptions } = data;
  const { assessment, training, window } = result;
  const load = (kg: number) => `${roundTo(fromKg(kg, weightUnit), 1)} ${weightUnit}`;
  const testValue = testFormatter(definition, weightUnit);
  const methods = (ms: string[] | undefined) =>
    (ms ?? []).map((m) => ASSESSMENT_METHODS[m as keyof typeof ASSESSMENT_METHODS] ?? m).join(" and ") || "not recorded";
  const testName = definition.name.toLowerCase();

  return (
    <>
      {exerciseOptions.length > 1 && exercise && (
        <SelectField
          label="Compare with"
          name={`exercise-${definition.id}`}
          value={exercise.id}
          onChange={(e) => onExercise(e.target.value)}
        >
          {exerciseOptions.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </SelectField>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ChangeTile
          label={exercise ? `${exercise.name}: estimated 1RM` : "Lower-body lift: estimated 1RM"}
          first={training.baseline && `${load(training.baseline.e1rmKg)} (${formatTrainingDate(training.baseline.date)})`}
          latest={training.current && `${load(training.current.e1rmKg)} (${formatTrainingDate(training.current.date)})`}
          change={training.percentChange === null ? null : trainingChangeText(training.percentChange)}
          note="Best estimate in the 14 days up to each test."
        />
        <ChangeTile
          label={`${definition.name}: result`}
          first={assessment.first && `${testValue(assessment.first.value)} (${formatTrainingDate(assessment.first.date)})`}
          latest={assessment.latest && `${testValue(assessment.latest.value)} (${formatTrainingDate(assessment.latest.date)})`}
          change={
            assessment.percentImprovement === null
              ? null
              : assessmentChangeText(assessment.percentImprovement, definition.betterDirection)
          }
          note="Mean of each day's trials. First test compared with latest."
        />
      </div>

      {window && exercise && training.percentChange !== null && assessment.percentImprovement !== null && (
        <p className="text-slate-800">
          {summarySentence({
            from: formatTrainingDate(window.from),
            to: formatTrainingDate(window.to),
            days: window.days,
            exerciseName: exercise.name.toLowerCase(),
            trainingChange: trainingChangeText(training.percentChange),
            testName,
            testChange: assessmentChangeText(assessment.percentImprovement, definition.betterDirection),
          })}
        </p>
      )}

      {result.dataQuality.length > 0 && (
        <ul aria-label="Things to know about this comparison" className="space-y-2">
          {result.dataQuality.map((flag) => (
            <li key={flag} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <span aria-hidden="true">⚠</span>
              <span>
                {flagMessage(flag, {
                  testName,
                  exerciseName: exercise?.name.toLowerCase() ?? null,
                  firstMethods: methods(assessment.first?.methods),
                  latestMethods: methods(assessment.latest?.methods),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {window && <SideBySideCharts data={data} definition={definition} weightUnit={weightUnit} />}

      {result.dataQuality.includes("insufficient_assessments") && (
        <p className="text-sm">
          <Link to="/assessments/new" className="font-medium text-emerald-800 underline">
            Log a {testName} result
          </Link>
        </p>
      )}
      <p className="text-xs text-slate-500">{SIDE_BY_SIDE_NOTE}</p>
    </>
  );
}

function ChangeTile({
  label,
  first,
  latest,
  change,
  note,
}: {
  label: string;
  first: string | null;
  latest: string | null;
  change: string | null;
  note: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{change ?? "–"}</p>
      <dl className="mt-1 text-sm text-slate-700">
        <div className="flex gap-1">
          <dt>First:</dt>
          <dd>{first ?? "not enough data"}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Latest:</dt>
          <dd>{latest ?? "not enough data"}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

/** Both series over the same dates: the comparison window plus the first baseline's 14 days. */
function SideBySideCharts({
  data,
  definition,
  weightUnit,
}: {
  data: TranslationDto;
  definition: Definition;
  weightUnit: WeightUnit;
}) {
  const window = data.result.window!;
  const to: IsoDate = window.to;
  const earliest = addDays(window.from, -(BASELINE_DAYS - 1));
  const from = daysBetween(earliest, to) >= ANALYTICS_MAX_RANGE_DAYS ? addDays(to, -(ANALYTICS_MAX_RANGE_DAYS - 1)) : earliest;
  const exercise = data.exercise;
  const strength = useQuery({
    queryKey: [...queryKeys.analytics, "strength", { from, to }, exercise?.id],
    queryFn: () => api.strengthAnalytics({ from, to, exerciseId: exercise!.id }),
    enabled: Boolean(exercise),
  });
  const testValue = testFormatter(definition, weightUnit);
  const load = (kg: number) => `${roundTo(fromKg(kg, weightUnit), 0)} ${weightUnit}`;
  const points = data.result.assessment.points;
  const weeks = strength.data?.bestE1rmByWeek ?? [];

  return (
    <div className="grid gap-3">
      {exercise && (
        <ChartCard
          title={`${exercise.name}: estimated 1RM per week`}
          empty={strength.data && weeks.length === 0 ? "No sets of 1–10 reps in this period." : null}
          table={{
            headers: ["Week of", "Estimated 1RM"],
            rows: weeks.map((w) => [formatTrainingDate(w.weekStart), load(w.e1rmKg)]),
          }}
        >
          <TrendLine
            label="Estimated 1RM"
            format={load}
            dateRange={{ from, to }}
            data={weeks.map((w) => ({ date: w.date, value: w.e1rmKg, detail: [`From ${w.reps} reps`] }))}
          />
        </ChartCard>
      )}
      <ChartCard
        title={`${definition.name}: results`}
        subtitle={definition.betterDirection === "lower" ? "Faster times are higher on the chart." : undefined}
        table={{
          headers: ["Date", "Result"],
          rows: points.map((p) => [formatTrainingDate(p.date), testValue(p.value)]),
        }}
      >
        <TrendLine
          label={definition.name}
          format={testValue}
          reversed={definition.betterDirection === "lower"}
          dateRange={{ from, to }}
          data={points.map((p) => ({ date: p.date, value: p.value }))}
        />
      </ChartCard>
    </div>
  );
}

function testFormatter(definition: Definition, weightUnit: WeightUnit) {
  if (definition.units[0] === "s") return (s: number) => `${roundTo(s, 2)} s`;
  const unit = heightUnitFor(weightUnit);
  return (cm: number) => `${roundTo(fromCm(cm, unit), 1)} ${unit}`;
}
