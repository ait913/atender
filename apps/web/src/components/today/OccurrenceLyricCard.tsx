import type { OccurrenceDto } from "@atender/shared";
import { minutesToTime, statusLongLabels } from "@/components/ui";

export function OccurrenceLyricCard({ occurrence, state }: { occurrence: OccurrenceDto; state: "past" | "current" | "future" | "next" }) {
  const stateClass = {
    past: "opacity-25 scale-95 -translate-y-2 bg-white/4",
    current: "opacity-100 bg-bg-elevated shadow-glow ring-2 ring-accent-500/40",
    next: "opacity-95 bg-bg-elevated shadow-card",
    future: "opacity-60 bg-white/5",
  }[state];
  const dotColor = {
    past: "bg-white/20",
    current: "bg-accent-500",
    next: "bg-accent-500/70",
    future: "bg-white/30",
  }[state];
  return (
    <li className="snap-center px-1 py-3 transition-all duration-500 ease-out">
      <article className={`overflow-hidden rounded-3xl p-5 transition-all duration-500 ${stateClass}`}>
        <div className="flex items-center gap-4">
          <div className="flex flex-shrink-0 flex-col items-center justify-center">
            <span className={`mb-2 h-2.5 w-2.5 rounded-full ${dotColor} ${state === "current" ? "shadow-glow" : ""}`} />
            <p className="text-4xl font-black leading-none tracking-tight">{occurrence.periodIndex}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-fg-tertiary">限</p>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-lg font-black leading-tight tracking-tight">{occurrence.courseName}</h2>
            <p className="mt-1 truncate text-sm font-medium text-fg-secondary">
              {occurrence.room ?? "教室未設定"}
            </p>
            <p className="mt-1 text-[11px] text-fg-tertiary">
              {minutesToTime(occurrence.startMinute)} – {minutesToTime(occurrence.endMinute)}
            </p>
          </div>
          {occurrence.status ? (
            <span className="flex-shrink-0 rounded-full bg-accent-500/20 px-2.5 py-1 text-[11px] font-bold text-accent-500">
              {statusLongLabels[occurrence.status]}
            </span>
          ) : null}
        </div>
      </article>
    </li>
  );
}
