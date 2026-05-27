import { Link, useRouterState } from "@tanstack/react-router";
import { isActivePath, navItems } from "./navItems";

export function SideNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border-subtle bg-bg-muted px-4 py-5 md:sticky md:top-0 md:block md:h-dvh md:overflow-y-auto">
      <Link to="/" className="mb-8 block px-3 text-lg font-semibold text-fg-primary">
        Atender
      </Link>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${active ? "bg-accent-50 text-accent-700" : "text-fg-secondary hover:bg-bg-base hover:text-fg-primary"}`}
            >
              <Icon className="h-5 w-5" strokeWidth={2.25} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
