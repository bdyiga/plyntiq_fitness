import {
  createExerciseSchema,
  createWorkoutSchema,
  EXERCISE_CATEGORIES,
  WEIGHT_UNITS,
  type ExerciseDto,
  type WeightUnit,
  type WorkoutDto,
} from "@plyntiq/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Button,
  Card,
  Field,
  FormError,
  inputClass,
  PageHeader,
  SecondaryButton,
  SelectField,
  TextAreaField,
} from "../components/ui";
import { api, ApiRequestError, queryKeys } from "../lib/api";
import { issuesByPath, localToday, parseNumber } from "../lib/format";
import { useMe } from "../lib/use-me";

interface SetDraft {
  key: string;
  exerciseId: string;
  exerciseName: string;
  reps: string;
  loadValue: string;
  loadUnit: WeightUnit;
  rpe: string;
}

const newKey = () => crypto.randomUUID();

function draftsFrom(workout: WorkoutDto): SetDraft[] {
  return workout.sets.map((s) => ({
    key: newKey(),
    exerciseId: s.exerciseId,
    exerciseName: s.exerciseName,
    reps: String(s.reps),
    loadValue: String(s.loadValue),
    loadUnit: s.loadUnit,
    rpe: s.rpe === null ? "" : String(s.rpe),
  }));
}

/** Create (`/workouts/new`) or edit (`/workouts/:id/edit`) a workout. */
export function WorkoutLoggerPage() {
  const { id } = useParams();
  const { data: me } = useMe();
  const exercises = useQuery({ queryKey: queryKeys.exercises, queryFn: api.exercises });
  const existing = useQuery({
    queryKey: queryKeys.workout(id ?? ""),
    queryFn: () => api.workout(id!),
    enabled: Boolean(id),
  });
  const last = useQuery({
    queryKey: [...queryKeys.workouts, "last"],
    queryFn: async () => (await api.workouts({ limit: 1 })).items[0] ?? null,
    enabled: !id,
  });

  if (exercises.isPending || (id && existing.isPending)) return <p className="text-slate-500">Loading…</p>;
  if (exercises.isError || (id && existing.isError)) {
    return <p className="text-red-700">{id ? "We couldn't find that workout." : "We couldn't load exercises."}</p>;
  }

  return (
    <WorkoutForm
      key={existing.data?.id ?? "new"}
      existing={existing.data}
      exercises={exercises.data}
      lastWorkout={last.data ?? null}
      weightUnit={me?.profile?.preferredWeightUnit ?? "kg"}
    />
  );
}

interface WorkoutFormProps {
  existing: WorkoutDto | undefined;
  exercises: ExerciseDto[];
  lastWorkout: WorkoutDto | null;
  weightUnit: WeightUnit;
}

