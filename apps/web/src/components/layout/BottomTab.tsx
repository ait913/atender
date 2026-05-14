import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";
import { navItems } from "./navItems";

function useIsKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setOpen(viewport.height < window.innerHeight - 100);
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  return open;
}

export function BottomTab() {
  const location = useLocation();
  const hidden = useIsKeyboardOpen();
  if (hidden) return null;
  return (
    <nav className="safe-pb fixed inset-x-0 bottom-0 z-40 flex min-h-14 border-t border-border-subtle bg-bg-muted md:hidden">
      {navItems.map((item) => {
        const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link key={item.to} to={item.to} className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1">
            <span className={cx("absolute inset-x-5 top-0 h-0.5 rounded-full", active && "bg-accent-500")} />
            <Icon className={cx("h-5 w-5", active ? "text-accent-500" : "text-fg-secondary")} strokeWidth={active ? 2.5 : 2} />
            <span className={cx("max-w-full truncate text-[11px]", active ? "font-semibold text-accent-500" : "text-fg-secondary")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
