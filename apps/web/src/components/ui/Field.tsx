import type { ReactNode } from "react";

export function Field({ label, error, required = false, children }: { label: string; error?: string | null; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-fg-secondary">
        {label}
        {required && <span className="text-status-absent ml-0.5" aria-hidden>*</span>}
      </span>
      {children}
      {error ? <span className="text-xs font-medium text-status-absent">{error}</span> : null}
    </label>
  );
}
