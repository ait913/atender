import type { CalendarEvent } from "@/lib/meetingExpansion";
import { assignLanes } from "@/lib/calendarLane";

export function CalendarDay({ events }: { date: string; events: CalendarEvent[] }) {
  const startHour = 9;
  const endHour = 21;
  const totalMinute = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const laneEvents = assignLanes(events);

  return (
    <div className="relative rounded-2xl bg-bg-elevated p-3 shadow-card">
      <div className="relative" style={{ height: `${(endHour - startHour) * 60}px` }}>
        {hours.map((hour) => (
          <div key={hour} className="absolute left-0 right-0 border-t border-fg-primary/8" style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}>
            <span className="absolute -top-2 left-0 w-10 text-xs font-bold text-fg-tertiary tabular-nums">{String(hour).padStart(2, "0")}</span>
          </div>
        ))}
        {laneEvents.map((event) => {
          const visibleStart = Math.max(event.startMinute, startHour * 60);
          const visibleEnd = Math.min(event.endMinute, endHour * 60);
          if (visibleEnd <= visibleStart) return null;
          const top = ((visibleStart - startHour * 60) / totalMinute) * 100;
          const height = ((visibleEnd - visibleStart) / totalMinute) * 100;
          const laneWidth = 88 / event.laneCount;
          const color = event.kind === "meeting" ? event.memberColor : event.authorColor;

          const subColor = `color-mix(in srgb, ${color} 70%, var(--event-mix-target))`;
          const tint = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}26` : "rgba(255,255,255,0.08)";
          return (
            <div
              key={event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.startMinute}` : `e:${event.eventId}`}
              className="absolute overflow-hidden rounded-xl"
              style={{
                top: `${top}%`,
                height: `${height}%`,
                left: `${12 + event.lane * laneWidth}%`,
                width: `calc(${laneWidth}% - 2px)`,
                background: tint,
                borderLeft: `3px solid ${color}`,
              }}
              title={event.kind === "meeting" ? `${event.courseName} (${event.memberName})` : event.title}
            >
              <div className="flex h-full flex-col gap-0.5 pl-2 pr-2 py-1.5">
                <p className="truncate text-[12px] font-semibold leading-snug text-fg-primary">
                  {event.kind === "meeting" ? event.courseName : event.title}
                </p>
                <p className="truncate text-[10px] leading-tight" style={{ color: subColor }}>
                  {event.kind === "meeting" ? event.memberName : event.authorName} · {formatMinute(event.startMinute)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
