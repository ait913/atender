import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "./Input";

type FieldWrapperProps = { label: string; required?: boolean; children: ReactNode; hint?: ReactNode; className?: string };

export function Field(props: FieldWrapperProps | InputHTMLAttributes<HTMLInputElement>) {
  if (!("children" in props) && !("label" in props)) return <Input {...props} />;
  const { label, required, children, hint, className = "" } = props as FieldWrapperProps;
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-sm font-medium text-fg-secondary">
        {label}
        {required ? <span className="ml-1 text-status-absent">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-fg-tertiary">{hint}</span> : null}
    </label>
  );
}
