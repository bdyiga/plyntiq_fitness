import { NavLink, Outlet } from "react-router";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="font-bold tracking-tight text-emerald-800">Plyntiq</span>
          <ul className="flex gap-4 text-sm">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) => (isActive ? "font-semibold text-emerald-800" : "text-slate-600 hover:text-slate-900")}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
