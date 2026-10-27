import { ATHLETIC_GOALS, SPORTS } from "@plyntiq/shared";
import { Link } from "react-router";
import { Card } from "../components/ui";
import { useMe } from "../lib/use-me";

export function DashboardPage() {
  const { data: me } = useMe();
  if (!me?.profile) return null;
  const goal = ATHLETIC_GOALS.find((g) => g.id === me.profile!.primaryGoalId);
  const sport = SPORTS.find((s) => s.id === me.profile!.primarySportId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hi, {me.user.name}</h1>
        <p className="text-slate-600">{sport?.name}</p>
      </div>
      <Card>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Your goal</p>
        <p className="mt-1 text-xl font-semibold">{goal?.name}</p>
        <Link to="/onboarding" className="mt-2 inline-block text-sm text-emerald-800 underline">
          Change goal
        </Link>
      </Card>
      <Card>
        <h2 className="font-semibold">Next steps</h2>
        <p className="mt-1 text-slate-600">
          Workout logging, conditioning and sprint and jump assessments are coming in the next milestone. Once you
          have recorded some data, your progress and Performance Translation report will show up here.
        </p>
      </Card>
    </div>
  );
}
