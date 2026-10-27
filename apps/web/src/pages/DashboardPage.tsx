import { ATHLETIC_GOALS, SPORTS } from "@plyntiq/shared";
import { Link } from "react-router";
import { Card } from "../components/ui";
import { useMe } from "../lib/use-me";

const QUICK_LOG = [
  { to: "/workouts/new", label: "Workout" },
  { to: "/conditioning/new", label: "Conditioning" },
  { to: "/assessments/new", label: "Sprint or jump test" },
];

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
        <h2 className="font-semibold">Log training</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {QUICK_LOG.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="rounded-lg bg-emerald-700 px-4 py-3 text-center font-medium text-white hover:bg-emerald-800"
            >
              {q.label}
            </Link>
          ))}
        </div>
        <Link to="/history" className="mt-3 inline-block text-sm text-emerald-800 underline">
          View history
        </Link>
      </Card>
      <Card>
        <h2 className="font-semibold">Coming next</h2>
        <p className="mt-1 text-slate-600">
          Once you have logged some sessions, your progress charts and Performance Translation report will show up
          here.
        </p>
      </Card>
    </div>
  );
}
