import {
  ASSESSMENT_DEFINITIONS,
  type AssessmentResultDto,
  type ConditioningSessionDto,
  type Page,
  type WorkoutDto,
} from "@plyntiq/shared";
import { useInfiniteQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Card, FormError, PageHeader, SecondaryButton } from "../components/ui";
import { api, queryKeys } from "../lib/api";
import { formatDuration, formatNumber, formatTrainingDate, methodLabel } from "../lib/format";
import { CONDITIONING_TYPE_LABELS } from "./ConditioningFormPage";

const TABS = [
  { id: "workouts", label: "Workouts", logPath: "/workouts/new", logLabel: "Log workout" },
  { id: "conditioning", label: "Conditioning", logPath: "/conditioning/new", logLabel: "Log conditioning" },
  { id: "assessments", label: "Assessments", logPath: "/assessments/new", logLabel: "Log assessment" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PAGE_SIZE = 20;

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];

  return (
    <div className="space-y-6">
      <PageHeader title="History">
        <Link
          to={tab.logPath}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {tab.logLabel}
        </Link>
      </PageHeader>
      <div role="tablist" aria-label="Record type" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${
              t.id === tab.id ? "bg-white shadow-sm" : "text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab.label}>
        <TabContent tab={tab.id} />
      </div>
    </div>
  );
}

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case "workouts":
      return (
        <RecordList<WorkoutDto>
          queryKey={queryKeys.workouts}
          fetchPage={(cursor) => api.workouts({ limit: PAGE_SIZE, cursor })}
          remove={api.deleteWorkout}
          noun="workout"
          empty="No workouts yet."
          editPath={(w) => `/workouts/${w.id}/edit`}
          render={(w) => <WorkoutSummary workout={w} />}
        />
      );
    case "conditioning":
      return (
        <RecordList<ConditioningSessionDto>
          queryKey={queryKeys.conditioning}
          fetchPage={(cursor) => api.conditioningList({ limit: PAGE_SIZE, cursor })}
          remove={api.deleteConditioning}
          noun="session"
          empty="No conditioning sessions yet."
          editPath={(s) => `/conditioning/${s.id}/edit`}
          render={(s) => <ConditioningSummary session={s} />}
        />
      );
    case "assessments":
      return (
        <RecordList<AssessmentResultDto>
          queryKey={queryKeys.assessments}
          fetchPage={(cursor) => api.assessments({ limit: PAGE_SIZE, cursor })}
          remove={api.deleteAssessment}
          noun="result"
          empty="No assessment results yet."
          editPath={(r) => `/assessments/${r.id}/edit`}
          render={(r) => <AssessmentSummary result={r} />}
        />
      );
  }
}

interface RecordListProps<T extends { id: string }> {
  queryKey: QueryKey;
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>;
  remove: (id: string) => Promise<void>;
  noun: string;
  empty: string;
  editPath: (item: T) => string;
  render: (item: T) => ReactNode;
}

function RecordList<T extends { id: string }>({ queryKey, fetchPage, remove, noun, empty, editPath, render }: RecordListProps<T>) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: [...queryKey, "list"],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const del = useMutation({
    mutationFn: remove,
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: () => setError(`We couldn't delete that ${noun}. Please try again.`),
  });

  function confirmDelete(item: T) {
    if (window.confirm(`Delete this ${noun}? This cannot be undone.`)) del.mutate(item.id);
  }

  if (list.isPending) return <p className="text-slate-500">Loading…</p>;
  if (list.isError) return <p className="text-red-700">We couldn't load your history. Please refresh.</p>;

  const items = list.data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <p className="text-slate-500">{empty}</p>;

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <Card>
              {render(item)}
              <div className="mt-3 flex gap-2">
                <Link
                  to={editPath(item)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Edit
                </Link>
                <SecondaryButton
                  onClick={() => confirmDelete(item)}
                  disabled={del.isPending}
                  className="py-1.5 text-red-800"
                >
                  Delete
                </SecondaryButton>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <SecondaryButton onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} className="w-full">
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </SecondaryButton>
      )}
    </div>
  );
}

/** Groups consecutive sets of the same exercise: "Back squat · 3 sets · best 100 kg × 5". */
function WorkoutSummary({ workout }: { workout: WorkoutDto }) {
  const groups: { name: string; sets: WorkoutDto["sets"] }[] = [];
  for (const s of workout.sets) {
    const last = groups.at(-1);
    if (last && last.name === s.exerciseName) last.sets.push(s);
    else groups.push({ name: s.exerciseName, sets: [s] });
  }
  return (
    <div>
      <h2 className="font-semibold">{formatTrainingDate(workout.workoutDate)}</h2>
      <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
        {groups.map((g, i) => {
          const best = g.sets.reduce((a, b) => (b.loadKg > a.loadKg ? b : a));
          return (
            <li key={i}>
              {g.name} · {g.sets.length} {g.sets.length === 1 ? "set" : "sets"}
              {best.loadValue > 0 && ` · best ${formatNumber(best.loadValue)} ${best.loadUnit} × ${best.reps}`}
            </li>
          );
        })}
      </ul>
      {workout.notes && <p className="mt-1 text-sm text-slate-500">{workout.notes}</p>}
    </div>
  );
}

function ConditioningSummary({ session }: { session: ConditioningSessionDto }) {
  return (
    <div>
      <h2 className="font-semibold">
        {formatTrainingDate(session.sessionDate)} · {CONDITIONING_TYPE_LABELS[session.type]}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {formatDuration(session.durationS)}
        {session.distanceValue !== null && ` · ${formatNumber(session.distanceValue)} ${session.distanceUnit}`}
        {` · RPE ${session.sessionRpe}`}
      </p>
      {session.notes && <p className="mt-1 text-sm text-slate-500">{session.notes}</p>}
    </div>
  );
}

function AssessmentSummary({ result }: { result: AssessmentResultDto }) {
  const definition = ASSESSMENT_DEFINITIONS.find((d) => d.id === result.definitionId);
  return (
    <div>
      <h2 className="font-semibold">
        {formatTrainingDate(result.assessedOn)} · {definition?.name ?? result.definitionId}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        <span className="text-base font-semibold">
          {formatNumber(result.value)} {result.unit}
        </span>{" "}
        · {methodLabel(result.method)}
      </p>
      {result.conditionsNote && <p className="mt-1 text-sm text-slate-500">{result.conditionsNote}</p>}
    </div>
  );
}
