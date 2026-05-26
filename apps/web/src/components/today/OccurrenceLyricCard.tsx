import type { OccurrenceDto } from "@atender/shared";
import { minutesToTime, statusLongLabels } from "@/components/ui";

export function OccurrenceLyricCard({ occurrence, state }: { occurrence: OccurrenceDto; state: "past" | "current" | "future" | "next" }) {
  const stateClass = {
    past: "opacity-25 scale-90 -translate-y-2 bg-white/4",
    current: "opacity-100 scale-105 bg-bg-elevated shadow-glow",
    next: "opacity-95 scale-100 bg-bg-elevated shadow-card",
    future: "opacity-60 scale-100 bg-white/5",
  }[state];
  const dotColor = {
    past: "bg-white/20",
    current: "bg-accent-500",
    next: "bg-accent-500/70",
    future: "bg-white/30",
  }[state];
  return (
    <li className="snap-center py-4 transition-all duration-500 ease-out">
      <article className={`rounded-3xl p-6 transition-all duration-500 ${stateClass}`}>
        <div className="flex items-center gap-5">
          <div className="flex flex-col items-center justify-center">
            <span className={`mb-2 h-3 w-3 rounded-full ${dotColor} ${state === "current" ? "shadow-glow" : ""}`} />
            <p className="text-5xl font-black leading-none tracking-tight">{occurrence.periodIndex}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-fg-tertiary">限</p>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black leading-tight tracking-tight">{occurrence.courseName}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium text-fg-secondary">
              <span className="inline-block h-1 w-1 rounded-full bg-white/30" />
              <span>{occurrence.room ?? "教室未設定"}</span>
            </p>
            <p className="mt-2 text-xs text-fg-tertiary">
              {minutesToTime(occurrence.startMinute)} – {minutesToTime(occurrence.endMinute)}
            </p>
          </div>
          {occurrence.status ? (
            <span className="rounded-full bg-accent-500/20 px-3 py-1.5 text-xs font-bold text-accent-500">
              {statusLongLabels[occurrence.status]}
            </span>
          ) : null}
        </div>
      </article>
    </li>
  );
}
