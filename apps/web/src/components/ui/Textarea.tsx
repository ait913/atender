import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx("min-h-24 w-full rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-base text-fg-primary outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100", className)}
      {...props}
    />
  );
}
