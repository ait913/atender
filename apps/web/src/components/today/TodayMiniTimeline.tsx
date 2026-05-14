import type { OccurrenceDto } from "@atender/shared";
import { useNavigate } from "@tanstack/react-router";
import { minutesToTime } from "@/lib/dayjs";

export function TodayMiniTimeline({ occurrences, date }: { occurrences: OccurrenceDto[]; date: string }) {
  const navigate = useNavigate();
  if (occurrences.length === 0) return null;
  const start = Math.min(...occurrences.map((item) => item.startMinute));
  const end = Math.max(...occurrences.map((item) => item.endMinute));
  const span = Math.max(end - start, 1);
  const day = new Date(`${date}T00:00:00+09:00`).getDay();

  return (
    <button
      type="button"
      className="w-full rounded-md border border-border-subtle bg-bg-elevated p-4 text-left shadow-card"
      onClick={() => {
        void navigate({ to: "/timetable" });
        window.history.replaceState(null, "", `/timetable?day=${day}`);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">今日の時間割</h2>
        <span className="text-xs text-fg-secondary">{minutesToTime(start)} - {minutesToTime(end)}</span>
      </div>
      <div className="relative mt-3 h-8 rounded-full bg-bg-muted">
        {occurrences.map((occurrence) => (
          <span
            key={occurrence.id}
            className="absolute top-1 h-6 rounded-full bg-accent-500"
            style={{
              left: `${((occurrence.startMinute - start) / span) * 100}%`,
              width: `${Math.max(((occurrence.endMinute - occurrence.startMinute) / span) * 100, 4)}%`,
              background: occurrence.color ?? "#10B981",
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-fg-secondary">
        {occurrences.map((occurrence) => <span key={occurrence.id}>{occurrence.periodIndex} {occurrence.courseName}</span>)}
      </div>
    </button>
  );
}
