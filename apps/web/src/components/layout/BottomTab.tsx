import { Link, useRouterState } from "@tanstack/react-router";
import { useIsKeyboardOpen } from "@/lib/useIsKeyboardOpen";
import { isActivePath, navItems } from "./navItems";

export function BottomTab() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const keyboardOpen = useIsKeyboardOpen();
  if (keyboardOpen) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border-subtle bg-bg-muted pb-[env(safe-area-inset-bottom)] md:hidden">
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.to);
        return (
          <Link key={item.to} to={item.to} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-accent-600" : "text-fg-secondary"}`}>
            {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent-500" /> : null}
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
