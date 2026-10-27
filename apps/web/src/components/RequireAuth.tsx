import { Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../lib/use-me";

/**
 * UX guard only — the API enforces authorization on every request.
 * Signed-out users go to /login; signed-in users without a profile go to onboarding.
 */
export function RequireAuth({ requireProfile = true }: { requireProfile?: boolean }) {
  const { data: me, isPending, isError } = useMe();
  const location = useLocation();

  if (isPending) return <p className="p-6 text-slate-500">Loading…</p>;
  if (isError) return <p className="p-6 text-red-700">We couldn't load your account. Please refresh.</p>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (requireProfile && !me.profile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
