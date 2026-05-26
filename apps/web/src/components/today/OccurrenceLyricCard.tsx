import type { OccurrenceDto } from "@atender/shared";
import { minutesToTime, statusLongLabels } from "@/components/ui";

export function OccurrenceLyricCard({ occurrence, state }: { occurrence: OccurrenceDto; state: "past" | "current" | "future" | "next" }) {
  const stateClass = {
    past: "opacity-30 scale-90 -translate-y-2",
    current: "opacity-100 scale-105 ring-2 ring-accent-500 shadow-card",
    next: "opacity-100 scale-100 border-l-4 border-accent-500 shadow-card",
    future: "opacity-70 scale-100",
  }[state];
  return (
    <li className="snap-center py-6 transition-all duration-500 ease-out">
      <article className={`rounded-md border border-border-subtle bg-bg-elevated p-5 ${stateClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-fg-secondary">{occurrence.periodIndex}限</p>
            <p className="mt-0.5 text-xs text-fg-tertiary">{minutesToTime(occurrence.startMinute)}-{minutesToTime(occurrence.endMinute)}</p>
          </div>
          {occurrence.status ? <span className="rounded-full bg-accent-50 px-2 py-1 text-xs font-semibold text-accent-700">{statusLongLabels[occurrence.status]}</span> : null}
        </div>
        <h2 className="mt-4 text-xl font-bold leading-tight">{occurrence.courseName}</h2>
        <p className="mt-2 text-sm text-fg-secondary">{occurrence.room ?? "-"}</p>
      </article>
    </li>
  );
}
