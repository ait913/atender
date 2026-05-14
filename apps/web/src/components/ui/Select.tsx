import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx("min-h-11 w-full rounded-sm border border-border-default bg-bg-elevated px-3 text-base text-fg-primary outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100", className)}
      {...props}
    />
  );
}
