import { ATHLETIC_GOALS, DISTANCE_UNITS, SPORTS, upsertProfileSchema, WEIGHT_UNITS } from "@plyntiq/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { AuthShell, Button, FormError } from "../components/ui";
import { api, queryKeys } from "../lib/api";
import { useMe } from "../lib/use-me";

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [error, setError] = useState<string | null>(null);
  const profile = me?.profile;

  const save = useMutation({
    mutationFn: api.saveProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = upsertProfileSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setError("Please choose an option for every question.");
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  }

  return (
    <AuthShell title="Set up your athlete profile">
      <form onSubmit={onSubmit} className="space-y-6">
        <FormError message={error} />
        <Fieldset legend="Primary sport" name="primarySportId" options={SPORTS} defaultValue={profile?.primarySportId} />
        <Fieldset
          legend="What do you most want to improve?"
          hint="Your goal shapes what we track. It isn't tied to your sport."
          name="primaryGoalId"
          options={ATHLETIC_GOALS}
          defaultValue={profile?.primaryGoalId}
        />
        <Fieldset
          legend="Weight unit"
          name="preferredWeightUnit"
          options={WEIGHT_UNITS.map((u) => ({ id: u, name: u }))}
          defaultValue={profile?.preferredWeightUnit ?? "kg"}
          inline
        />
        <Fieldset
          legend="Distance unit"
          name="preferredDistanceUnit"
          options={DISTANCE_UNITS.map((u) => ({ id: u, name: u }))}
          defaultValue={profile?.preferredDistanceUnit ?? "m"}
          inline
        />
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Continue"}
        </Button>
      </form>
    </AuthShell>
  );
}

interface FieldsetProps {
  legend: string;
  hint?: string;
  name: string;
  options: readonly { id: string; name: string }[];
  defaultValue?: string | undefined;
  inline?: boolean;
}

function Fieldset({ legend, hint, name, options, defaultValue, inline }: FieldsetProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{legend}</legend>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
      <div className={`mt-2 ${inline ? "flex gap-4" : "space-y-2"}`}>
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} value={o.id} defaultChecked={o.id === defaultValue} className="h-4 w-4 accent-emerald-700" />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
