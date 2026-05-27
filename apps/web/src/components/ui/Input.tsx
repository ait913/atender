import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const controlClass =
  "min-h-14 w-full rounded-2xl border border-border-default bg-bg-muted px-5 py-3 text-base font-medium text-fg-primary outline-none transition placeholder:text-fg-tertiary focus:border-accent-500 focus:shadow-glow-soft disabled:opacity-50";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlClass} min-h-28 resize-y ${className}`} {...props} />;
}
