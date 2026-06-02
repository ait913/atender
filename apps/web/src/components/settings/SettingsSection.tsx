import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">{title}</h2>
      <div
        className="overflow-hidden rounded-lg border divide-y divide-border-subtle"
        style={{
          borderColor: "var(--border-settings)",
          boxShadow: "var(--shadow-settings-panel)",
          background: "var(--color-bg-elevated)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({ label, onClick, danger, trailing }: { label: string; onClick: () => void; danger?: boolean; trailing?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-3 text-left transition active:scale-[0.99] hover:bg-fg-primary/4 ${danger ? "text-status-absent" : "text-fg-primary"}`}
    >
      <span className="text-sm font-bold">{label}</span>
      {trailing ?? <ChevronRight className="h-4 w-4 text-fg-tertiary" />}
    </button>
  );
}
