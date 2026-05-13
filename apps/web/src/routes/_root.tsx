import { Link, Outlet } from "@tanstack/react-router";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/timetable", label: "Timetable" },
  { to: "/templates", label: "Templates" },
  { to: "/stats", label: "Stats" },
  { to: "/settings", label: "Settings" },
] as const;

export function RootLayout() {
  return (
    <div className="min-h-screen pb-24 text-white md:pb-0">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link to="/" className="text-lg font-black underline-offset-4 hover:underline">
          Atender::
        </Link>
        <nav className="hidden gap-4 text-sm font-bold text-white/70 md:flex">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} activeProps={{ className: "text-white underline" }} className="underline-offset-4 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-10">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/12 bg-[#02040a]/95 text-center text-[11px] font-bold text-white/72 backdrop-blur md:hidden">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} activeProps={{ className: "text-white bg-white/10" }} className="px-1 py-3">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