function WorkoutForm({ existing, exercises, lastWorkout, weightUnit }: WorkoutFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workoutDate, setWorkoutDate] = useState(existing?.workoutDate ?? localToday());
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [sets, setSets] = useState<SetDraft[]>(existing ? draftsFrom(existing) : []);
  const [pickerId, setPickerId] = useState(existing?.sets[0]?.exerciseId ?? exercises[0]?.id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: Parameters<typeof api.createWorkout>[0]) =>
      existing ? api.updateWorkout(existing.id, input) : api.createWorkout(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workouts });
      navigate("/history?tab=workouts");
    },
    onError: (err) => {
      setFormError(err.message);
      if (err instanceof ApiRequestError) setErrors(err.issues);
    },
  });

  /** Quick-add: copy the last set of the chosen exercise, so the next set is one tap. */
  function addSet() {
    const exercise = exercises.find((e) => e.id === pickerId);
    if (!exercise) return;
    const previous = sets.findLast((s) => s.exerciseId === exercise.id);
    setSets([
      ...sets,
      previous
        ? { ...previous, key: newKey() }
        : {
            key: newKey(),
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            reps: "5",
            loadValue: "",
            loadUnit: weightUnit,
            rpe: "",
          },
    ]);
  }

  function updateSet(index: number, patch: Partial<SetDraft>) {
    setSets(sets.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function duplicateSet(index: number) {
    const copy = { ...sets[index]!, key: newKey() };
    setSets([...sets.slice(0, index + 1), copy, ...sets.slice(index + 1)]);
  }

  function removeSet(index: number) {
    setSets(sets.filter((_, i) => i !== index));
    setErrors({});
  }

  function repeatLast() {
    if (!lastWorkout) return;
    if (sets.length > 0 && !window.confirm("Replace the sets you've entered with your last workout?")) return;
    setSets(draftsFrom(lastWorkout));
    setErrors({});
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = createWorkoutSchema.safeParse({
      workoutDate,
      notes,
      sets: sets.map((s) => ({
        exerciseId: s.exerciseId,
        reps: parseNumber(s.reps),
        loadValue: parseNumber(s.loadValue),
        loadUnit: s.loadUnit,
        rpe: parseNumber(s.rpe) ?? null,
      })),
    });
    if (!parsed.success) {
      setErrors(issuesByPath(parsed.error.issues));
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setFormError(null);
    save.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <PageHeader title={existing ? "Edit workout" : "Log workout"}>
        {!existing && lastWorkout && (
          <SecondaryButton onClick={repeatLast}>Repeat last workout</SecondaryButton>
        )}
      </PageHeader>
      <FormError message={formError} />

      <Card>
        <Field
          label="Date"
          name="workoutDate"
          type="date"
          value={workoutDate}
          max={localToday()}
          onChange={(e) => setWorkoutDate(e.target.value)}
          error={errors.workoutDate}
        />
      </Card>

      <Card>
        <h2 className="font-semibold">Sets</h2>
        {errors.sets && <p className="mt-1 text-sm text-red-700">{errors.sets}</p>}
        <ol className="mt-3 space-y-3">
          {sets.map((s, i) => (
            <SetRow
              key={s.key}
              index={i}
              set={s}
              errors={errors}
              onChange={(patch) => updateSet(i, patch)}
              onDuplicate={() => duplicateSet(i)}
              onRemove={() => removeSet(i)}
            />
          ))}
        </ol>
        {sets.length === 0 && <p className="mt-2 text-sm text-slate-500">No sets yet. Pick an exercise and add a set.</p>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SelectField label="Exercise" name="exercisePicker" value={pickerId} onChange={(e) => setPickerId(e.target.value)}>
              <ExerciseOptions exercises={exercises} />
            </SelectField>
          </div>
          <SecondaryButton onClick={addSet} className="py-2.5">
            Add set
          </SecondaryButton>
        </div>
        <CustomExerciseForm onCreated={(exercise) => setPickerId(exercise.id)} />
      </Card>

      <Card>
        <TextAreaField
          label="Notes (optional)"
          name="notes"
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
        />
      </Card>

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving…" : existing ? "Save changes" : "Save workout"}
      </Button>
    </form>
  );
}

interface SetRowProps {
  index: number;
  set: SetDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<SetDraft>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function SetRow({ index, set, errors, onChange, onDuplicate, onRemove }: SetRowProps) {
  const prefix = `sets.${index}`;
  const label = `Set ${index + 1}`;
  const rowErrors = [errors[`${prefix}.exerciseId`], errors[`${prefix}.reps`], errors[`${prefix}.loadValue`], errors[`${prefix}.rpe`]]
    .filter(Boolean)
    .join(" ");
  return (
    <li className="rounded-lg border border-slate-200 p-3" aria-label={`${label}: ${set.exerciseName}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="text-slate-500">{index + 1}.</span> {set.exerciseName}
        </p>
        <div className="flex gap-2">
          <SecondaryButton onClick={onDuplicate} aria-label={`Copy ${label.toLowerCase()}`} className="px-2 py-1">
            Copy
          </SecondaryButton>
          <SecondaryButton onClick={onRemove} aria-label={`Remove ${label.toLowerCase()}`} className="px-2 py-1">
            Remove
          </SecondaryButton>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <SmallInput
          label="Reps"
          srPrefix={label}
          inputMode="numeric"
          value={set.reps}
          invalid={Boolean(errors[`${prefix}.reps`])}
          onChange={(reps) => onChange({ reps })}
        />
        <div>
          <SmallInput
            label="Load"
            srPrefix={label}
            inputMode="decimal"
            value={set.loadValue}
            invalid={Boolean(errors[`${prefix}.loadValue`])}
            onChange={(loadValue) => onChange({ loadValue })}
          />
          <select
            aria-label={`${label} unit`}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-1 py-1 text-sm"
            value={set.loadUnit}
            onChange={(e) => onChange({ loadUnit: e.target.value as WeightUnit })}
          >
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <SmallInput
          label="RPE"
          srPrefix={label}
          inputMode="decimal"
          placeholder="opt."
          value={set.rpe}
          invalid={Boolean(errors[`${prefix}.rpe`])}
          onChange={(rpe) => onChange({ rpe })}
        />
      </div>
      {rowErrors && <p className="mt-2 text-sm text-red-700">{rowErrors}</p>}
    </li>
  );
}

interface SmallInputProps {
  label: string;
  srPrefix: string;
  value: string;
  invalid: boolean;
  inputMode: "numeric" | "decimal";
  placeholder?: string;
  onChange: (value: string) => void;
}

function SmallInput({ label, srPrefix, value, invalid, inputMode, placeholder, onChange }: SmallInputProps) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      <span className="sr-only">{srPrefix} </span>
      {label}
      <input
        type="text"
        inputMode={inputMode}
        className={`${inputClass} mt-0.5 px-2 py-1.5 ${invalid ? "border-red-600" : ""}`}
        aria-invalid={invalid || undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const categoryLabel = (c: string) => c[0]!.toUpperCase() + c.slice(1);

function ExerciseOptions({ exercises }: { exercises: ExerciseDto[] }) {
  const custom = exercises.filter((e) => e.isCustom);
  return (
    <>
      {custom.length > 0 && (
        <optgroup label="My exercises">
          {custom.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </optgroup>
      )}
      {EXERCISE_CATEGORIES.map((category) => {
        const inCategory = exercises.filter((e) => !e.isCustom && e.category === category);
        if (inCategory.length === 0) return null;
        return (
          <optgroup key={category} label={categoryLabel(category)}>
            {inCategory.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

function CustomExerciseForm({ onCreated }: { onCreated: (exercise: ExerciseDto) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [isLowerBody, setIsLowerBody] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: api.createExercise,
    onSuccess: async (exercise) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.exercises });
      setName("");
      setError(null);
      onCreated(exercise);
    },
    onError: (err) => setError(err.message),
  });

  function add() {
    const parsed = createExerciseSchema.safeParse({ name, category, isLowerBody });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the exercise details");
      return;
    }
    create.mutate(parsed.data);
  }

  // Not a nested <form>: the button submits through a click handler.
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-emerald-800 underline">Can't find it? Add your own exercise</summary>
      <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
        <FormError message={error} />
        <Field label="Exercise name" name="customName" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Movement" name="customCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXERCISE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </SelectField>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isLowerBody}
            onChange={(e) => setIsLowerBody(e.target.checked)}
            className="h-4 w-4 accent-emerald-700"
          />
          Mainly works the lower body
        </label>
        <SecondaryButton onClick={add} disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add exercise"}
        </SecondaryButton>
      </div>
    </details>
  );
}
