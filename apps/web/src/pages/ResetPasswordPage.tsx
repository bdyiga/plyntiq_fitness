import { PASSWORD_MIN_LENGTH } from "@plyntiq/shared";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthShell, Button, Field, FormError } from "../components/ui";
import { authClient } from "../lib/auth-client";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? "This reset link is invalid or has expired." : null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    const { error } = await authClient.resetPassword({ newPassword, token: token ?? "" });
    if (error) setError("This reset link is invalid or has expired.");
    else setDone(true);
  }

  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <p className="text-slate-700">
          Your password has been changed and other sessions were signed out.{" "}
          <Link to="/login" className="text-emerald-800 underline">
            Sign in
          </Link>
        </p>
      ) : !token ? (
        <FormError message={error ?? "This reset link is missing its token."} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <FormError message={error} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" required />
          <Button type="submit">Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}
