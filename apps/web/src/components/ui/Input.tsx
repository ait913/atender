import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function Input({ className, error = false, ...props }: InputProps) {
  return (
    <input
      className={cx(
        "min-h-12 w-full rounded-[10px] border border-border-default bg-bg-elevated px-4 text-base font-medium text-fg-primary placeholder:text-fg-tertiary placeholder:font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 focus-visible:border-accent-500 disabled:opacity-50 disabled:cursor-not-allowed",
        error ? "border-status-absent focus-visible:outline-status-absent focus-visible:border-status-absent" : null,
        className,
      )}
      {...props}
    />
  );
}
