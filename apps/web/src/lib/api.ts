import type {
  ApiError,
  AssessmentDefinitionDto,
  AssessmentResultDto,
  ConditioningSessionDto,
  CreateAssessmentInput,
  CreateConditioningInput,
  CreateExerciseInput,
  CreateWorkoutInput,
  ExerciseDto,
  MeDto,
  Page,
  UpdateAssessmentInput,
  UpdateConditioningInput,
  UpdateWorkoutInput,
  UpsertProfileInput,
  WorkoutDto,
} from "@plyntiq/shared";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `Request failed (${status})`);
  }

  /** Field-level issues keyed by path (e.g. "sets.0.reps"). */
  get issues(): Record<string, string> {
    return Object.fromEntries((this.body?.error.issues ?? []).map((i) => [i.path, i.message]));
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

function pageQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface PageParams {
  limit?: number;
  cursor?: string | undefined;
}

export const api = {
  me: () => request<MeDto>("/api/me"),
  saveProfile: (input: UpsertProfileInput) =>
    request<{ profile: MeDto["profile"] }>("/api/me/profile", json("PUT", input)),

  exercises: () => request<{ exercises: ExerciseDto[] }>("/api/exercises").then((r) => r.exercises),
  createExercise: (input: CreateExerciseInput) =>
    request<{ exercise: ExerciseDto }>("/api/exercises", json("POST", input)).then((r) => r.exercise),

  workouts: (p: PageParams = {}) => request<Page<WorkoutDto>>(`/api/workouts${pageQuery({ ...p })}`),
  workout: (id: string) =>
    request<{ workout: WorkoutDto }>(`/api/workouts/${encodeURIComponent(id)}`).then((r) => r.workout),
  createWorkout: (input: CreateWorkoutInput) =>
    request<{ workout: WorkoutDto }>("/api/workouts", json("POST", input)).then((r) => r.workout),
  updateWorkout: (id: string, input: UpdateWorkoutInput) =>
    request<{ workout: WorkoutDto }>(`/api/workouts/${encodeURIComponent(id)}`, json("PATCH", input)).then(
      (r) => r.workout,
    ),
  deleteWorkout: (id: string) => request<void>(`/api/workouts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  conditioningList: (p: PageParams = {}) =>
    request<Page<ConditioningSessionDto>>(`/api/conditioning${pageQuery({ ...p })}`),
  conditioning: (id: string) =>
    request<{ session: ConditioningSessionDto }>(`/api/conditioning/${encodeURIComponent(id)}`).then(
      (r) => r.session,
    ),
  createConditioning: (input: CreateConditioningInput) =>
    request<{ session: ConditioningSessionDto }>("/api/conditioning", json("POST", input)).then((r) => r.session),
  updateConditioning: (id: string, input: UpdateConditioningInput) =>
    request<{ session: ConditioningSessionDto }>(
      `/api/conditioning/${encodeURIComponent(id)}`,
      json("PATCH", input),
    ).then((r) => r.session),
  deleteConditioning: (id: string) =>
    request<void>(`/api/conditioning/${encodeURIComponent(id)}`, { method: "DELETE" }),

  assessmentDefinitions: () =>
    request<{ definitions: AssessmentDefinitionDto[] }>("/api/assessments/definitions").then((r) => r.definitions),
  assessments: (p: PageParams & { definitionId?: string } = {}) =>
    request<Page<AssessmentResultDto>>(`/api/assessments${pageQuery({ ...p })}`),
  assessment: (id: string) =>
    request<{ result: AssessmentResultDto }>(`/api/assessments/${encodeURIComponent(id)}`).then((r) => r.result),
  createAssessment: (input: CreateAssessmentInput) =>
    request<{ result: AssessmentResultDto }>("/api/assessments", json("POST", input)).then((r) => r.result),
  updateAssessment: (id: string, input: UpdateAssessmentInput) =>
    request<{ result: AssessmentResultDto }>(`/api/assessments/${encodeURIComponent(id)}`, json("PATCH", input)).then(
      (r) => r.result,
    ),
  deleteAssessment: (id: string) =>
    request<void>(`/api/assessments/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const queryKeys = {
  me: ["me"] as const,
  exercises: ["exercises"] as const,
  workouts: ["workouts"] as const,
  workout: (id: string) => ["workouts", id] as const,
  conditioning: ["conditioning"] as const,
  conditioningSession: (id: string) => ["conditioning", id] as const,
  assessmentDefinitions: ["assessment-definitions"] as const,
  assessments: ["assessments"] as const,
  assessment: (id: string) => ["assessments", id] as const,
};
