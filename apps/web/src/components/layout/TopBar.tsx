import type { ReactNode } from "react";

export function TopBar({ title, leftAction, rightAction }: { title: string; leftAction?: ReactNode; rightAction?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-muted px-3">
      <div className="flex min-w-11 items-center justify-start">{leftAction}</div>
      <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-fg-primary">{title}</h1>
      <div className="flex min-w-11 items-center justify-end">{rightAction}</div>
    </header>
  );
}
