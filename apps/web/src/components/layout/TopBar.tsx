import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function TopBar({ leading, title, trailing }: { leading?: ReactNode; title?: string; trailing?: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-30 flex h-12 items-center justify-between bg-bg-base/70 px-3 backdrop-blur-xl md:h-14 md:px-6"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading ?? (
          <Link to="/" className="flex items-center gap-1.5 md:hidden">
            <img src="/logo-mark.png" srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x" alt="" width={22} height={22} className="shrink-0" />
            <span className="text-lg font-black tracking-tight text-fg-primary">atender</span>
          </Link>
        )}
        {title ? <h1 className="truncate text-[15px] font-bold text-fg-primary">{title}</h1> : null}
      </div>
      {trailing ?? null}
    </header>
  );
}
