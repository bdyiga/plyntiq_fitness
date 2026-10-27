import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthShell, Button, Field } from "../components/ui";
import { authClient } from "../lib/auth-client";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await authClient.requestPasswordReset({
      email: String(form.get("email") ?? ""),
      redirectTo: "/reset-password",
    });
    // Same message whether or not the email exists (no account enumeration).
    setSent(true);
  }

  return (
    <AuthShell title="Reset your password">
      {sent ? (
        <p className="text-slate-700">If an account exists for that email, we've sent a reset link. It expires in 30 minutes.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Button type="submit">Send reset link</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="text-emerald-800 underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
