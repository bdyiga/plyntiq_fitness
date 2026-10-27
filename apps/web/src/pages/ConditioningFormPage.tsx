import {
  CONDITIONING_TYPES,
  createConditioningSchema,
  DISTANCE_UNITS,
  formatDuration,
  parseDuration,
  UnitError,
  type ConditioningSessionDto,
  type DistanceUnit,
} from "@plyntiq/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, Card, Field, FormError, PageHeader, SelectField, TextAreaField } from "../components/ui";
import { api, ApiRequestError, queryKeys } from "../lib/api";
import { issuesByPath, localToday, parseNumber } from "../lib/format";
import { useMe } from "../lib/use-me";

export const CONDITIONING_TYPE_LABELS: Record<(typeof CONDITIONING_TYPES)[number], string> = {
  run: "Run",
  sprint: "Sprint session",
  intervals: "Intervals",
  other: "Other",
};

/** Foster CR-10 anchors shown next to each value. */
const CR10 = [
  [0, "Rest"],
  [1, "Very, very easy"],
  [2, "Easy"],
  [3, "Moderate"],
  [4, "Somewhat hard"],
  [5, "Hard"],
  [6, ""],
  [7, "Very hard"],
  [8, ""],
  [9, ""],
  [10, "Maximal"],
] as const;

/** Create (`/conditioning/new`) or edit (`/conditioning/:id/edit`) a session. */
export function ConditioningFormPage() {
  const { id } = useParams();
  const { data: me } = useMe();
  const existing = useQuery({
    queryKey: queryKeys.conditioningSession(id ?? ""),
    queryFn: () => api.conditioning(id!),
    enabled: Boolean(id),
  });

  if (id && existing.isPending) return <p className="text-slate-500">Loading…</p>;
  if (id && existing.isError) return <p className="text-red-700">We couldn't find that session.</p>;

  return (
    <ConditioningForm
      key={existing.data?.id ?? "new"}
      existing={existing.data}
      distanceUnit={me?.profile?.preferredDistanceUnit ?? "m"}
    />
  );
}

function ConditioningForm({
  existing,
  distanceUnit,
}: {
  existing: ConditioningSessionDto | undefined;
  distanceUnit: DistanceUnit;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sessionDate: existing?.sessionDate ?? localToday(),
    type: existing?.type ?? "run",
    duration: existing ? formatDuration(existing.durationS) : "",
    distanceValue: existing?.distanceValue == null ? "" : String(existing.distanceValue),
    distanceUnit: existing?.distanceUnit ?? distanceUnit,
    sessionRpe: existing ? String(existing.sessionRpe) : "",
    notes: existing?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = useMutation({
    mutationFn: (input: Parameters<typeof api.createConditioning>[0]) =>
      existing ? api.updateConditioning(existing.id, input) : api.createConditioning(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conditioning });
      navigate("/history?tab=conditioning");
    },
    onError: (err) => {
      setFormError(err.message);
      if (err instanceof ApiRequestError) setErrors(err.issues);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let durationS: number | undefined;
    try {
      durationS = form.duration.trim() ? parseDuration(form.duration) : undefined;
    } catch (err) {
      if (!(err instanceof UnitError)) throw err;
      setErrors({ durationS: err.message });
      setFormError("Please fix the highlighted fields.");
      return;
    }
    const distanceValue = parseNumber(form.distanceValue) ?? null;
    const parsed = createConditioningSchema.safeParse({
      sessionDate: form.sessionDate,
      type: form.type,
      durationS,
      distanceValue,
      distanceUnit: distanceValue === null ? null : form.distanceUnit,
      sessionRpe: parseNumber(form.sessionRpe),
      notes: form.notes,
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
      <PageHeader title={existing ? "Edit conditioning" : "Log conditioning"} />
      <FormError message={formError} />
      <Card>
        <div className="space-y-4">
          <Field
            label="Date"
            name="sessionDate"
            type="date"
            max={localToday()}
            value={form.sessionDate}
            onChange={(e) => set({ sessionDate: e.target.value })}
            error={errors.sessionDate}
          />
          <SelectField
            label="Type"
            name="type"
            value={form.type}
            onChange={(e) => set({ type: e.target.value as typeof form.type })}
            error={errors.type}
          >
            {CONDITIONING_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONDITIONING_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <Field
            label="Duration (mm:ss or h:mm:ss)"
            name="duration"
            inputMode="numeric"
            placeholder="30:00"
            value={form.duration}
            onChange={(e) => set({ duration: e.target.value })}
            error={errors.durationS}
          />
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field
              label="Distance (optional)"
              name="distanceValue"
              inputMode="decimal"
              value={form.distanceValue}
              onChange={(e) => set({ distanceValue: e.target.value })}
              error={errors.distanceValue ?? errors.distanceUnit}
            />
            <SelectField
              label="Unit"
              name="distanceUnit"
              value={form.distanceUnit}
              onChange={(e) => set({ distanceUnit: e.target.value as DistanceUnit })}
            >
              {DISTANCE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField
            label="How hard was the whole session? (RPE 0–10)"
            name="sessionRpe"
            value={form.sessionRpe}
            onChange={(e) => set({ sessionRpe: e.target.value })}
            error={errors.sessionRpe}
          >
            <option value="">Choose…</option>
            {/* Half-point values can arrive through the API; keep them selectable when editing. */}
            {form.sessionRpe && !Number.isInteger(Number(form.sessionRpe)) && (
              <option value={form.sessionRpe}>{form.sessionRpe}</option>
            )}
            {CR10.map(([value, anchor]) => (
              <option key={value} value={value}>
                {anchor ? `${value} – ${anchor}` : value}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Notes (optional)"
            name="notes"
            maxLength={2000}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            error={errors.notes}
          />
        </div>
      </Card>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving…" : existing ? "Save changes" : "Save session"}
      </Button>
    </form>
  );
}
