import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function TopBar({ leading, title, trailing }: { leading?: ReactNode; title?: string; trailing?: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between bg-bg-base/70 px-5 backdrop-blur-xl md:h-16 md:px-8"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading ?? (
          <Link to="/" className="text-xl font-black tracking-tight text-fg-primary md:hidden">
            atender
          </Link>
        )}
        {title ? <h1 className="truncate text-lg font-bold text-fg-primary">{title}</h1> : null}
      </div>
      {trailing ?? null}
    </header>
  );
}
