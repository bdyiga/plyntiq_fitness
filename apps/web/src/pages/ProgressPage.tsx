import { addDays } from "@plyntiq/analytics";
import {
  ASSESSMENT_METHODS,
  formatDuration,
  fromCm,
  fromKg,
  fromMeters,
  heightUnitFor,
  roundTo,
  type AssessmentAnalyticsDto,
  type DistanceUnit,
  type WeightUnit,
} from "@plyntiq/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChartCard, TrendLine, WeeklyColumns } from "../components/charts";
import { PageHeader, SelectField } from "../components/ui";
import { api, queryKeys, type AnalyticsRangeParams } from "../lib/api";
import { formatTrainingDate, localToday } from "../lib/format";
import { useMe } from "../lib/use-me";

const RANGES = [
  { weeks: 4, label: "4 wk" },
  { weeks: 12, label: "12 wk" },
  { weeks: 26, label: "6 mo" },
  { weeks: 52, label: "1 yr" },
] as const;

const ALL = "";

function useRange(weeks: number): AnalyticsRangeParams {
  const to = localToday();
  return { from: addDays(to, -(weeks * 7 - 1)), to };
}

export function ProgressPage() {
  const me = useMe();
  const weightUnit: WeightUnit = me.data?.profile?.preferredWeightUnit ?? "kg";
  const distanceUnit: DistanceUnit = me.data?.profile?.preferredDistanceUnit ?? "m";
  const [weeks, setWeeks] = useState<number>(12);
  const range = useRange(weeks);

  return (
    <div className="space-y-6">
      <PageHeader title="Progress" />
      <p className="text-sm text-slate-600">
        What your logged training adds up to. These are measurements and estimates, not judgements.
      </p>

      <div role="group" aria-label="Time range" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {RANGES.map((r) => (
          <button
            key={r.weeks}
            type="button"
            aria-pressed={weeks === r.weeks}
            onClick={() => setWeeks(r.weeks)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              weeks === r.weeks ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <StrengthSection range={range} weightUnit={weightUnit} />
      <ConditioningSection range={range} distanceUnit={distanceUnit} />
      <AssessmentSection range={range} weightUnit={weightUnit} />
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-lg font-semibold text-slate-900">{children}</h2>;
}

function StrengthSection({ range, weightUnit }: { range: AnalyticsRangeParams; weightUnit: WeightUnit }) {
  const exercises = useQuery({ queryKey: queryKeys.exercises, queryFn: api.exercises });
  // Default to the exercise in the most recent workout.
  const latest = useQuery({ queryKey: [...queryKeys.workouts, "latest"], queryFn: () => api.workouts({ limit: 1 }) });
  const [chosen, setChosen] = useState<string | null>(null);
  const exerciseId = chosen ?? latest.data?.items[0]?.sets[0]?.exerciseId ?? ALL;

  const strength = useQuery({
    queryKey: [...queryKeys.analytics, "strength", range, exerciseId],
    queryFn: () => api.strengthAnalytics({ ...range, exerciseId: exerciseId || undefined }),
  });
  const data = strength.data;
  const load = (kg: number) => `${roundTo(fromKg(kg, weightUnit), 1)} ${weightUnit}`;
  const exerciseName = data?.exercise?.name ?? "all exercises";

  return (
    <section className="space-y-3">
      <SectionTitle>Strength</SectionTitle>
      <SelectField label="Exercise" name="exercise" value={exerciseId} onChange={(e) => setChosen(e.target.value)}>
        <option value={ALL}>All exercises</option>
        {exercises.data?.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </SelectField>

      {strength.isError && <LoadError />}
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.exercise && (
            <ChartCard
              title={`Estimated 1RM: ${data.exercise.name}`}
              subtitle="Best estimate per week (Epley formula, sets of 1–10 reps). An estimate, not a tested max."
              empty={data.bestE1rmByWeek.length ? null : "No sets of 1–10 reps with a load in this period."}
              table={{
                headers: ["Week of", "Estimated 1RM", "From set"],
                rows: data.bestE1rmByWeek.map((w) => [
                  formatTrainingDate(w.weekStart),
                  load(w.e1rmKg),
                  `${w.reps} × ${load(w.loadKg)}`,
                ]),
              }}
            >
              <TrendLine
                label="Estimated 1RM"
                format={(kg) => `${roundTo(fromKg(kg, weightUnit), 0)} ${weightUnit}`}
                data={data.bestE1rmByWeek.map((w) => ({
                  date: w.date,
                  value: w.e1rmKg,
                  detail: [`From ${w.reps} × ${load(w.loadKg)}`],
                }))}
              />
            </ChartCard>
          )}

          <ChartCard
            title={`Weekly volume: ${exerciseName}`}
            subtitle={`Sets × reps × load, in ${weightUnit}. Bodyweight sets count as 0.`}
            empty={data.weeklyVolume.some((w) => w.sets > 0) ? null : "No sets logged in this period."}
            table={{
              headers: ["Week of", "Volume", "Sets"],
              rows: data.weeklyVolume.map((w) => [formatTrainingDate(w.weekStart), load(w.volumeKg), w.sets]),
            }}
          >
            <WeeklyColumns
              label="Volume"
              format={load}
              data={data.weeklyVolume.map((w) => ({ weekStart: w.weekStart, value: fromKg(w.volumeKg, weightUnit) }))}
            />
          </ChartCard>

          <ChartCard
            title="Training days per week"
            subtitle={`All strength training. Trained in ${data.consistency.weeksWithTraining} of ${data.consistency.weeksInRange} weeks.`}
            empty={data.consistency.weeksWithTraining ? null : "No workouts logged in this period."}
            table={{
              headers: ["Week of", "Training days"],
              rows: data.weeklyFrequency.map((w) => [formatTrainingDate(w.weekStart), w.sessions]),
            }}
          >
            <WeeklyColumns
              label="Training days"
              format={(n) => String(n)}
              data={data.weeklyFrequency.map((w) => ({ weekStart: w.weekStart, value: w.sessions }))}
            />
          </ChartCard>

          {data.exercise && data.personalRecords.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">Personal records: {data.exercise.name}</h3>
              <p className="mt-0.5 text-sm text-slate-600">Sets that beat every earlier set. Ties don't count.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.personalRecords.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                    <span className="text-slate-600">{formatTrainingDate(p.date)}</span>
                    <span className="text-right text-slate-900">
                      {p.kind === "rep_max"
                        ? `Heaviest ${p.reps}-rep set: ${load(p.loadKg)} (was ${load(p.previousBestKg)})`
                        : `Best estimated 1RM: ${load(p.e1rmKg)} (was ${load(p.previousBestKg)})`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

const CONDITIONING_METRICS = {
  duration: "Duration",
  distance: "Distance",
  load: "Session-RPE load",
} as const;
type ConditioningMetric = keyof typeof CONDITIONING_METRICS;

function ConditioningSection({ range, distanceUnit }: { range: AnalyticsRangeParams; distanceUnit: DistanceUnit }) {
  const [metric, setMetric] = useState<ConditioningMetric>("duration");
  const conditioning = useQuery({
    queryKey: [...queryKeys.analytics, "conditioning", range],
    queryFn: () => api.conditioningAnalytics(range),
  });
  const weeks = conditioning.data?.weeks ?? [];

  const series = {
    duration: { value: (w: (typeof weeks)[number]) => w.durationS / 60, format: (min: number) => formatDuration(min * 60) },
    distance: {
      value: (w: (typeof weeks)[number]) => fromMeters(w.distanceM, distanceUnit),
      format: (d: number) => `${roundTo(d, distanceUnit === "m" ? 0 : 2)} ${distanceUnit}`,
    },
    load: { value: (w: (typeof weeks)[number]) => w.srpeLoad, format: (au: number) => `${Math.round(au)} AU` },
  }[metric];

  const subtitle = {
    duration: "Total time per week (h:mm:ss).",
    distance: "Total distance per week, from sessions that recorded one.",
    load: "Minutes × session RPE, in arbitrary units (AU). An estimate of effort, not a measure of fatigue.",
  }[metric];

  return (
    <section className="space-y-3">
      <SectionTitle>Conditioning</SectionTitle>
      {conditioning.isError && <LoadError />}
      {conditioning.data && (
        <ChartCard
          title={`Weekly ${CONDITIONING_METRICS[metric].toLowerCase()}`}
          subtitle={
            <>
              <span className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Conditioning measure">
                {(Object.keys(CONDITIONING_METRICS) as ConditioningMetric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={metric === m}
                    onClick={() => setMetric(m)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      metric === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                    }`}
                  >
                    {CONDITIONING_METRICS[m]}
                  </button>
                ))}
              </span>
              {subtitle}
            </>
          }
          empty={weeks.some((w) => w.sessions > 0) ? null : "No conditioning sessions logged in this period."}
          table={{
            headers: ["Week of", "Sessions", CONDITIONING_METRICS[metric]],
            rows: weeks.map((w) => [formatTrainingDate(w.weekStart), w.sessions, series.format(series.value(w))]),
          }}
        >
          <WeeklyColumns
            label={CONDITIONING_METRICS[metric]}
            format={series.format}
            data={weeks.map((w) => ({ weekStart: w.weekStart, value: series.value(w) }))}
          />
        </ChartCard>
      )}
    </section>
  );
}

function AssessmentSection({ range, weightUnit }: { range: AnalyticsRangeParams; weightUnit: WeightUnit }) {
  return (
    <section className="space-y-3">
      <SectionTitle>Sprint and jump tests</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <AssessmentChart definitionId="sprint_20m" range={range} weightUnit={weightUnit} />
        <AssessmentChart definitionId="vertical_jump" range={range} weightUnit={weightUnit} />
      </div>
    </section>
  );
}

function AssessmentChart({
  definitionId,
  range,
  weightUnit,
}: {
  definitionId: string;
  range: AnalyticsRangeParams;
  weightUnit: WeightUnit;
}) {
  const q = useQuery({
    queryKey: [...queryKeys.analytics, "assessment", definitionId, range],
    queryFn: () => api.assessmentAnalytics(definitionId, range),
  });
  if (q.isError) return <LoadError />;
  if (!q.data) return null;
  const { definition, days } = q.data;
  const fmt = assessmentFormatter(q.data, weightUnit);
  const groups = Object.entries(ASSESSMENT_METHODS).map(([id, label]) => ({ id, label }));
  // A day with several methods gets the first; the table lists them all.
  const methodsLabel = (ms: string[]) => ms.map((m) => ASSESSMENT_METHODS[m as keyof typeof ASSESSMENT_METHODS] ?? m).join(", ");

  return (
    <ChartCard
      title={definition.name}
      subtitle={
        definition.betterDirection === "lower"
          ? "Mean of each day's trials, in seconds. Faster times are higher on the chart. Marker shape shows the timing method."
          : "Mean of each day's trials. Marker shape shows the measuring method."
      }
      empty={days.length ? null : `No ${definition.name.toLowerCase()} results in this period.`}
      table={{
        headers: ["Date", "Result", "Trials", "Method"],
        rows: days.map((d) => [formatTrainingDate(d.date), fmt(d.value), d.trials, methodsLabel(d.methods)]),
      }}
    >
      <TrendLine
        label={definition.name}
        format={fmt}
        reversed={definition.betterDirection === "lower"}
        groups={groups}
        data={days.map((d) => ({
          date: d.date,
          value: d.value,
          group: d.methods[0],
          detail: d.trials > 1 ? [`Mean of ${d.trials} trials`] : [],
        }))}
      />
    </ChartCard>
  );
}

function assessmentFormatter(data: AssessmentAnalyticsDto, weightUnit: WeightUnit) {
  if (data.definition.canonicalUnit === "s") return (s: number) => `${roundTo(s, 2)} s`;
  const unit = heightUnitFor(weightUnit);
  return (cm: number) => `${roundTo(fromCm(cm, unit), 1)} ${unit}`;
}

function LoadError() {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      Couldn't load this chart. Check your connection and try again.
    </p>
  );
}
