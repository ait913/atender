import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export function Textarea({ className, error = false, ...props }: TextareaProps) {
  return (
    <textarea
      className={cx(
        "min-h-24 w-full rounded-[10px] border border-border-default bg-bg-elevated px-4 text-base font-medium text-fg-primary placeholder:text-fg-tertiary placeholder:font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 focus-visible:border-accent-500 disabled:opacity-50 disabled:cursor-not-allowed",
        error ? "border-status-absent focus-visible:outline-status-absent focus-visible:border-status-absent" : null,
        className,
      )}
      {...props}
    />
  );
}
