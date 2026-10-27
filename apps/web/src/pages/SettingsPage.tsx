import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Field, FormError } from "../components/ui";
import { authClient } from "../lib/auth-client";
import { useMe } from "../lib/use-me";

export function SettingsPage() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    navigate("/", { replace: true });
  }

  async function deleteAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!window.confirm("Permanently delete your account and all of your training data? This cannot be undone.")) return;
    const { error } = await authClient.deleteUser({ password });
    if (error) {
      setDeleteError("We couldn't delete your account. Check your password and try again.");
      return;
    }
    queryClient.clear();
    navigate("/", { replace: true });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-slate-600">{me?.user.email}</p>
        <div className="mt-4 max-w-xs">
          <Button type="button" onClick={signOut} className="bg-slate-700 hover:bg-slate-800">
            Sign out
          </Button>
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-slate-600">Download everything Plyntiq stores about you as a JSON file.</p>
        <a href="/api/me/export" className="mt-3 inline-block font-medium text-emerald-800 underline">
          Export my data
        </a>
      </Card>
      <Card>
        <h2 className="font-semibold text-red-800">Delete account</h2>
        <p className="mt-1 text-slate-600">This permanently deletes your account, profile and all of your training records.</p>
        <form onSubmit={deleteAccount} className="mt-4 max-w-sm space-y-3">
          <FormError message={deleteError} />
          <Field label="Confirm with your password" name="password" type="password" autoComplete="current-password" required />
          <Button type="submit" className="bg-red-700 hover:bg-red-800">
            Delete my account
          </Button>
        </form>
      </Card>
    </div>
  );
}
