import { Link, useRouterState } from "@tanstack/react-router";
import { useIsKeyboardOpen } from "@/lib/useIsKeyboardOpen";
import { isActivePath, navItems } from "./navItems";

export function BottomTab() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const keyboardOpen = useIsKeyboardOpen();
  if (keyboardOpen) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around bg-bg-elevated/85 backdrop-blur-xl border-t border-border-subtle md:hidden"
      style={{
        height: "var(--tab-bar-height)",
        paddingTop: 8,
        paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.55)",
      }}
    >
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-1 flex-col items-center justify-end gap-1 py-1.5"
            aria-current={active ? "page" : undefined}
          >
            <span
              className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl leading-none transition-all duration-200 ${
                active
                  ? "bg-accent-500 text-fg-on-accent scale-105 shadow-glow"
                  : "bg-transparent text-fg-secondary group-hover:bg-white/5 group-active:scale-95"
              }`}
            >
              {item.icon}
            </span>
            <span
              className={`text-[11px] font-bold leading-none transition-opacity ${
                active ? "text-accent-500 opacity-100" : "text-fg-tertiary opacity-70"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
