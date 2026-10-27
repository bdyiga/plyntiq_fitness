import {
  ASSESSMENT_DEFINITIONS,
  ASSESSMENT_FOOTWEAR,
  ASSESSMENT_METHODS,
  ASSESSMENT_SURFACES,
  createAssessmentSchema,
  heightUnitFor,
  type AssessmentDefinitionId,
  type AssessmentResultDto,
  type WeightUnit,
} from "@plyntiq/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Button, Card, Field, FormError, PageHeader, SelectField, TextAreaField } from "../components/ui";
import { api, ApiRequestError, queryKeys } from "../lib/api";
import { issuesByPath, localToday, parseNumber } from "../lib/format";
import { useMe } from "../lib/use-me";

type Definition = (typeof ASSESSMENT_DEFINITIONS)[number];

const definitionById = (id: string): Definition =>
  ASSESSMENT_DEFINITIONS.find((d) => d.id === id) ?? ASSESSMENT_DEFINITIONS[0];

/**
 * Create (`/assessments/new?test=vertical_jump`) or edit (`/assessments/:id/edit`)
 * a result. New results default the method, surface and footwear to the
 * athlete's previous result for the same test, so repeat tests stay comparable.
 */
export function AssessmentFormPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: me } = useMe();
  const weightUnit = me?.profile?.preferredWeightUnit ?? "kg";
  const definitionId = definitionById(params.get("test") ?? "").id;

  const existing = useQuery({
    queryKey: queryKeys.assessment(id ?? ""),
    queryFn: () => api.assessment(id!),
    enabled: Boolean(id),
  });
  const previous = useQuery({
    queryKey: [...queryKeys.assessments, "last", definitionId],
    queryFn: async () => (await api.assessments({ definitionId, limit: 1 })).items[0] ?? null,
    enabled: !id,
  });

  if (id) {
    if (existing.isPending) return <p className="text-slate-500">Loading…</p>;
    if (existing.isError) return <p className="text-red-700">We couldn't find that result.</p>;
    return <AssessmentForm key={existing.data.id} existing={existing.data} definitionId={existing.data.definitionId} weightUnit={weightUnit} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Log assessment" />
      <div role="radiogroup" aria-label="Test" className="flex gap-2">
        {ASSESSMENT_DEFINITIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={d.id === definitionId}
            onClick={() => setParams({ test: d.id }, { replace: true })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              d.id === definitionId ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>
      {previous.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <AssessmentForm
          key={definitionId}
          definitionId={definitionId}
          previous={previous.data ?? null}
          weightUnit={weightUnit}
        />
      )}
    </div>
  );
}

interface AssessmentFormProps {
  definitionId: AssessmentDefinitionId;
  existing?: AssessmentResultDto;
  previous?: AssessmentResultDto | null;
  weightUnit: WeightUnit;
}

function AssessmentForm({ definitionId, existing, previous, weightUnit }: AssessmentFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const definition = definitionById(definitionId);
  const defaultUnit = definition.id === "vertical_jump" ? heightUnitFor(weightUnit) : definition.units[0];
  const base = existing ?? previous;

  const [form, setForm] = useState({
    assessedOn: existing?.assessedOn ?? localToday(),
    value: existing ? String(existing.value) : "",
    unit: existing?.unit ?? defaultUnit,
    method: base?.method ?? "",
    surface: base?.surface ?? "",
    footwear: base?.footwear ?? "",
    conditionsNote: existing?.conditionsNote ?? "",
    notes: existing?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = useMutation({
    mutationFn: (input: Parameters<typeof api.createAssessment>[0]) => {
      if (!existing) return api.createAssessment(input);
      const { definitionId: _fixed, ...patch } = input;
      return api.updateAssessment(existing.id, patch);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assessments });
      navigate("/history?tab=assessments");
    },
    onError: (err) => {
      setFormError(err.message);
      if (err instanceof ApiRequestError) setErrors(err.issues);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = createAssessmentSchema.safeParse({
      definitionId,
      assessedOn: form.assessedOn,
      value: parseNumber(form.value),
      unit: form.unit,
      method: form.method || undefined,
      surface: form.surface || null,
      footwear: form.footwear || null,
      conditionsNote: form.conditionsNote,
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
      {existing && <PageHeader title={`Edit ${definition.name.toLowerCase()}`} />}
      <FormError message={formError} />
      <Card>
        <div className="space-y-4">
          <Field
            label="Date"
            name="assessedOn"
            type="date"
            max={localToday()}
            value={form.assessedOn}
            onChange={(e) => set({ assessedOn: e.target.value })}
            error={errors.assessedOn}
          />
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field
              label={definition.id === "sprint_20m" ? "Time" : "Jump height"}
              name="value"
              inputMode="decimal"
              placeholder={definition.id === "sprint_20m" ? "3.10" : ""}
              value={form.value}
              onChange={(e) => set({ value: e.target.value })}
              error={errors.value ?? errors.unit}
            />
            <SelectField label="Unit" name="unit" value={form.unit} onChange={(e) => set({ unit: e.target.value as typeof form.unit })}>
              {definition.units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField
            label="How was it measured?"
            name="method"
            value={form.method}
            onChange={(e) => set({ method: e.target.value as typeof form.method })}
            error={errors.method}
          >
            <option value="">Choose…</option>
            {definition.methods.map((m) => (
              <option key={m} value={m}>
                {ASSESSMENT_METHODS[m]}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Surface"
              name="surface"
              value={form.surface}
              onChange={(e) => set({ surface: e.target.value as typeof form.surface })}
            >
              <option value="">Not recorded</option>
              {Object.entries(ASSESSMENT_SURFACES).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Footwear"
              name="footwear"
              value={form.footwear}
              onChange={(e) => set({ footwear: e.target.value as typeof form.footwear })}
            >
              <option value="">Not recorded</option>
              {Object.entries(ASSESSMENT_FOOTWEAR).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          <Field
            label="Conditions (optional)"
            name="conditionsNote"
            placeholder="e.g. wet grass, light headwind"
            maxLength={200}
            value={form.conditionsNote}
            onChange={(e) => set({ conditionsNote: e.target.value })}
            error={errors.conditionsNote}
          />
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
        {save.isPending ? "Saving…" : existing ? "Save changes" : "Save result"}
      </Button>
    </form>
  );
}
