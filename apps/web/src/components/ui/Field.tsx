import type { ReactNode } from "react";

export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-fg-primary">{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-status-absent">{error}</span> : null}
    </label>
  );
}
