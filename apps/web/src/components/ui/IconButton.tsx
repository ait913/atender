import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type IconButtonVariant = "plain" | "filled" | "danger";

const variants: Record<IconButtonVariant, string> = {
  plain: "text-fg-secondary hover:bg-bg-muted",
  filled: "bg-accent-50 text-accent-700 hover:bg-accent-100",
  danger: "bg-red-50 text-status-absent hover:bg-red-100 focus-visible:outline-status-absent",
};

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
};

export function IconButton({ label, icon, variant = "plain", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
