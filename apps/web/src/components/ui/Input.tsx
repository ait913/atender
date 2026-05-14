import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx("min-h-11 w-full rounded-sm border border-border-default bg-bg-elevated px-3 text-base text-fg-primary outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100", className)}
      {...props}
    />
  );
}
