import type { CalendarViewMode } from "@/lib/calendarRange";

export function CalendarSegmented({
  viewMode,
  onChange,
}: {
  viewMode: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-bg-muted p-1" role="tablist">
      {(["day", "week", "month"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={viewMode === mode}
          className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${
            viewMode === mode ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary hover:text-fg-primary"
          }`}
          onClick={() => onChange(mode)}
        >
          {mode === "day" ? "日" : mode === "week" ? "週" : "月"}
        </button>
      ))}
    </div>
  );
}
