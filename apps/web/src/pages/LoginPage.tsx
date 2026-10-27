import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthShell, Button, Field, FormError } from "../components/ui";
import { queryKeys } from "../lib/api";
import { authClient } from "../lib/auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setSubmitting(false);
    if (error) {
      setError(error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Incorrect email or password.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith("/") ? from : "/dashboard", { replace: true });
  }

  return (
    <AuthShell title="Sign in">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-emerald-800 underline">
          Forgot password?
        </Link>
        <Link to="/register" className="text-emerald-800 underline">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}
