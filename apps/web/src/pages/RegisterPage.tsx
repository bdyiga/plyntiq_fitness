import { PRIVACY_POLICY_VERSION, registerFormSchema } from "@plyntiq/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AuthShell, Button, Field, FormError } from "../components/ui";
import { queryKeys } from "../lib/api";
import { authClient } from "../lib/auth-client";

type FieldErrors = Partial<Record<string, string>>;

export function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = registerFormSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      adultConfirmed: form.get("adultConfirmed") === "on",
      privacyAccepted: form.get("privacyAccepted") === "on",
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    const { error } = await authClient.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      adultConfirmed: true,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    });
    setSubmitting(false);
    if (error) {
      setFormError(error.message ?? "Registration failed. Please try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    navigate("/onboarding");
  }

  return (
    <AuthShell title="Create your account">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Name" name="name" autoComplete="name" error={fieldErrors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" error={fieldErrors.email} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" error={fieldErrors.password} />
        <Checkbox name="adultConfirmed" label="I am 18 or older" error={fieldErrors.adultConfirmed} />
        <Checkbox
          name="privacyAccepted"
          label="I have read the privacy notice and agree to Plyntiq storing my training data to provide the service"
          error={fieldErrors.privacyAccepted}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-emerald-800 underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function Checkbox({ name, label, error }: { name: string; label: string; error?: string | undefined }) {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name={name} className="mt-0.5 h-4 w-4 accent-emerald-700" aria-invalid={error ? true : undefined} />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
