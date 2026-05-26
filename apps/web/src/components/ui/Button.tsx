import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  className = "",
  variant = "secondary",
  size = "md",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children?: ReactNode }) {
  const variants: Record<Variant, string> = {
    primary: "border-transparent bg-accent-500 text-fg-on-accent hover:bg-accent-600",
    secondary: "border-border-default bg-bg-elevated text-fg-primary hover:bg-bg-muted",
    destructive: "border-transparent bg-status-absent text-white hover:opacity-90 focus-visible:outline-status-absent",
    danger: "border-transparent bg-status-absent text-white hover:opacity-90 focus-visible:outline-status-absent",
    ghost: "border-transparent bg-transparent text-fg-secondary hover:bg-bg-muted hover:text-fg-primary",
  };
  const sizes: Record<Size, string> = {
    sm: "min-h-10 px-3 text-sm",
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-12 px-5 text-base",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
