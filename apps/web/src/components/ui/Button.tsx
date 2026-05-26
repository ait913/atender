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
    primary: "bg-accent-500 text-fg-on-accent shadow-glow-soft hover:bg-accent-600 hover:shadow-glow active:scale-[0.97]",
    secondary: "bg-white/8 text-fg-primary hover:bg-white/12 active:scale-[0.97]",
    destructive: "bg-status-absent text-white hover:opacity-90 active:scale-[0.97] focus-visible:outline-status-absent",
    danger: "bg-status-absent text-white hover:opacity-90 active:scale-[0.97] focus-visible:outline-status-absent",
    ghost: "bg-transparent text-fg-secondary hover:bg-white/6 hover:text-fg-primary active:scale-[0.97]",
  };
  const sizes: Record<Size, string> = {
    sm: "min-h-10 px-4 text-sm",
    md: "min-h-12 px-5 text-sm",
    lg: "min-h-14 px-6 text-base",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
