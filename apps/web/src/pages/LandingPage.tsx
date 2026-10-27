import { Link } from "react-router";

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Plyntiq</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
        Is your training making you a better athlete?
      </h1>
      <p className="mt-5 text-lg text-slate-600">
        Log your gym and conditioning work, test your sprint and jump, and see how your training and your
        performance change over the same period. You get plain explanations and clear limits, and no expensive
        wearables are needed.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/register" className="rounded-lg bg-emerald-700 px-5 py-3 text-center font-medium text-white hover:bg-emerald-800">
          Create an account
        </Link>
        <Link to="/login" className="rounded-lg border border-slate-300 px-5 py-3 text-center font-medium hover:bg-white">
          Sign in
        </Link>
      </div>
    </main>
  );
}
