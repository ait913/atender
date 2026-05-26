import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AvatarMenu } from "@/components/avatar/AvatarMenu";

export function TopBar({ leading, title }: { leading?: ReactNode; title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border-subtle bg-bg-muted/95 px-4 backdrop-blur md:h-14 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {leading ?? (
          <Link to="/" className="text-lg font-semibold text-fg-primary md:hidden">
            Atender
          </Link>
        )}
        {title ? <h1 className="truncate text-base font-semibold text-fg-primary">{title}</h1> : null}
      </div>
      <AvatarMenu />
    </header>
  );
}
